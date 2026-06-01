"""
nms_pipeline.py — Top-level orchestration.

Order:
  0. Pre-strip manifest  (scan source DOCX for spec-note paragraphs BEFORE
                          preprocessing deletes them — auditable record)
  1. Preprocess          (nms_preprocess.preprocess — trusted core)
  2. Translate           (unpack preprocessed → translate → repack)
  3. Self-checks         (deterministic; no API)
  4. Translator's Notes  (plain-text [TN-###] file)

Open decision surfaced:
  Empty spec-note placeholder paragraphs are LEFT IN PLACE by nms_preprocess
  (deferred per project decision).  The pre-strip manifest records them.
  Set delete_empty_notes=True to enable deletion AFTER preprocessing.

Populated spec notes:
  [UNTESTED PATH] nms_preprocess strips populated spec-note paragraphs.
  The translation layer will flag any it encounters.  Verify carefully
  on first real file that contains note content.
"""
from __future__ import annotations

import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Callable

from nms_preprocess import (
    StyleReport,
    preprocess,
    unpack,
    repack,
    discover_styles,
    _parse,
)
from nms_translate import translate_document, load_lexicon, translate_docx_headers
from nms_checks import run_checks, write_checks_report
from nms_tn import generate_tn
from api_client import ApiClient
from config import Config

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


