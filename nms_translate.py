"""
nms_translate.py — Translation orchestration.

Drives the segment → API → reinsert loop.
The model does the translation; this module owns sequencing,
lexicon delivery (via system prompt), and verification.

System prompt + lexicon are sent with cache_control=ephemeral so that
repeated calls within a batch benefit from prompt caching.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Callable

from api_client import ApiClient, TranslationResponse
from nms_segment import Segment, extract_segments, apply_translations, restore_and_postprocess


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
    if not path.exists():
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
2. Preserve mandatory language exactly:
   - "shall" (EN) ↔ "doit"/"devra" (FR) — binding obligation
   - "should" (EN) ↔ "devrait" (FR) — recommendation
   - "may" (EN) ↔ "peut" (FR) — permission
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
