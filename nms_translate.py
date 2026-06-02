"""
nms_translate.py — Translation orchestration.

Drives the segment → API → reinsert loop.
The model does the translation; this module owns sequencing,
lexicon delivery (via system prompt), and verification.

System prompt + lexicon are sent with cache_control=ephemeral so that
repeated calls within a batch benefit from prompt caching.
"""
from __future__ import annotations

import glob
import os
import re
from pathlib import Path
from typing import Callable

from lxml import etree

# Purely numeric table cells (e.g. "0,0", "77,6") — skip API, handle in code
_NUMERIC_CELL = re.compile(r"^\s*-?\d+(?:[.,]\d+)?\s*$")
# NMS section number: two-digit triplet, optionally separated by spaces/hyphens
_SECTION_NUM_RE = re.compile(r"\d{2}[ \t\-]*\d{2}[ \t\-]*\d{2}")
# Separator between section number and section name
_AFTER_NUM_SEP_RE = re.compile(r"^[ \t–—\-]+")

W      = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_XML_NS = "http://www.w3.org/XML/1998/namespace"

from api_client import ApiClient, TranslationResponse
from nms_segment import Segment, extract_segments, apply_translations, restore_and_postprocess, post_process


# ---------------------------------------------------------------------------
# Lexicon
# ---------------------------------------------------------------------------
def load_lexicon(path: Path) -> dict[str, str]:
    """
    Parse the bilingual lexicon file.

    Supports (auto-detected, in order of priority):
      EN term<TAB>FR term          (tab-separated legacy)
      EN term|FR term              (pipe-separated legacy)
      EN term   <3+ spaces>  FR term  (multi-space column — current standard)
      EN term    ->    FR term     (arrow notation used for fixed headings)

    Keys are EN terms in original case; values are FR terms.
    Lines starting with # or = are skipped.  Section-header lines (digit prefix)
    are skipped.
    """
    lexicon: dict[str, str] = {}
    if not path.is_file():
        return lexicon
    _MULTI_SP = re.compile(r'\s{3,}')
    _SECTION_HDR = re.compile(r'^\d+[\.\d]*\s')  # "2.5  MASONRY" style headers
    with open(path, encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("="):
                continue
            # Tab-separated (legacy)
            if "\t" in stripped:
                parts = stripped.split("\t", 1)
                if len(parts) == 2:
                    en, fr = parts[0].strip(), parts[1].strip()
                    if en and fr:
                        lexicon[en] = fr
                continue
            # Pipe-separated (legacy)
            if "|" in stripped:
                parts = stripped.split("|", 1)
                if len(parts) == 2:
                    en, fr = parts[0].strip(), parts[1].strip()
                    if en and fr:
                        lexicon[en] = fr
                continue
            # Multi-space column format
            parts = _MULTI_SP.split(stripped, 1)
            if len(parts) != 2:
                continue
            en = parts[0].strip()
            fr = parts[1].strip()
            # Arrow notation: "TERM    ->  TRANSLATION"
            if fr.startswith("->"):
                fr = fr[2:].strip()
            if not en or not fr:
                continue
            # Skip section-header lines ("2.5  MASONRY", "1.1  THREE-PART …")
            if _SECTION_HDR.match(en):
                continue
            lexicon[en] = fr
    return lexicon


def _build_lexicon_block(lexicon: dict[str, str], direction: str) -> str:
    if not lexicon:
        return "(no lexicon loaded)"
    lines = []
    for en, fr in sorted(lexicon.items()):
        if direction == "fr→en":
            lines.append(f"  {fr}  →  {en}")
        else:
            lines.append(f"  {en}  →  {fr}")
    return "\n".join(lines)


def _lookup_title(title: str, lexicon: dict[str, str], direction: str) -> str | None:
    """
    Case-insensitive direct lexicon lookup for section titles.
    Lexicon keys = EN, values = FR.
    Returns the target-language title if found, None otherwise.
    """
    if not lexicon or not title.strip():
        return None
    t = title.strip().lower()
    if direction == "en→fr":
        for en_key, fr_val in lexicon.items():
            if en_key.lower() == t:
                return fr_val
    else:  # fr→en
        for en_key, fr_val in lexicon.items():
            if fr_val.lower() == t:
                return en_key
    return None


# ---------------------------------------------------------------------------
# System prompt (built once per batch; cached on the API side)
# ---------------------------------------------------------------------------
_SYSTEM_TEMPLATE = """\
You are a professional translator specializing in Canadian construction \
specifications (NMS/DDN format). You translate between French and English \
for use in legally binding contract documents.

TRANSLATION DIRECTION: {direction}

CORE RULES — non-negotiable:
1. Fidelity over fluency. Do not summarize, paraphrase, add, or omit content.
2. Modal / obligation language:
   - EN output: use imperative verb mood for all obligations — "Install…", \
"Provide…", "Submit…". Do NOT use "shall", "must", or "will" for obligations. \
This is current NMS standard.
   - FR→EN: translate "doit"/"devra"/"doivent" as the direct imperative.
   - EN→FR: translate imperative obligations as "doit"/"devra" as appropriate.
   - "should" (EN) ↔ "devrait" (FR) — recommendation (unchanged)
   - "may" (EN) ↔ "peut" (FR) — permission (unchanged)
3. Placeholders ⟦0⟧ ⟦1⟧ … mark content that must NOT be translated \
(standard designations, dimensions, blank fields). Copy them exactly as-is.
4. Preserve option brackets exactly: [option text] — translate the text \
inside but keep the bracket structure.
5. Do NOT translate: section numbers, CSA/ASTM/ISO/etc. designations, \
numeric values with units, [___] blanks. These are handled by the ⟦n⟧ \
placeholders — do not create new untranslated spans.
6. Per-language conventions to apply in code (do not second-guess these):
   - EN output: straight apostrophes ' (not curly '), imperative verb mood
   - FR output: infinitive verb mood, guillemets « » for quotations, \
NBSP before : ; ! ?
7. Restore French grammatical articles (le/la/les/un/une/des) in FR output.
8. This is a heading when STYLE_TYPE is "heading" — preserve any leading \
numeric prefix exactly.
9. STYLE_TYPE "specnote": [UNTESTED PATH — populated spec note. Flag any \
uncertainty in your translation and add a note at the end: [FLAG: reason].]

STYLE_TYPE: {style_type}

AUTHORITATIVE TERMINOLOGY (use these translations — do not deviate):
{lexicon_block}

Return ONLY the translated text. No explanation, no preamble, no quotes \
around the result. If a term is flagged uncertain, append [FLAG: brief reason] \
at the end of your response on a new line."""

_FLAG_RE = re.compile(r"\[FLAG:\s*(.+?)\]", re.DOTALL)


def build_system_prompt(direction: str, style_type: str, lexicon: dict[str, str]) -> str:
    return _SYSTEM_TEMPLATE.format(
        direction=direction,
        style_type=style_type,
        lexicon_block=_build_lexicon_block(lexicon, direction),
    )


def _build_user_message(seg: Segment, prev_text: str | None, next_text: str | None) -> str:
    parts = []
    if prev_text:
        parts.append(f"[CONTEXT BEFORE]\n{prev_text}\n")
    parts.append(f"[TRANSLATE THIS]\n{seg.masked_text}")
    if next_text:
        parts.append(f"\n[CONTEXT AFTER]\n{next_text}")
    return "\n".join(parts)


def _extract_flags(raw: str) -> tuple[str, list[str]]:
    """Strip [FLAG:…] lines from model output; return (clean_text, flags)."""
    flags = [m.group(1).strip() for m in _FLAG_RE.finditer(raw)]
    clean = _FLAG_RE.sub("", raw).strip()
    return clean, flags


def _target_lang(direction: str, source_lang: str) -> str:
    if direction == "fr→en":
        return "en-CA"
    # en→fr: preserve the regional variant of the source
    return source_lang if source_lang.startswith("fr") else "fr-CA"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def translate_document(
    work_dir: str,
    heading_styleids: set[str],
    source_lang: str,
    direction: str,
    client: ApiClient,
    lexicon: dict[str, str],
    log: Callable[[str], None] | None = None,
    progress_cb: Callable[[int, int], None] | None = None,
) -> list[Segment]:
    """
    Extract → translate → reinsert.  Returns segments for checks + TN.
    Modifies document.xml inside work_dir in place.
    """
    def _log(msg: str) -> None:
        if log:
            log(msg)

    tree, segments = extract_segments(work_dir, heading_styleids, source_lang)
    translatable = [s for s in segments if s.is_translatable and s.source_text.strip()]
    total = len(translatable)
    _log(f"  {len(segments)} paragraphs found, {total} to translate.")

    done = 0
    for i, seg in enumerate(segments):
        if not seg.is_translatable or not seg.source_text.strip():
            seg.translated_text = seg.source_text
            continue

        # Warn for populated spec-note paragraphs (path not tested on real content)
        if seg.style_id and "spec" in seg.style_id.lower() and seg.source_text.strip():
            _log(
                f"  [UNTESTED PATH] Translating populated spec-note paragraph "
                f"(para {seg.para_index}, style {seg.style_id!r}). "
                "Verify this paragraph carefully in the output."
            )
            seg.flags.append(
                "[UNTESTED PATH] Populated spec-note translation — "
                "this code path has not been validated on real note content. "
                "Verify carefully."
            )

        # Purely numeric table cells (e.g. "0,0", "77,6"): no API call needed.
        # Convert decimal comma → period for FR→EN and pass through.
        if seg.is_table_cell and _NUMERIC_CELL.match(seg.source_text):
            if direction == "fr→en":
                seg.translated_text = seg.source_text.strip().replace(",", ".")
            else:
                seg.translated_text = seg.source_text
            done += 1
            if progress_cb:
                progress_cb(done, total)
            continue

        # Table cells: suppress before/after context — adjacent cells are from
        # different columns/rows and can cause the model to confuse context with
        # the content being translated (root cause of cell-content contamination).
        if seg.is_table_cell:
            prev_text = None
            next_text = None
        else:
            prev_text = segments[i - 1].source_text if i > 0 else None
            next_text = segments[i + 1].source_text if i < len(segments) - 1 else None

        sys_prompt = build_system_prompt(direction, seg.style_type, lexicon)
        user_msg = _build_user_message(seg, prev_text, next_text)

        response: TranslationResponse = client.translate(sys_prompt, user_msg)

        raw, model_flags = _extract_flags(response.translated)
        seg.flags.extend(model_flags)

        seg.translated_text = restore_and_postprocess(seg, raw, direction)

        done += 1
        _log(f"  [{done}/{total}] para {seg.para_index} ({seg.style_id or 'unstyled'})")
        if progress_cb:
            progress_cb(done, total)

    tgt_lang = _target_lang(direction, source_lang)
    apply_translations(tree, work_dir, segments, tgt_lang)
    _log(f"  Reinsertion complete. Target language tag: {tgt_lang}")

    return segments


# ---------------------------------------------------------------------------
# Page-header section-name translation
# ---------------------------------------------------------------------------
_HDR_REMOVE = frozenset({
    W + "r", W + "hyperlink", W + "proofErr", W + "del", W + "ins",
    W + "fldSimple", W + "sdt",
})
_HDR_KEEP = frozenset({W + "pPr", W + "bookmarkStart", W + "bookmarkEnd"})


def _right_side_text(p: etree._Element) -> str:
    """
    Return the text that appears AFTER the first <w:tab> in paragraph p.
    This handles the tab-stop two-column layout used in NMS EVOQ headers.
    Returns empty string if no tab found.
    """
    collecting = False
    parts: list[str] = []
    for r in p.findall(W + "r"):
        for child in r:
            if child.tag == W + "tab":
                collecting = True
            elif child.tag == W + "t" and collecting:
                parts.append(child.text or "")
    return "".join(parts)


def _rewrite_right_side(p: etree._Element, new_text: str, target_lang: str) -> None:
    """
    Replace all content after the first <w:tab> in paragraph p with new_text,
    preserving the tab run and left-column content intact.
    """
    tab_run: etree._Element | None = None
    first_rpr_xml: bytes | None = None

    # Collect rPr from first run after the tab run (for formatting)
    found_tab_run = False
    for child in p:
        if child.tag != W + "r":
            continue
        if not found_tab_run:
            if child.find(W + "tab") is not None:
                tab_run = child
                found_tab_run = True
        else:
            rpr = child.find(W + "rPr")
            if rpr is not None and first_rpr_xml is None:
                first_rpr_xml = etree.tostring(rpr)
            break

    if tab_run is None:
        return

    # Strip any <w:t> elements that follow <w:tab> inside the tab run itself
    tab_seen = False
    for child in list(tab_run):
        if child.tag == W + "tab":
            tab_seen = True
        elif child.tag == W + "t" and tab_seen:
            tab_run.remove(child)

    # Remove every element after the tab run
    removing = False
    for child in list(p):
        if child is tab_run:
            removing = True
            continue
        if removing:
            p.remove(child)

    # Append new run with translated text
    new_r = etree.SubElement(p, W + "r")
    if first_rpr_xml is not None:
        rpr_el = etree.fromstring(first_rpr_xml)
        lang_el = rpr_el.find(W + "lang")
        if lang_el is not None:
            lang_el.set(W + "val", target_lang)
        else:
            lang_el = etree.SubElement(rpr_el, W + "lang")
            lang_el.set(W + "val", target_lang)
        new_r.insert(0, rpr_el)

    t_el = etree.SubElement(new_r, W + "t")
    t_el.text = new_text
    if new_text and (new_text[0].isspace() or new_text[-1].isspace()):
        t_el.set(f"{{{_XML_NS}}}space", "preserve")


def _para_text(p: etree._Element) -> str:
    """Return the plain text of a paragraph element."""
    return "".join(
        "".join(t.text or "" for t in r.findall(W + "t"))
        for r in p.iter(W + "r")
    )


def _rewrite_para(
    p: etree._Element,
    new_text: str,
    target_lang: str,
) -> None:
    """Replace all runs in paragraph p with a single run containing new_text."""
    runs = list(p.iter(W + "r"))
    first_rpr_xml = None
    for r in runs:
        rpr = r.find(W + "rPr")
        if rpr is not None:
            first_rpr_xml = etree.tostring(rpr)
            break

    for child in list(p):
        if child.tag in _HDR_REMOVE:
            p.remove(child)
        elif child.tag not in _HDR_KEEP:
            p.remove(child)

    new_r = etree.SubElement(p, W + "r")
    if first_rpr_xml is not None:
        rpr_el = etree.fromstring(first_rpr_xml)
        lang_el = rpr_el.find(W + "lang")
        if lang_el is not None:
            lang_el.set(W + "val", target_lang)
        else:
            lang_el = etree.SubElement(rpr_el, W + "lang")
            lang_el.set(W + "val", target_lang)
        new_r.insert(0, rpr_el)

    t_el = etree.SubElement(new_r, W + "t")
    t_el.text = new_text
    if new_text and (new_text[0].isspace() or new_text[-1].isspace()):
        t_el.set(f"{{{_XML_NS}}}space", "preserve")


def translate_docx_headers(
    work_dir: str,
    direction: str,
    client: ApiClient,
    lexicon: dict[str, str],
    log: Callable[[str], None] | None = None,
) -> int:
    """
    Translate the section title in DOCX page headers (header*.xml).

    Handles the standard EVOQ/NMS header layout (Layout E) and fallbacks:

      Layout E (primary — EVOQ standard): tab-stop two-column paragraphs.
        Each header "row" is ONE paragraph: left text + <w:tab> + right text.
        Para 0: "Nom du bâtiment"  [tab]  "Section 07 13 52"
        Para 1: "Titre projet"     [tab]  "Titre du section devis"  ← translate right side only
        Para 2: "Titre projet"     [tab]  "Page 1 de 2"
        Detection: right side of paragraph contains a section number
        → translate right side of the NEXT paragraph.

      Layout D: multi-row table, same column
      Layout A: number and title in the same paragraph
      Layout C: consecutive paragraphs in the same table cell
      Layout B: adjacent cells in the same table row

    Returns the count of paragraphs updated.
    """
    def _log(msg: str) -> None:
        if log:
            log(msg)

    header_files = sorted(
        glob.glob(os.path.join(work_dir, "word", "header*.xml"))
    )
    if not header_files:
        _log("  Headers: no header*.xml files found.")
        return 0

    _log(f"  Headers: found {len(header_files)} header file(s).")
    target_lang = "en-CA" if direction == "fr→en" else "fr-CA"
    updated = 0

    for hpath in header_files:
        tree = etree.parse(hpath)
        root = tree.getroot()
        file_modified = False
        fname = os.path.basename(hpath)
        translated_ids: set[int] = set()  # id()s of already-translated paragraphs

        def _translate_right_side(p: etree._Element) -> bool:
            title_text = _right_side_text(p).strip()
            if not title_text or _SECTION_NUM_RE.search(title_text):
                return False
            direct = _lookup_title(title_text, lexicon, direction)
            if direct:
                translated_name = post_process(direct, direction)
                source = "lexicon"
            else:
                sys_prompt = build_system_prompt(direction, "heading", lexicon)
                response: TranslationResponse = client.translate(sys_prompt, title_text)
                translated_name = post_process(response.translated.strip(), direction)
                source = "API"
            if translated_name == title_text:
                return False
            _rewrite_right_side(p, translated_name, target_lang)
            _log(f"  Header ({fname}) Layout E [{source}]: {repr(title_text)} → {repr(translated_name)}")
            translated_ids.add(id(p))
            return True

        def _translate_para(p: etree._Element, layout: str) -> bool:
            title_text = _para_text(p).strip()
            if not title_text or _SECTION_NUM_RE.search(title_text):
                return False
            direct = _lookup_title(title_text, lexicon, direction)
            if direct:
                translated_name = post_process(direct, direction)
                source = "lexicon"
            else:
                sys_prompt = build_system_prompt(direction, "heading", lexicon)
                response: TranslationResponse = client.translate(sys_prompt, title_text)
                translated_name = post_process(response.translated.strip(), direction)
                source = "API"
            if translated_name == title_text:
                return False
            _rewrite_para(p, translated_name, target_lang)
            _log(f"  Header ({fname}) {layout} [{source}]: {repr(title_text)} → {repr(translated_name)}")
            translated_ids.add(id(p))
            return True

        all_paras = list(root.iter(W + "p"))

        # ── Layout E (primary): tab-stop two-column paragraphs ───────────
        # Right side of paragraph N contains section number
        # → translate right side of paragraph N+1
        for i, p in enumerate(all_paras[:-1]):
            if id(p) in translated_ids:
                continue
            right = _right_side_text(p).strip()
            if not right or not _SECTION_NUM_RE.search(right):
                continue
            next_p = all_paras[i + 1]
            if id(next_p) in translated_ids:
                continue
            if _translate_right_side(next_p):
                file_modified = True
                updated += 1

        # ── Layout D: multi-row table, section number and title in same column ─
        for tbl in root.iter(W + "tbl"):
            rows = tbl.findall(W + "tr")
            for ri, tr in enumerate(rows[:-1]):
                cells = tr.findall(W + "tc")
                for ci, tc in enumerate(cells):
                    cell_text = "".join(
                        _para_text(p) for p in tc.findall(W + "p")
                    ).strip()
                    if not _SECTION_NUM_RE.search(cell_text):
                        continue
                    next_cells = rows[ri + 1].findall(W + "tc")
                    if ci >= len(next_cells):
                        continue
                    for p in next_cells[ci].findall(W + "p"):
                        if id(p) in translated_ids:
                            continue
                        if _translate_para(p, "Layout D"):
                            file_modified = True
                            updated += 1

        # ── Layout A: number + title in the same paragraph ───────────────
        for p in all_paras:
            if id(p) in translated_ids:
                continue
            # Skip tab-layout paragraphs — Layout E handles those
            if any(r.find(W + "tab") is not None for r in p.findall(W + "r")):
                continue
            full_text = _para_text(p)
            num_match = _SECTION_NUM_RE.search(full_text)
            if num_match is None:
                continue
            after_num = full_text[num_match.end():]
            sep_match = _AFTER_NUM_SEP_RE.match(after_num)
            sep = sep_match.group() if sep_match else ""
            section_name = after_num[len(sep):].strip()
            if not section_name:
                continue
            direct = _lookup_title(section_name, lexicon, direction)
            if direct:
                translated_name = post_process(direct, direction)
                src_a = "lexicon"
            else:
                sys_prompt = build_system_prompt(direction, "heading", lexicon)
                response = client.translate(sys_prompt, section_name)
                translated_name = post_process(response.translated.strip(), direction)
                src_a = "API"
            if translated_name != section_name:
                new_text = full_text[:num_match.end()] + sep + translated_name
                _rewrite_para(p, new_text, target_lang)
                _log(f"  Header ({fname}) Layout A [{src_a}]: {repr(section_name)} → {repr(translated_name)}")
                translated_ids.add(id(p))
                file_modified = True
                updated += 1

        # ── Layout C: number + title as consecutive paragraphs, same cell ─
        for i, p in enumerate(all_paras):
            if id(p) in translated_ids:
                continue
            if any(r.find(W + "tab") is not None for r in p.findall(W + "r")):
                continue  # tab-layout — handled by Layout E
            if not _SECTION_NUM_RE.search(_para_text(p)):
                continue
            p_parent = p.getparent()
            for next_p in all_paras[i + 1:]:
                if next_p.getparent() is not p_parent:
                    break
                if id(next_p) in translated_ids:
                    break
                if not _para_text(next_p).strip():
                    continue
                if _translate_para(next_p, "Layout C"):
                    file_modified = True
                    updated += 1
                break

        # ── Layout B: adjacent cells same row ────────────────────────────
        for tbl in root.iter(W + "tbl"):
            for tr in tbl.findall(W + "tr"):
                cells = tr.findall(W + "tc")
                if len(cells) < 2:
                    continue
                num_ci = None
                for ci, tc in enumerate(cells):
                    cell_text = "".join(
                        _para_text(p) for p in tc.findall(W + "p")
                    ).strip()
                    if _SECTION_NUM_RE.search(cell_text) and len(cell_text) <= 20:
                        num_ci = ci
                        break
                if num_ci is None:
                    continue
                for ci, tc in enumerate(cells):
                    if ci == num_ci:
                        continue
                    for p in tc.findall(W + "p"):
                        if id(p) in translated_ids:
                            continue
                        if _translate_para(p, "Layout B"):
                            file_modified = True
                            updated += 1

        if file_modified:
            tree.write(hpath, xml_declaration=True, encoding="UTF-8", standalone=True)
        else:
            _log(f"  Header ({fname}): no translatable section names found.")

    return updated
