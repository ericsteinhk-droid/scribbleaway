"""
nms_rtf.py — RTF translation for NMS/DDN construction specifications.

Handles the RTF subset produced by typical NMS spec authoring tools:
  - ANSI/Windows-1252 encoding (most common in Canadian spec files)
  - Style sheet with \s{n} style definitions
  - Flat paragraph structure: \pard...\par sequences
  - Inline formatting (bold, italic) — detected but stripped on write-back
    (same limitation as DOCX single-run collapse; flagged in TN)

Does NOT handle: complex nested tables, embedded OLE objects,
revision tracking marks, or RTF files encoded as UTF-8/Unicode-only.

Output format: RTF (same encoding as input).

Non-translatable span masking (CSA, ASTM, dimensions) is applied via
the same ⟦n⟧ placeholder system as the DOCX pipeline.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

from nms_segment import _NT_PATTERN, _restore_placeholders


# ---------------------------------------------------------------------------
# Encoding helpers
# ---------------------------------------------------------------------------
_HEX_RE = re.compile(r"\\\'([0-9a-fA-F]{2})")
_UNI_RE = re.compile(r"\\u(-?\d+)\??")
_CTRL_RE = re.compile(r"\\[a-zA-Z*]+(?:-?\d+)? ?")
_BRACES_RE = re.compile(r"[{}]")


def _rtf_decode(s: str) -> str:
    """Decode RTF text: hex escapes, unicode escapes, strip control words."""
    s = _HEX_RE.sub(lambda m: chr(int(m.group(1), 16)), s)
    s = _UNI_RE.sub(
        lambda m: chr(
            int(m.group(1)) + 65536 if int(m.group(1)) < 0 else int(m.group(1))
        ),
        s,
    )
    s = _CTRL_RE.sub("", s)
    s = _BRACES_RE.sub("", s)
    return s.strip()


def _rtf_encode(s: str) -> str:
    """Encode plain text for RTF: escape special chars, non-ASCII as \\'xx."""
    out = []
    for c in s:
        if c in "\\{}":
            out.append("\\" + c)
        elif ord(c) < 128:
            out.append(c)
        elif ord(c) < 256:
            out.append(f"\\'{ord(c):02x}")
        else:
            # Unicode: \uN? (? = ANSI fallback for readers that don't support Unicode)
            out.append(f"\\u{ord(c)}?")
    return "".join(out)


# ---------------------------------------------------------------------------
# Style sheet parser
# ---------------------------------------------------------------------------
def _parse_stylesheet(rtf: str) -> dict[int, str]:
    """
    Return {style_number: style_name} from the RTF {\\stylesheet...} block.
    Uses bracket matching so nested groups inside entries are handled correctly.
    """
    ss = rtf.find("\\stylesheet")
    if ss < 0:
        return {}
    ob = rtf.rfind("{", 0, ss)
    if ob < 0:
        return {}

    # Find closing brace of the stylesheet block
    depth = 0
    cb = ob
    for i in range(ob, min(ob + 100_000, len(rtf))):
        if rtf[i] == "{":
            depth += 1
        elif rtf[i] == "}":
            depth -= 1
            if depth == 0:
                cb = i
                break
    sheet = rtf[ob : cb + 1]

    styles: dict[int, str] = {}
    i = 1  # skip the stylesheet's own opening brace
    while i < len(sheet):
        if sheet[i] == "{":
            d2, j = 1, i + 1
            while j < len(sheet) and d2 > 0:
                if sheet[j] == "{":
                    d2 += 1
                elif sheet[j] == "}":
                    d2 -= 1
                j += 1
            entry = sheet[i:j]
            # Style entries begin with {\s{n} or {\*\cs{n}
            m = re.match(r"\{(?:\\\*\\cs|\\cs|)\\s(\d+)\b", entry)
            if m:
                n = int(m.group(1))
                semi = entry.rfind(";")
                if semi > 0 and n not in styles:
                    name = _rtf_decode(entry[1:semi]).strip()
                    if name:
                        styles[n] = name
            i = j
        else:
            i += 1
    return styles


# ---------------------------------------------------------------------------
# Paragraph data structure
# ---------------------------------------------------------------------------
@dataclass
class RtfPara:
    index: int
    style_n: int
    style_name: str
    text: str            # decoded plain text
    masked_text: str     # text with ⟦n⟧ placeholders
    placeholders: dict[int, str]
    raw: str             # original RTF span (\pard … \par)
    raw_start: int       # offset in original RTF string
    raw_end: int         # offset (exclusive)
    is_heading: bool = False
    is_spec_note: bool = False
    translated: str | None = None
    missing_placeholders: list[int] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Paragraph extractor
