"""
nms_checks.py — Eight deterministic post-translation self-checks.

All checks are pure Python / lxml.  No API calls.
Output: list of FAIL strings.  Caller prints "All checks passed." if empty.

Checks:
  1. paragraph_count   — translated para count == source para count
  2. bracket_integrity — [ ] counts match per paragraph
  3. placeholder_fidelity — no ⟦n⟧ left unreplaced in output
  4. mandatory_language — shall↔doit mapping present where expected
  5. no_source_language — common source-lang words absent from output
  6. terminology        — lexicon terms translated correctly
  7. style_coverage     — every translated <w:p> has a <w:pStyle> or default
  8. heading_numbering  — numeric prefix preserved in heading paragraphs
"""
from __future__ import annotations

import os
import re
from lxml import etree

from nms_segment import Segment

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# ---------------------------------------------------------------------------
# Word lists for source-language detection
# ---------------------------------------------------------------------------
_FR_COMMON = frozenset(
    "le la les un une des du au aux est sont de et en pour avec dans sur par "
    "que qui mais ou car donc or ni se sa son ses leur leurs cette ces cet "
    "nous vous ils elles avoir être faire".split()
)
_EN_COMMON = frozenset(
    "the a an is are was were be been being have has had do does did will "
    "would could should shall may might must and or but not this that these "
    "those their they them its we our with from".split()
)

_MANDATORY_EN = re.compile(r"\bshall\b", re.IGNORECASE)
_MANDATORY_FR = re.compile(r"\b(?:doit|devra|doivent)\b", re.IGNORECASE)
_PLACEHOLDER_RE = re.compile(r"⟦\d+⟧")
_WORD_RE = re.compile(r"\b[a-zA-ZÀ-ÿ]{3,}\b")
_LEADING_NUM = re.compile(r"^\s*\d[\d\s.]*")


def _word_tokens(text: str) -> list[str]:
    return [m.group().lower() for m in _WORD_RE.finditer(text)]


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------
def check_paragraph_count(segments: list[Segment]) -> list[str]:
    missing = [s.para_index for s in segments if s.translated_text is None]
    if missing:
        return [f"PARAGRAPH COUNT: {len(missing)} paragraph(s) have no translated_text: {missing}"]
    return []


def check_bracket_integrity(segments: list[Segment]) -> list[str]:
    fails = []
    for s in segments:
        if s.translated_text is None:
            continue
        src_open = s.source_text.count("[")
        src_close = s.source_text.count("]")
        tgt_open = s.translated_text.count("[")
        tgt_close = s.translated_text.count("]")
        if src_open != tgt_open or src_close != tgt_close:
            fails.append(
                f"BRACKET INTEGRITY para {s.para_index}: "
                f"source [{src_open}[ {src_close}]] "
                f"translated [{tgt_open}[ {tgt_close}]]"
            )
    return fails


def check_placeholder_fidelity(segments: list[Segment]) -> list[str]:
    fails = []
    for s in segments:
        if s.missing_placeholders:
            fails.append(
                f"PLACEHOLDER FIDELITY para {s.para_index}: "
                f"placeholder(s) {s.missing_placeholders} were dropped by the model."
            )
        if s.translated_text and _PLACEHOLDER_RE.search(s.translated_text):
            fails.append(
                f"PLACEHOLDER FIDELITY para {s.para_index}: "
                f"unreplaced ⟦n⟧ marker(s) found in translated text."
            )
    return fails


def check_mandatory_language(segments: list[Segment], direction: str) -> list[str]:
    """
    FR→EN: flag if "shall" appears in output (current NMS standard uses imperative mood).
    EN→FR: flag if source has "shall" but output lacks doit/devra.
    """
    fails = []
    for s in segments:
        if not s.source_text.strip() or s.translated_text is None:
            continue
        if direction == "fr→en":
            if _MANDATORY_EN.search(s.translated_text):
                fails.append(
                    f"MANDATORY LANGUAGE para {s.para_index}: "
                    "'shall' found in EN output — current NMS standard requires imperative mood."
                )
        else:
            if _MANDATORY_EN.search(s.source_text) and not _MANDATORY_FR.search(s.translated_text):
                fails.append(
                    f"MANDATORY LANGUAGE para {s.para_index}: "
                    "source has 'shall' but translated text lacks doit/devra."
                )
    return fails


def check_no_source_language(segments: list[Segment], direction: str) -> list[str]:
    """
    Detect obvious source-language spillover.  Only flags paragraphs where ≥3
    distinct common source-language words appear in the output, to avoid false
    positives from proper nouns and bilingual terms.
    """
    fails = []
    src_words = _FR_COMMON if direction == "fr→en" else _EN_COMMON
    for s in segments:
        if not s.translated_text or not s.translated_text.strip():
            continue
        tokens = set(_word_tokens(s.translated_text))
        hits = tokens & src_words
        if len(hits) >= 3:
            fails.append(
                f"SOURCE LANGUAGE SPILLOVER para {s.para_index} ({s.style_id}): "
                f"≥3 source-language words in output: {sorted(hits)[:6]}"
            )
    return fails


