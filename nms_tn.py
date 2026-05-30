"""
nms_tn.py — Translator's Notes generator.

Produces a plain-text [TN-###] file for every flagged or uncertain item,
in document order.  Sources of flags:

  • nms_segment.py  : mixed-language runs, mixed inline formatting
  • nms_translate.py: [FLAG:…] from model, untested spec-note path
  • nms_checks.py   : check failures
  • nms_preprocess  : notes (mixed-language doc warning, empty-note deferral)
  • pipeline        : empty spec-note paragraphs left in place

Format:
  [TN-001] Para NNN | Source: "…" | Rendering: "…" | Reason: …
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from nms_segment import Segment


def generate_tn(
    segments: list[Segment],
    preprocess_notes: list[str],
    check_failures: list[str],
    direction: str,
    src_docx: str,
    out_path: str,
    empty_note_para_indices: list[int] | None = None,
) -> int:
    """
    Write Translator's Notes file.  Returns count of TN entries written.
    """
    entries: list[str] = []
    counter = 0

    def _add(para_index: int | None, source: str, rendering: str, reason: str) -> None:
        nonlocal counter
        counter += 1
        para_label = f"Para {para_index}" if para_index is not None else "General"
        src_snippet = (source[:80] + "…") if len(source) > 80 else source
        ren_snippet = (rendering[:80] + "…") if len(rendering) > 80 else rendering
        entries.append(
            f"[TN-{counter:03d}] {para_label} | "
            f'Source: "{src_snippet}" | '
            f'Rendering: "{ren_snippet}" | '
            f"Reason: {reason}"
        )

    # Preprocessing notes (mixed-language document, empty note deferral, etc.)
    for note in preprocess_notes:
        _add(None, "(see preprocessing report)", "(n/a)", note)

    # Empty spec-note placeholders left in place
    for idx in (empty_note_para_indices or []):
        _add(
            idx,
            "(empty spec-note paragraph)",
            "(left in place — not deleted)",
            "Empty spec-note placeholder. Project rules say notes should not remain as "
            "blank paragraphs. Confirm with project lead whether to delete.",
        )

    # Per-segment flags (in document order)
    for seg in segments:
        if not seg.flags:
            continue
        src = seg.source_text or "(empty)"
        ren = seg.translated_text or "(not translated)"
        for flag in seg.flags:
            _add(seg.para_index, src, ren, flag)

    # Check failures
    for fail in check_failures:
        _add(None, "(self-check)", "(see checks report)", fail)

    # Write file
    lines = [
        "TRANSLATOR'S NOTES",
        "=" * 70,
        f"Generated   : {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"Direction   : {direction}",
        f"Source file : {Path(src_docx).name}",
        f"Total entries: {len(entries)}",
        "",
    ]
    if not entries:
        lines.append("(no flags or failures — clean translation)")
    else:
        lines += entries

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return counter
