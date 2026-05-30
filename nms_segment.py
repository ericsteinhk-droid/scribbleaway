"""
nms_segment.py — Run-aware paragraph extraction and translated-text reinsertion.

Design constraints (same as nms_preprocess.py):
  - NEVER use regex for XML edits. All tree surgery uses lxml.
  - Regex is used ONLY for DETECTION (non-translatable span masking).
  - Paragraph element references are kept live from extraction to reinsertion
    so no re-parse is needed and indices stay valid.

Placeholder convention:  ⟦0⟧ ⟦1⟧ …  (U+27E6 / U+27E7, rare in specs)
Minority-language runs and non-translatable spans are both masked as
placeholders before the segment is sent to the model, then restored after.

Reinsertion collapses all runs into a single run, preserving the rPr
(run properties) of the first non-empty original run.  Inline formatting
changes within a paragraph (e.g. mid-sentence bold) are lost; a flag is
added to the segment so the TN generator can surface this.  For NMS specs
this is a rare edge case — paragraph-level formatting is style-driven.

Bookmarks (<w:bookmarkStart> / <w:bookmarkEnd>) are preserved because they
may be cross-reference targets.  Everything else (proofErr, fldChar, etc.)
is removed along with runs.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
XML_NS = "http://www.w3.org/XML/1998/namespace"

# ---------------------------------------------------------------------------
# Non-translatable span patterns (DETECT only; never used for XML surgery)
# ---------------------------------------------------------------------------
_STANDARDS = re.compile(
    r"\b(?:CSA|ASTM|ANSI|ISO|CAN/ULC|ULC|UL|NFPA|IEC|IEEE|BS|DIN|CGSB|ONGC|NBS|AAMA|AISC|AISI|AWS|AWWA|SSPC|SMACNA|FM)\s*/?[A-Z]?\d[\w./\-]*",
    re.IGNORECASE,
)
_BLANKS = re.compile(r"\[[ _]{2,}\]")
_DIMENSIONS = re.compile(
    r"\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m²|m³|m|km|kg|g|mg|t\b|kN|MN\b|N\b|MPa|GPa|kPa|Pa\b|kJ|J\b|kW|W\b|L\b|mL|°C|°F|%)\b",
    re.IGNORECASE,
)
# Combine into one compiled pattern applied left-to-right
_NT_PATTERN = re.compile(
    r"(?:" + "|".join(p.pattern for p in [_STANDARDS, _BLANKS, _DIMENSIONS]) + r")",
    re.IGNORECASE,
)

# Tags whose presence inside a <w:p> will be removed during reinsertion
# (bookmarks are kept; pPr is kept)
_REMOVE_TAGS = frozenset({
    W + "r", W + "hyperlink", W + "proofErr", W + "del", W + "ins",
    W + "fldSimple", W + "sdt",
})
_KEEP_TAGS = frozenset({W + "pPr", W + "bookmarkStart", W + "bookmarkEnd"})


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass
class RunInfo:
    text: str
    lang: str | None
    rpr_xml: bytes | None  # serialized <w:rPr> element


@dataclass
class Segment:
    para_index: int
    element: Any                          # live lxml <w:p> element
    style_id: str
    style_type: str                       # "heading" | "body" | "other"
    source_text: str
    masked_text: str                      # source_text with placeholders
    placeholders: dict[int, str]          # {idx: original_text}
    is_translatable: bool
    mixed_lang_runs: list[tuple[str, str]]  # [(text, lang)]
    has_mixed_formatting: bool
    first_rpr_xml: bytes | None
    translated_text: str | None = None
    missing_placeholders: list[int] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _para_style(p: etree._Element) -> str:
    pPr = p.find(W + "pPr")
    if pPr is None:
        return ""
    ps = pPr.find(W + "pStyle")
    return ps.get(W + "val") if ps is not None else ""


def _collect_runs(p: etree._Element) -> list[RunInfo]:
    """Collect all runs (including those inside hyperlinks) in document order."""
    runs: list[RunInfo] = []
    for r in p.iter(W + "r"):
        texts = [t.text or "" for t in r.findall(W + "t")]
        text = "".join(texts)
        lang = None
        rpr_xml = None
        rpr = r.find(W + "rPr")
        if rpr is not None:
            lang_el = rpr.find(W + "lang")
            if lang_el is not None:
                lang = lang_el.get(W + "val") or lang_el.get(W + "bidi")
            rpr_xml = etree.tostring(rpr)
        if text:  # skip empty/formatting-only runs
            runs.append(RunInfo(text=text, lang=lang, rpr_xml=rpr_xml))
    return runs


def _mask_text(
    runs: list[RunInfo], source_lang_prefix: str
) -> tuple[str, str, dict[int, str], list[tuple[str, str]]]:
    """
    Build source_text and masked_text.
    Returns (source_text, masked_text, placeholders, mixed_runs_info).
    Minority-language runs and NT spans both become ⟦n⟧ placeholders.
    """
    placeholders: dict[int, str] = {}
    mixed_runs: list[tuple[str, str]] = []

    # Pass 1: minority-language runs
    source_text = ""
    masked_text = ""
    for r in runs:
        source_text += r.text
        is_minority = (
            r.lang is not None
            and not r.lang.lower().startswith(source_lang_prefix.lower())
        )
        if is_minority:
            idx = len(placeholders)
            placeholders[idx] = r.text
            masked_text += f"⟦{idx}⟧"
            mixed_runs.append((r.text, r.lang or "?"))
        else:
            masked_text += r.text

    # Pass 2: NT spans in the non-placeholder portions
    def _nt_replacer(m: re.Match) -> str:
        if "⟦" in m.group():
            return m.group()
        idx = len(placeholders)
        placeholders[idx] = m.group()
        return f"⟦{idx}⟧"

    masked_text = _NT_PATTERN.sub(_nt_replacer, masked_text)
    return source_text, masked_text, placeholders, mixed_runs


def _restore_placeholders(text: str, placeholders: dict[int, str]) -> tuple[str, list[int]]:
    """Replace ⟦n⟧ markers with original text. Returns (restored, missing_indices)."""
    missing: list[int] = []
    for idx in sorted(placeholders):
        marker = f"⟦{idx}⟧"
        if marker in text:
            text = text.replace(marker, placeholders[idx])
        else:
            missing.append(idx)
    return text, missing


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def extract_segments(
    work_dir: str,
    heading_styleids: set[str],
    source_lang: str,
) -> tuple[Any, list[Segment]]:
    """
    Parse document.xml, return (live_tree, segments).
    Keep `live_tree` open and pass it to apply_translations — do NOT re-parse.
    source_lang: e.g. "fr-CA" or "fr-FR"
    """
    import os

    path = os.path.join(work_dir, "word", "document.xml")
    tree = etree.parse(path)
    root = tree.getroot()
    lang_prefix = source_lang[:2].lower()  # "fr" or "en"

    segments: list[Segment] = []
    for idx, p in enumerate(root.iter(W + "p")):
        style_id = _para_style(p)
        style_type = "heading" if style_id in heading_styleids else "body"

        runs = _collect_runs(p)
        if not runs:
            # Empty paragraph — pass through unchanged
            segments.append(
                Segment(
                    para_index=idx,
                    element=p,
                    style_id=style_id,
                    style_type=style_type,
                    source_text="",
                    masked_text="",
                    placeholders={},
                    is_translatable=False,
                    mixed_lang_runs=[],
                    has_mixed_formatting=False,
                    first_rpr_xml=None,
                )
            )
            continue

        source_text, masked_text, placeholders, mixed_runs = _mask_text(runs, lang_prefix)

        # Detect mixed inline formatting (multiple distinct rPr)
        rprs = [r.rpr_xml for r in runs if r.rpr_xml]
        has_mixed_fmt = len(set(rprs)) > 1
        first_rpr = rprs[0] if rprs else None

        is_translatable = bool(source_text.strip())

        seg = Segment(
            para_index=idx,
            element=p,
            style_id=style_id,
            style_type=style_type,
            source_text=source_text,
            masked_text=masked_text,
            placeholders=placeholders,
            is_translatable=is_translatable,
            mixed_lang_runs=mixed_runs,
            has_mixed_formatting=has_mixed_fmt,
            first_rpr_xml=first_rpr,
        )

        if mixed_runs:
            seg.flags.append(
                f"Mixed-language run(s) detected and passed through unchanged: "
                + ", ".join(f'"{t}" ({l})' for t, l in mixed_runs)
            )
        if has_mixed_fmt:
            seg.flags.append(
                "Paragraph has multiple inline run formats (bold/italic mid-paragraph). "
                "Formatting collapsed to first-run style on reinsertion — verify visually."
            )

        segments.append(seg)

    return tree, segments


def apply_translations(
    tree: Any, work_dir: str, segments: list[Segment], target_lang: str
) -> None:
    """
    Rewrite translated paragraphs in the live tree, then save document.xml.
    target_lang: e.g. "en-CA" or "fr-CA"
    Only paragraphs where seg.translated_text differs from seg.source_text are touched.
    """
    import os

    for seg in segments:
        if seg.translated_text is None or seg.translated_text == seg.source_text:
            continue
        _rewrite_para(seg.element, seg.translated_text, seg.first_rpr_xml, target_lang)

    path = os.path.join(work_dir, "word", "document.xml")
    tree.write(path, xml_declaration=True, encoding="UTF-8", standalone=True)


def restore_and_postprocess(
    seg: Segment, raw_translation: str, direction: str
) -> str:
    """
    Restore placeholders and apply deterministic post-processing.
    Sets seg.missing_placeholders if any ⟦n⟧ were dropped by the model.
    Returns the final translated text.
    """
    restored, missing = _restore_placeholders(raw_translation, seg.placeholders)
    seg.missing_placeholders = missing
    if missing:
        seg.flags.append(
            f"Model dropped {len(missing)} placeholder(s) {missing}; "
            "original content may be missing — verify this paragraph."
        )
    return _post_process(restored, direction)


# ---------------------------------------------------------------------------
# Internal XML surgery (lxml only — no regex)
# ---------------------------------------------------------------------------
def _rewrite_para(
    p: etree._Element,
    translated: str,
    first_rpr_xml: bytes | None,
    target_lang: str,
) -> None:
    """Replace all run/content children with a single run containing translated text."""
    # Remove content elements (keep pPr and bookmarks)
    for child in list(p):
        if child.tag in _REMOVE_TAGS:
            p.remove(child)
        elif child.tag not in _KEEP_TAGS:
            p.remove(child)

    # Build new <w:r>
    new_r = etree.SubElement(p, W + "r")

    if first_rpr_xml is not None:
        rpr = etree.fromstring(first_rpr_xml)
        # Update language to target
        lang_el = rpr.find(W + "lang")
        if lang_el is not None:
            lang_el.set(W + "val", target_lang)
        else:
            lang_el = etree.SubElement(rpr, W + "lang")
            lang_el.set(W + "val", target_lang)
        new_r.insert(0, rpr)

    t = etree.SubElement(new_r, W + "t")
    t.text = translated
    # Preserve leading/trailing whitespace
    if translated and (translated[0].isspace() or translated[-1].isspace()):
        t.set(f"{{{XML_NS}}}space", "preserve")


# ---------------------------------------------------------------------------
# Deterministic post-processing (applied in code, not by the model)
# ---------------------------------------------------------------------------
def _post_process(text: str, direction: str) -> str:
    if direction == "fr→en":
        # Straight apostrophes per project rules (kerning workaround)
        text = text.replace("’", "'").replace("‘", "'")
        # Remove French NBSP before high punctuation
        for c in ":.;!?":
            text = text.replace(f" {c}", c).replace(f" {c}", c)
    return text