# ---------------------------------------------------------------------------
# Matches \pard...content...\par  (non-greedy, handles inline groups)
_PARA_RE = re.compile(
    r"\\pard\b(?:[^\\{}]|\\[a-zA-Z*]+(?:-?\d+)? ?|\\\'[0-9a-fA-F]{2}|[{}])*?\\par\b",
    re.DOTALL,
)
_STYLE_N_RE = re.compile(r"\\s(\d+)\b")
_FMT_PREFIX_RE = re.compile(r"^((?:\\[a-zA-Z*]+(?:-?\d+)? ?)*)")

_NOTE_PAT = re.compile(
    r"spec\s*note|note\s*spec|note\s*de\s*devis|r[ée]dacteur", re.I
)
_HEAD_PAT = re.compile(
    r"heading|titre|part\s*name|nom.*partie|nmstitle|section\s*title", re.I
)
_FR_DIACRITICS = re.compile(r"[àâçèéêëîïôùûüœæÀÂÇÈÉÊËÎÏÔÙÛÜŒÆ]")


def _mask_para_text(text: str) -> tuple[str, dict[int, str]]:
    """Apply NT-pattern placeholder masking to plain RTF paragraph text."""
    placeholders: dict[int, str] = {}

    def _replacer(m: re.Match) -> str:
        idx = len(placeholders)
        placeholders[idx] = m.group()
        return f"⟦{idx}⟧"

    masked = _NT_PATTERN.sub(_replacer, text)
    return masked, placeholders


def _extract_paragraphs(rtf: str, styles: dict[int, str]) -> list[RtfPara]:
    paras: list[RtfPara] = []
    for idx, m in enumerate(_PARA_RE.finditer(rtf)):
        raw = m.group(0)
        sn_m = _STYLE_N_RE.search(raw)
        style_n = int(sn_m.group(1)) if sn_m else 0
        style_name = styles.get(style_n, "")
        text = _rtf_decode(raw)
        masked, placeholders = _mask_para_text(text)
        paras.append(
            RtfPara(
                index=idx,
                style_n=style_n,
                style_name=style_name,
                text=text,
                masked_text=masked,
                placeholders=placeholders,
                raw=raw,
                raw_start=m.start(),
                raw_end=m.end(),
            )
        )

    # Classify styles
    heading_set: set[str] = set()
    note_set: set[str] = set()
    for p in paras:
        if _HEAD_PAT.search(p.style_name):
            heading_set.add(p.style_name)
        if _NOTE_PAT.search(p.style_name):
            note_set.add(p.style_name)
    for p in paras:
        p.is_heading = p.style_name in heading_set
        p.is_spec_note = p.style_name in note_set

    return paras


# ---------------------------------------------------------------------------
# RTF write-back
# ---------------------------------------------------------------------------
def _rebuild_para(para: RtfPara) -> str:
    """
    Return a new \\pard…\\par block with para.translated as text content.
    Paragraph-level formatting controls (style, indent, spacing) are kept;
    inline character formatting within the paragraph is dropped —
    the same limitation as DOCX single-run collapse, flagged in TN.
    """
    if para.translated is None:
        return para.raw
    body = para.raw[5:]  # skip \\pard
    m = _FMT_PREFIX_RE.match(body)
    fmt = m.group(1) if m else ""
    return f"\\pard{fmt}{_rtf_encode(para.translated)}\\par"


# ---------------------------------------------------------------------------
# Minimal StyleReport-compatible object for RTF (used by TN generator)
# ---------------------------------------------------------------------------
class RtfStyleReport:
    def __init__(
        self,
        source_lang: str,
        heading_styles: list[str],
        spec_note_styles: list[str],
    ):
        self.source_lang = source_lang
        self.heading_styles = [(None, None, s, None, None) for s in heading_styles]
        self.spec_note_styles = spec_note_styles
        self.empty_note_paras: list[int] = []
        self.notes: list[str] = [
            "Source was RTF format. Output is RTF. Verify layout in Word after translation.",
            "Inline character formatting (bold/italic mid-paragraph) is not preserved "
            "in RTF translation — paragraph-level formatting is kept.",
        ]
        if spec_note_styles:
            self.notes.append(
                f"Spec-note styles found: {spec_note_styles}. "
                "RTF pipeline does not strip spec-note paragraphs — review manually."
            )
        self.tracked_changes: dict = {}
        self.comments_removed: int = 0
        self.suffix_fixes: list = []