def check_terminology(
    segments: list[Segment], lexicon: dict[str, str], direction: str
) -> list[str]:
    """
    For each segment where a lexicon source term appears, verify the expected
    target term appears in the translated output.
    """
    fails = []
    for s in segments:
        if s.translated_text is None:
            continue
        src_lower = s.source_text.lower()
        tgt_lower = s.translated_text.lower()
        for en_term, fr_term in lexicon.items():
            if direction == "fr→en":
                if fr_term.lower() in src_lower and en_term.lower() not in tgt_lower:
                    fails.append(
                        f"TERMINOLOGY para {s.para_index}: "
                        f"'{fr_term}' found in source but '{en_term}' not found in translation."
                    )
            else:
                if en_term.lower() in src_lower and fr_term.lower() not in tgt_lower:
                    fails.append(
                        f"TERMINOLOGY para {s.para_index}: "
                        f"'{en_term}' found in source but '{fr_term}' not found in translation."
                    )
    return fails


def check_style_coverage(work_dir: str, segments: list[Segment]) -> list[str]:
    """Verify every <w:p> in the translated XML has a pStyle or relies on Normal."""
    path = os.path.join(work_dir, "word", "document.xml")
    tree = etree.parse(path)
    root = tree.getroot()
    fails = []
    for idx, p in enumerate(root.iter(W + "p")):
        pPr = p.find(W + "pPr")
        has_style = pPr is not None and pPr.find(W + "pStyle") is not None
        if not has_style:
            # Inheriting Normal is acceptable — only flag if pPr is present but empty
            if pPr is not None and len(pPr) == 0:
                fails.append(
                    f"STYLE COVERAGE para {idx}: <w:pPr> present but empty (no pStyle)."
                )
    return fails


def check_heading_numbering(segments: list[Segment]) -> list[str]:
    """
    Heading paragraphs often start with a numeric prefix (e.g. "01 10 00").
    Verify the prefix is preserved in the translation.
    """
    fails = []
    for s in segments:
        if s.style_type != "heading" or not s.source_text.strip():
            continue
        src_match = _LEADING_NUM.match(s.source_text)
        if src_match is None:
            continue
        src_num = src_match.group().strip()
        if s.translated_text and not s.translated_text.strip().startswith(src_num):
            fails.append(
                f"HEADING NUMBERING para {s.para_index}: "
                f"numeric prefix '{src_num}' not preserved in translation."
            )
    return fails


# ---------------------------------------------------------------------------
# Auto-remediation
# ---------------------------------------------------------------------------
def remediate_heading_numbering(
    work_dir: str,
    segments: list[Segment],
    failures: list[str],
) -> int:
    """
    Re-open document.xml from work_dir and prepend any missing numeric prefixes
    to heading paragraphs identified by check_heading_numbering.
    Returns the number of paragraphs patched.
    """
    _HN_RE = re.compile(
        r"HEADING NUMBERING para (\d+): numeric prefix '([^']+)'"
    )
    fixes: dict[int, str] = {}
    for f in failures:
        m = _HN_RE.search(f)
        if m:
            fixes[int(m.group(1))] = m.group(2)
    if not fixes:
        return 0

    REMOVE_TAGS = frozenset({
        W + "r", W + "hyperlink", W + "proofErr", W + "del", W + "ins",
        W + "fldSimple", W + "sdt",
    })
    KEEP_TAGS = frozenset({W + "pPr", W + "bookmarkStart", W + "bookmarkEnd"})
    XML_NS = "http://www.w3.org/XML/1998/namespace"

    path = os.path.join(work_dir, "word", "document.xml")
    tree = etree.parse(path)
    root = tree.getroot()
    fixed = 0

    for idx, p in enumerate(root.iter(W + "p")):
        if idx not in fixes:
            continue
        prefix = fixes[idx]
        runs = list(p.iter(W + "r"))
        cur_text = "".join(
            "".join(t.text or "" for t in r.findall(W + "t"))
            for r in runs
        )
        if cur_text.strip().startswith(prefix):
            continue
        new_text = prefix + " " + cur_text.lstrip()
        first_rpr_xml = None
        for r in runs:
            rpr = r.find(W + "rPr")
            if rpr is not None:
                first_rpr_xml = etree.tostring(rpr)
                break
        for child in list(p):
            if child.tag in REMOVE_TAGS:
                p.remove(child)
            elif child.tag not in KEEP_TAGS:
                p.remove(child)
        new_r = etree.SubElement(p, W + "r")
        if first_rpr_xml is not None:
            rpr_el = etree.fromstring(first_rpr_xml)
            new_r.insert(0, rpr_el)
        t_el = etree.SubElement(new_r, W + "t")
        t_el.text = new_text
        if new_text and (new_text[0].isspace() or new_text[-1].isspace()):
            t_el.set(f"{{{XML_NS}}}space", "preserve")
        fixed += 1

    if fixed:
        tree.write(path, xml_declaration=True, encoding="UTF-8", standalone=True)
    return fixed


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def run_checks(
    work_dir: str,
    segments: list[Segment],
    lexicon: dict[str, str],
    direction: str,
) -> list[str]:
    """Run all 8 checks. Returns list of FAIL strings (empty = all passed)."""
    failures: list[str] = []
    failures += check_paragraph_count(segments)
    failures += check_bracket_integrity(segments)
    failures += check_placeholder_fidelity(segments)
    failures += check_mandatory_language(segments, direction)
    failures += check_no_source_language(segments, direction)
    failures += check_terminology(segments, lexicon, direction)
    failures += check_style_coverage(work_dir, segments)
    failures += check_heading_numbering(segments)
    return failures


def write_checks_report(failures: list[str], path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        if failures:
            f.write(f"SELF-CHECK REPORT — {len(failures)} FAILURE(S)\n")
            f.write("=" * 60 + "\n")
            for fail in failures:
                f.write(f"FAIL: {fail}\n")
        else:
            f.write("SELF-CHECK REPORT\n")
            f.write("=" * 60 + "\n")
            f.write("All checks passed.\n")