# ---------------------------------------------------------------------------
# Pre-strip manifest
# ---------------------------------------------------------------------------
def _generate_prestrip_manifest(src_docx: str, manifest_path: str, scan_dir: str) -> None:
    """
    Unpack source DOCX into scan_dir, discover spec-note styles, write manifest
    of every spec-note paragraph (before preprocessing deletes them).
    Cleans up scan_dir on exit.
    """
    try:
        unpack(src_docx, scan_dir)
        rpt = StyleReport()
        discover_styles(scan_dir, rpt)

        doc_path = os.path.join(scan_dir, "word", "document.xml")
        tree = _parse(doc_path)
        root = tree.getroot()
        body = root.find(W + "body")
        note_set = set(rpt.spec_note_styles)

        lines = [
            "PRE-STRIP MANIFEST — SpecNote paragraphs (auditable record)",
            "=" * 70,
            f"Generated : {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            f"Source    : {Path(src_docx).name}",
            f"Spec-note styles identified: {rpt.spec_note_styles or '(none)'}",
            "",
        ]

        if not note_set:
            lines.append("No spec-note paragraphs found.")
        else:
            paras = body.findall(W + "p") if body is not None else []
            last_heading = "(document start)"
            found = 0
            for idx, p in enumerate(paras):
                pPr = p.find(W + "pPr")
                ps = pPr.find(W + "pStyle") if pPr is not None else None
                style = ps.get(W + "val") if ps is not None else ""
                text = "".join(t.text or "" for t in p.findall(".//" + W + "t")).strip()

                # Track most recent heading for context
                if style in {h[2] for h in rpt.heading_styles}:
                    last_heading = text or f"(heading para {idx})"

                if style in note_set:
                    found += 1
                    action = "DEFERRED (left in place — empty placeholder)" if not text else "DELETE"
                    lines.append(f"Para {idx} (after heading: \"{last_heading}\")")
                    lines.append(f"  Style : {style}")
                    lines.append(f"  Text  : {repr(text) if text else '(empty)'}")
                    lines.append(f"  Action: {action}")
                    lines.append("")

            if found == 0:
                lines.append("No spec-note paragraphs found in document body.")

        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

    finally:
        if os.path.exists(scan_dir):
            shutil.rmtree(scan_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Empty-note deletion (optional post-preprocessing step)
# ---------------------------------------------------------------------------
def _delete_empty_notes(preprocessed_docx: str, work_dir: str, spec_note_styles: list[str]) -> int:
    """
    Remove empty spec-note placeholder paragraphs from the preprocessed DOCX.
    Returns count deleted.  Repacks DOCX in place.
    Only called when the operator sets delete_empty_notes=True.
    """
    note_set = set(spec_note_styles)
    doc_path = os.path.join(work_dir, "word", "document.xml")
    tree = _parse(doc_path)
    root = tree.getroot()
    body = root.find(W + "body")
    if body is None or not note_set:
        return 0

    deleted = 0
    for p in list(body.findall(W + "p")):
        pPr = p.find(W + "pPr")
        ps = pPr.find(W + "pStyle") if pPr is not None else None
        style = ps.get(W + "val") if ps is not None else ""
        text = "".join(t.text or "" for t in p.findall(".//" + W + "t")).strip()
        if style in note_set and not text:
            body.remove(p)
            deleted += 1

    if deleted:
        tree.write(doc_path, xml_declaration=True, encoding="UTF-8", standalone=True)
        repack(work_dir, preprocessed_docx)
    return deleted


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def run_pipeline(
    src_docx: str,
    output_dir: str,
    direction: str,
    cfg: Config,
    delete_empty_notes: bool = False,
    log: Callable[[str], None] | None = None,
    progress_cb: Callable[[int, int], None] | None = None,
) -> dict[str, str]:
    """
    Full end-to-end pipeline.  Returns dict of output file paths.

    direction: "fr→en" or "en→fr"
    delete_empty_notes: if True, remove empty spec-note placeholders after
        preprocessing.  If False (default), they are left in place and
        recorded in the manifest and TN.
    """
    def _log(msg: str) -> None:
        if log:
            log(msg)

    src = Path(src_docx)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    work = cfg.work_dir
    work.mkdir(parents=True, exist_ok=True)

    stem = src.stem
    preproc_work = str(work / "preprocess")
    trans_work   = str(work / "translate")
    manifest_scan = str(work / "manifest_scan")

    # Auxiliary files go into a "translation info" subfolder; only the
    # translated DOCX lands directly in output_dir.
    info_dir = out / "translation info"
    info_dir.mkdir(parents=True, exist_ok=True)

    preprocessed_docx  = str(info_dir / f"{stem}_preprocessed.docx")
    translated_docx    = str(out      / f"{stem}_translated.docx")
    preproc_report     = str(info_dir / f"{stem}_preprocess_report.txt")
    prestrip_manifest  = str(info_dir / f"{stem}_prestrip_manifest.txt")
    checks_report      = str(info_dir / f"{stem}_checks.txt")
    tn_report          = str(info_dir / f"{stem}_TN.txt")

    # ── Step 0: Pre-strip manifest ──────────────────────────────────────
    _log("Step 0/4: Generating pre-strip manifest…")
    _generate_prestrip_manifest(src_docx, prestrip_manifest, manifest_scan)
    _log(f"  Written: {prestrip_manifest}")

    # ── Step 1: Preprocess ──────────────────────────────────────────────
    _log("Step 1/4: Preprocessing…")
    rpt: StyleReport = preprocess(src_docx, preprocessed_docx, preproc_report, preproc_work)
    _log(f"  Source language : {rpt.source_lang}")
    tc = rpt.tracked_changes.get("before", {})
    if tc.get("w:del", 0) or tc.get("w:ins", 0):
        _log(
            f"  Tracked changes : {tc.get('w:del',0)} deletions, "
            f"{tc.get('w:ins',0)} insertions accepted"
        )
    if rpt.comments_removed:
        _log(f"  Comments removed: {rpt.comments_removed} markup nodes")
    if rpt.suffix_fixes:
        _log(f"  Heading suffix fix: {rpt.suffix_fixes}")
    if rpt.spec_note_styles:
        _log(f"  Spec-note styles: {rpt.spec_note_styles}")
    if rpt.empty_note_paras:
        _log(
            f"  {len(rpt.empty_note_paras)} empty spec-note placeholder(s) left in place "
            f"(para indices: {rpt.empty_note_paras})"
        )
    for note in rpt.notes:
        _log(f"  NOTE: {note}")

    # Optional: delete empty notes now
    if delete_empty_notes and rpt.empty_note_paras and rpt.spec_note_styles:
        _log("  Deleting empty spec-note placeholders (delete_empty_notes=True)…")
        unpack(preprocessed_docx, preproc_work)
        deleted = _delete_empty_notes(preprocessed_docx, preproc_work, rpt.spec_note_styles)
        _log(f"  Deleted {deleted} empty placeholder(s).")

    # ── Step 2: Translate ───────────────────────────────────────────────
    _log("Step 2/4: Translating…")
    client = ApiClient(api_key=cfg.api_key, model=cfg.model)
    lexicon = load_lexicon(cfg.lexicon_path)
    _log(f"  Lexicon: {len(lexicon)} terms loaded from {cfg.lexicon_path.name}")

    heading_styleids = {h[2] for h in rpt.heading_styles}

    unpack(preprocessed_docx, trans_work)
    segments = translate_document(
        work_dir=trans_work,
        heading_styleids=heading_styleids,
        source_lang=rpt.source_lang,
        direction=direction,
        client=client,
        lexicon=lexicon,
        log=_log,
        progress_cb=progress_cb,
    )
    hdr_count = translate_docx_headers(
        work_dir=trans_work,
        direction=direction,
        client=client,
        lexicon=lexicon,
        log=_log,
    )
    if hdr_count:
        _log(f"  {hdr_count} page-header section name(s) translated.")

    repack(trans_work, translated_docx)
    _log(f"  Written: {translated_docx}")
    _log(f"  {client.usage_summary()}")

    # ── Step 3: Self-checks ─────────────────────────────────────────────
    _log("Step 3/4: Running self-checks…")
    # Re-unpack translated docx so style_coverage check can read the XML
    unpack(translated_docx, trans_work)
    failures = run_checks(
        work_dir=trans_work,
        segments=segments,
        lexicon=lexicon,
        direction=direction,
    )
    write_checks_report(failures, checks_report)
    if failures:
        _log(f"  {len(failures)} check(s) FAILED — see {checks_report}")
        for f in failures:
            _log(f"    FAIL: {f}")
    else:
        _log("  All checks passed.")

    # ── Step 4: Translator's Notes ──────────────────────────────────────
    _log("Step 4/4: Generating Translator's Notes…")
    tn_count = generate_tn(
        segments=segments,
        preprocess_notes=rpt.notes,
        check_failures=failures,
        direction=direction,
        src_docx=src_docx,
        out_path=tn_report,
        empty_note_para_indices=rpt.empty_note_paras if not delete_empty_notes else [],
    )
    _log(f"  {tn_count} TN entr{'y' if tn_count == 1 else 'ies'} written: {tn_report}")

    _log("Done.")
    return {
        "preprocessed_docx": preprocessed_docx,
        "translated_docx":   translated_docx,
        "preprocess_report": preproc_report,
        "prestrip_manifest": prestrip_manifest,
        "checks_report":     checks_report,
        "tn_report":         tn_report,
    }