# ---------------------------------------------------------------------------
# Segment-compatible shim for checks + TN
# ---------------------------------------------------------------------------
def paras_to_segments(paras: list[RtfPara]):
    """Convert RtfPara list to duck-typed Segment objects for checks/TN."""
    from nms_segment import Segment

    segs = []
    for p in paras:
        s = Segment(
            para_index=p.index,
            element=None,
            style_id=p.style_name,
            style_type="heading" if p.is_heading else "body",
            source_text=p.text,
            masked_text=p.masked_text,
            placeholders=p.placeholders,
            is_translatable=bool(p.text.strip()),
            mixed_lang_runs=[],
            has_mixed_formatting=False,
            first_rpr_xml=None,
            translated_text=p.translated,
            missing_placeholders=p.missing_placeholders,
            flags=p.flags,
        )
        segs.append(s)
    return segs


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def translate_rtf(
    src_path: str,
    out_path: str,
    direction: str,
    client,
    lexicon: dict[str, str],
    log: Callable[[str], None] | None = None,
    progress_cb: Callable[[int, int], None] | None = None,
) -> tuple[RtfStyleReport, list[RtfPara]]:
    """
    Full RTF translation pipeline.
    Returns (RtfStyleReport, paragraphs) for checks + TN.
    """
    from nms_translate import build_system_prompt, _extract_flags
    from nms_segment import _post_process

    def _log(msg: str) -> None:
        if log:
            log(msg)

    with open(src_path, "r", encoding="cp1252", errors="replace") as f:
        rtf = f.read()

    styles = _parse_stylesheet(rtf)
    _log(f"  RTF styles parsed: {len(styles)} defined")

    paras = _extract_paragraphs(rtf, styles)
    heading_styles = list({p.style_name for p in paras if p.is_heading and p.style_name})
    spec_note_styles = list({p.style_name for p in paras if p.is_spec_note and p.style_name})
    _log(f"  Paragraphs: {len(paras)}, heading styles: {heading_styles}")
    if spec_note_styles:
        _log(f"  Spec-note styles: {spec_note_styles}")

    # Language detection: count French diacritics in the full text
    all_text = " ".join(p.text for p in paras)
    fr_hits = len(_FR_DIACRITICS.findall(all_text))
    source_lang = "fr-CA" if fr_hits > 10 else "en-CA"
    _log(f"  Source language (heuristic): {source_lang} ({fr_hits} FR diacritics)")

    report = RtfStyleReport(
        source_lang=source_lang,
        heading_styles=heading_styles,
        spec_note_styles=spec_note_styles,
    )

    translatable = [p for p in paras if p.text.strip()]
    total = len(translatable)
    done = 0
    _log(f"  {total} paragraphs to translate.")

    for i, para in enumerate(paras):
        if not para.text.strip():
            para.translated = para.text
            continue

        if para.is_spec_note and para.text.strip():
            _log(
                f"  [UNTESTED PATH] Translating populated spec-note "
                f"(para {i}, style '{para.style_name}'). Verify carefully."
            )
            para.flags.append(
                "[UNTESTED PATH] Populated spec-note — not validated on real content."
            )

        prev_text = paras[i - 1].text if i > 0 else None
        next_text = paras[i + 1].text if i < len(paras) - 1 else None

        sys_prompt = build_system_prompt(
            direction, "heading" if para.is_heading else "body", lexicon
        )
        parts = []
        if prev_text:
            parts.append(f"[CONTEXT BEFORE]\n{prev_text}\n")
        parts.append(f"[TRANSLATE THIS]\n{para.masked_text}")
        if next_text:
            parts.append(f"\n[CONTEXT AFTER]\n{next_text}")

        response = client.translate(sys_prompt, "\n".join(parts))
        raw, model_flags = _extract_flags(response.translated)
        para.flags.extend(model_flags)

        restored, missing = _restore_placeholders(raw.strip(), para.placeholders)
        para.missing_placeholders = missing
        if missing:
            para.flags.append(
                f"Model dropped placeholder(s) {missing}; "
                "original content may be missing — verify this paragraph."
            )
        para.translated = _post_process(restored, direction)

        done += 1
        _log(f"  [{done}/{total}] para {i} ({para.style_name or 'unstyled'})")
        if progress_cb:
            progress_cb(done, total)

    # Write back: replace in reverse order to preserve offsets
    rtf_out = rtf
    for para in reversed(paras):
        rtf_out = rtf_out[: para.raw_start] + _rebuild_para(para) + rtf_out[para.raw_end :]

    with open(out_path, "w", encoding="cp1252", errors="replace") as f:
        f.write(rtf_out)

    _log(f"  Written: {out_path}")
    return report, paras
