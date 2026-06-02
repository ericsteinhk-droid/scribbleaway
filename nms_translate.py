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
    Supported formats (auto-detected):
      french_term<TAB>english_term
      french_term|english_term
    Lines starting with # are comments.
    """
    lexicon: dict[str, str] = {}
    if not path.is_file():
        return lexicon
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            sep = "\t" if "\t" in line else "|"
            parts = line.split(sep, 1)
            if len(parts) == 2:
                lexicon[parts[0].strip().lower()] = parts[1].strip()
    return lexicon


def _build_lexicon_block(lexicon: dict[str, str], direction: str) -> str:
    if not lexicon:
        return "(no lexicon loaded)"
    lines = []
    for fr, en in sorted(lexicon.items()):
        if direction == "fr→en":
            lines.append(f"  {fr}  →  {en}")
        else:
            lines.append(f"  {en}  →  {fr}")
    return "\n".join(lines)


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
    Translate the section name in DOCX page headers (header*.xml).

    Handles three layouts found in NMS DOCX headers:
      Layout A: number and name in the same paragraph
                "07 13 52 — Membranes d'étanchéité de toiture"
      Layout C: number on one line, name on the next line in the same container
                07 13 52
                Membranes d'étanchéité de toiture        ← translated
      Layout B: number in one table cell, name in an adjacent cell (same row)
                | 07 13 52 | Membranes d'étanchéité de toiture |

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

        all_paras = list(root.iter(W + "p"))
        skip = set()  # indices already handled

        for i, p in enumerate(all_paras):
            if i in skip:
                continue

            full_text = _para_text(p)
            num_match = _SECTION_NUM_RE.search(full_text)
            if num_match is None:
                continue

            after_num = full_text[num_match.end():]
            sep_match = _AFTER_NUM_SEP_RE.match(after_num)
            sep = sep_match.group() if sep_match else ""
            section_name = after_num[len(sep):].strip()

            if section_name:
                # Layout A: number + title in same paragraph
                sys_prompt = build_system_prompt(direction, "heading", lexicon)
                response: TranslationResponse = client.translate(sys_prompt, section_name)
                translated_name = post_process(response.translated.strip(), direction)
                if translated_name != section_name:
                    new_text = full_text[:num_match.end()] + sep + translated_name
                    _rewrite_para(p, new_text, target_lang)
                    _log(f"  Header ({fname}) Layout A: {repr(section_name)} → {repr(translated_name)}")
                    file_modified = True
                    updated += 1
            else:
                # Layout C: title is the next non-empty paragraph in the same container
                p_parent = p.getparent()
                for j in range(i + 1, len(all_paras)):
                    next_p = all_paras[j]
                    if next_p.getparent() is not p_parent:
                        break
                    title_text = _para_text(next_p).strip()
                    if not title_text:
                        continue
                    if _SECTION_NUM_RE.search(title_text):
                        break  # another number, not a title
                    sys_prompt = build_system_prompt(direction, "heading", lexicon)
                    response = client.translate(sys_prompt, title_text)
                    translated_name = post_process(response.translated.strip(), direction)
                    if translated_name != title_text:
                        _rewrite_para(next_p, translated_name, target_lang)
                        _log(f"  Header ({fname}) Layout C: {repr(title_text)} → {repr(translated_name)}")
                        file_modified = True
                        updated += 1
                    skip.add(j)
                    break

        # Layout B: number and title in adjacent cells of the same row
        # (fallback for headers where number and title are in separate columns)
        for tbl in root.iter(W + "tbl"):
            for tr in tbl.findall(W + "tr"):
                cells = tr.findall(W + "tc")
                if len(cells) < 2:
                    continue
                num_cell_idx = None
                for ci, tc in enumerate(cells):
                    cell_text = "".join(_para_text(p) for p in tc.findall(W + "p")).strip()
                    if _SECTION_NUM_RE.search(cell_text) and len(cell_text) <= 15:
                        num_cell_idx = ci
                        break
                if num_cell_idx is None:
                    continue
                for ci, tc in enumerate(cells):
                    if ci == num_cell_idx:
                        continue
                    for p in tc.findall(W + "p"):
                        title_text = _para_text(p).strip()
                        if not title_text:
                            continue
                        sys_prompt = build_system_prompt(direction, "heading", lexicon)
                        response = client.translate(sys_prompt, title_text)
                        translated_name = post_process(response.translated.strip(), direction)
                        if translated_name != title_text:
                            _rewrite_para(p, translated_name, target_lang)
                            _log(f"  Header ({fname}) Layout B: {repr(title_text)} → {repr(translated_name)}")
                            file_modified = True
                            updated += 1

        if file_modified:
            tree.write(hpath, xml_declaration=True, encoding="UTF-8", standalone=True)
        else:
            _log(f"  Header ({fname}): no translatable section names found.")

    return updated
