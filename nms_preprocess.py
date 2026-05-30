"""
nms_preprocess.py — Deterministic DOCX preprocessing for NMS/DDN translation.

Platform-independent core. Performs all structural, non-linguistic operations
that must happen before (and after) the translation step, with no API calls.

Pipeline (structure-only; no translation):
  1. unpack            : DOCX (zip) -> working dir
  2. encoding_prescan  : report non-standard whitespace/punctuation in <w:t>
  3. discover_styles   : per-file inventory; resolve heading + spec-note styles
                         STRUCTURALLY (via numbering.xml), not by fixed names
  4. accept_changes    : accept tracked changes via lxml tree surgery
                         (paragraph-safe; verified zero content loss)
  5. strip_comments    : remove comment markup + metadata files + rels entries
  6. strip_spec_notes  : remove paragraphs whose style is the spec-note style
                         (empty note placeholders are REPORTED, not deleted —
                          deferred per project decision)
  7. fix_heading_suffix: numbering.xml <w:suff w:val="nothing"/> -> "space"
                         ONLY on discovered heading levels
  8. write_report      : human-readable plain-text findings
  9. repack            : working dir -> output DOCX

Design rules learned from testing two real samples:
  - Style names are NOT stable across files (French 1NomdelaPartie/Titre vs
    canonical PartName/NMSTitle). Discover structurally.
  - NEVER use regex for structural XML edits. A regex <w:del>...</w:del>
    deletion silently destroyed 51 paragraphs on a real file. Use lxml.
  - The suffix fix is conditional: apply only where a 'nothing' suffix
    actually sits on a heading level.

This module does NOT translate. It produces a clean, monolingual-ready DOCX
plus a report the orchestration layer uses to drive the translation step.
"""

from __future__ import annotations
import os
import re
import shutil
import zipfile
from dataclasses import dataclass, field
from lxml import etree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
NS = {"w": W[1:-1]}

# Comment-related part names (relative to word/) to remove entirely.
COMMENT_PARTS = [
    "comments.xml", "commentsExtended.xml", "commentsExtensible.xml",
    "commentsIds.xml", "people.xml",
]
# Relationship types whose targets are comment parts.
COMMENT_REL_TYPES = ("comments", "commentsExtended", "commentsIds",
                     "commentsExtensible", "people")


@dataclass
class StyleReport:
    source_lang: str = ""
    para_styles: dict = field(default_factory=dict)      # styleId -> count
    char_styles: dict = field(default_factory=dict)
    heading_styles: list = field(default_factory=list)   # (abstractNumId, ilvl, styleId, suff, fmt)
    spec_note_styles: list = field(default_factory=list) # styleIds judged to be spec-note styles
    empty_note_paras: list = field(default_factory=list) # indices left in place (deferred)
    encoding: dict = field(default_factory=dict)
    suffix_fixes: list = field(default_factory=list)     # styleIds whose level was changed
    tracked_changes: dict = field(default_factory=dict)  # before/after counts
    comments_removed: int = 0
    notes: list = field(default_factory=list)            # free-form caveats


# ----------------------------------------------------------------------------
# 1. unpack / 9. repack
# ----------------------------------------------------------------------------
def unpack(docx_path: str, work_dir: str) -> None:
    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)
    os.makedirs(work_dir)
    with zipfile.ZipFile(docx_path) as z:
        z.extractall(work_dir)


def repack(work_dir: str, out_path: str) -> None:
    if os.path.exists(out_path):
        os.remove(out_path)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(work_dir):
            for fn in files:
                full = os.path.join(root, fn)
                arc = os.path.relpath(full, work_dir)
                z.write(full, arc)


def _parse(path: str):
    return etree.parse(path)


def _save(tree, path: str) -> None:
    tree.write(path, xml_declaration=True, encoding="UTF-8", standalone=True)


# ----------------------------------------------------------------------------
# 2. encoding pre-scan
# ----------------------------------------------------------------------------
def encoding_prescan(work_dir: str, rpt: StyleReport) -> None:
    tree = _parse(os.path.join(work_dir, "word", "document.xml"))
    text = "".join(t.text or "" for t in tree.findall(".//" + W + "t"))
    rpt.encoding = {
        "U+00A0 NBSP": text.count("\u00a0"),
        "U+00A0 before colon": len(re.findall(r"\u00a0:", text)),
        "U+202F NNBSP": text.count("\u202f"),
        "U+2009 thin space": text.count("\u2009"),
        "other non-ASCII whitespace": sorted(
            {hex(ord(c)) for c in text if c.isspace() and ord(c) > 127}
        ),
    }


def normalize_french_spacing(text: str) -> str:
    """Used by the (separate) translation layer when emitting EN text:
    collapse NBSP-before-high-punctuation back to a plain rule. Kept here
    so the convention lives in one place. Not applied to source structure."""
    text = text.replace("\u00a0:", ":").replace("\u202f:", ":")
    text = text.replace("\u00a0;", ";").replace("\u00a0!", "!").replace("\u00a0?", "?")
    return text


# ----------------------------------------------------------------------------
# 3. structural style discovery
# ----------------------------------------------------------------------------
def discover_styles(work_dir: str, rpt: StyleReport) -> None:
    word = os.path.join(work_dir, "word")
    doc = _parse(os.path.join(word, "document.xml")).getroot()
    styles = _parse(os.path.join(word, "styles.xml")).getroot()
    numbering_path = os.path.join(word, "numbering.xml")

    # language
    langs = {}
    for el in doc.findall(".//" + W + "lang"):
        v = el.get(W + "val")
        if v:
            langs[v] = langs.get(v, 0) + 1
    rpt.source_lang = max(langs, key=langs.get) if langs else "unknown"
    if len(langs) > 1:
        minority = {k: v for k, v in langs.items() if k != rpt.source_lang}
        rpt.notes.append(
            f"Mixed-language runs present (minority: {minority}). Pre-existing "
            f"runs in the target language must pass through unchanged; flag in TN."
        )

    # paragraph + char style usage
    for p in doc.findall(".//" + W + "pStyle"):
        v = p.get(W + "val")
        rpt.para_styles[v] = rpt.para_styles.get(v, 0) + 1
    for r in doc.findall(".//" + W + "rStyle"):
        v = r.get(W + "val")
        rpt.char_styles[v] = rpt.char_styles.get(v, 0) + 1

    # styleId -> name map (handles styleId vs name mismatch, e.g. StyleTitre/Titre)
    name_of = {}
    for st in styles.findall(W + "style"):
        sid = st.get(W + "styleId")
        nm = st.find(W + "name")
        name_of[sid] = nm.get(W + "val") if nm is not None else sid

    # heading discovery: walk numbering.xml, take ilvl 0-1 with a pStyle binding.
    # Resolve the bound pStyle name back to an actual styleId in this doc.
    if os.path.exists(numbering_path):
        num = _parse(numbering_path).getroot()
        # name -> styleId reverse map for resolving numbering pStyle refs
        id_of_name = {v: k for k, v in name_of.items()}
        for an in num.findall(W + "abstractNum"):
            aid = an.get(W + "abstractNumId")
            for lvl in an.findall(W + "lvl"):
                ilvl = int(lvl.get(W + "ilvl"))
                ps = lvl.find(W + "pStyle")
                if ps is None or ilvl > 1:
                    continue
                ref = ps.get(W + "val")
                # numbering may reference by styleId or by name; resolve either way
                styleid = ref if ref in name_of else id_of_name.get(ref, ref)
                suff = lvl.find(W + "suff")
                fmt = lvl.find(W + "numFmt")
                rpt.heading_styles.append((
                    aid, ilvl, styleid,
                    suff.get(W + "val") if suff is not None else "tab(default)",
                    fmt.get(W + "val") if fmt is not None else "?",
                ))

    # spec-note style discovery: a style whose id/name contains 'specnote' /
    # 'notespec' / 'note de devis' / 'redacteur'. Reported, never assumed silently.
    note_pat = re.compile(r"spec\s*note|note\s*spec|note\s*de\s*devis|r[ée]dacteur",
                          re.I)
    for sid in rpt.para_styles:
        nm = name_of.get(sid, sid)
        if note_pat.search(sid) or note_pat.search(nm):
            rpt.spec_note_styles.append(sid)


# ----------------------------------------------------------------------------
# 4. accept tracked changes (lxml; paragraph-safe)
# ----------------------------------------------------------------------------
def accept_changes(work_dir: str, rpt: StyleReport) -> None:
    path = os.path.join(work_dir, "word", "document.xml")
    tree = _parse(path)
    root = tree.getroot()

    before = {
        "w:ins": len(root.findall(".//" + W + "ins")),
        "w:del": len(root.findall(".//" + W + "del")),
        "w:rPrChange": len(root.findall(".//" + W + "rPrChange")),
        "w:pPrChange": len(root.findall(".//" + W + "pPrChange")),
        "w:p": len(root.findall(".//" + W + "p")),
    }

    # change-records: drop the record, keep current properties
    for el in root.findall(".//" + W + "rPrChange") + root.findall(".//" + W + "pPrChange"):
        el.getparent().remove(el)
    # deletions: remove element + contents (the deleted text is rejected on accept)
    for el in list(root.findall(".//" + W + "del")):
        parent = el.getparent()
        if parent is not None:
            parent.remove(el)
    # insertions: unwrap, promoting children into the parent at the ins position
    for el in list(root.findall(".//" + W + "ins")):
        parent = el.getparent()
        if parent is None:
            continue
        idx = list(parent).index(el)
        for child in reversed(list(el)):
            parent.insert(idx, child)
        parent.remove(el)

    after = {
        "w:ins": len(root.findall(".//" + W + "ins")),
        "w:del": len(root.findall(".//" + W + "del")),
        "w:rPrChange": len(root.findall(".//" + W + "rPrChange")),
        "w:pPrChange": len(root.findall(".//" + W + "pPrChange")),
        "w:p": len(root.findall(".//" + W + "p")),
    }
    rpt.tracked_changes = {"before": before, "after": after}
    if before["w:p"] != after["w:p"]:
        rpt.notes.append(
            f"WARNING: paragraph count changed during accept "
            f"({before['w:p']} -> {after['w:p']}). Investigate before trusting output."
        )
    _save(tree, path)


# ----------------------------------------------------------------------------
# 5. strip comments (markup + metadata parts + rels)
# ----------------------------------------------------------------------------
def strip_comments(work_dir: str, rpt: StyleReport) -> None:
    word = os.path.join(work_dir, "word")
    path = os.path.join(word, "document.xml")
    tree = _parse(path)
    root = tree.getroot()

    removed = 0
    for tagname in ("commentRangeStart", "commentRangeEnd", "commentReference"):
        for el in list(root.findall(".//" + W + tagname)):
            el.getparent().remove(el)
            removed += 1
    # runs that exist only to carry a CommentReference rStyle become empty;
    # remove runs that now have no content child.
    for r in list(root.findall(".//" + W + "r")):
        has_content = any(
            child.tag in (W + "t", W + "drawing", W + "tab", W + "br",
                          W + "object", W + "pict")
            for child in r
        )
        if not has_content and r.find(W + "commentReference") is None:
            # only drop if it also has no text-bearing children at all
            if len(r.findall(W + "t")) == 0:
                rpr = r.find(W + "rPr")
                if rpr is not None and rpr.find(W + "rStyle") is not None:
                    rs = rpr.find(W + "rStyle").get(W + "val")
                    if rs and "comment" in rs.lower():
                        r.getparent().remove(r)
    _save(tree, path)
    rpt.comments_removed = removed

    # remove metadata parts
    for part in COMMENT_PARTS:
        fp = os.path.join(word, part)
        if os.path.exists(fp):
            os.remove(fp)

    # remove relationship entries pointing at comment parts
    rels_path = os.path.join(word, "_rels", "document.xml.rels")
    if os.path.exists(rels_path):
        rtree = _parse(rels_path)
        rroot = rtree.getroot()
        for rel in list(rroot):
            rtype = rel.get("Type", "")
            if any(rtype.endswith(t) for t in COMMENT_REL_TYPES):
                rroot.remove(rel)
        _save(rtree, rels_path)

    # remove from [Content_Types].xml overrides
    ct_path = os.path.join(work_dir, "[Content_Types].xml")
    if os.path.exists(ct_path):
        ctree = _parse(ct_path)
        croot = ctree.getroot()
        for ov in list(croot):
            part = ov.get("PartName", "")
            if any(part.endswith("/" + p) for p in COMMENT_PARTS):
                croot.remove(ov)
        _save(ctree, ct_path)


# ----------------------------------------------------------------------------
# 6. strip spec notes (by discovered style; empty placeholders deferred)
# ----------------------------------------------------------------------------
def strip_spec_notes(work_dir: str, rpt: StyleReport) -> None:
    if not rpt.spec_note_styles:
        return
    path = os.path.join(work_dir, "word", "document.xml")
    tree = _parse(path)
    root = tree.getroot()
    body = root.find(W + "body")
    note_set = set(rpt.spec_note_styles)

    def para_style(p):
        pPr = p.find(W + "pPr")
        if pPr is None:
            return None
        ps = pPr.find(W + "pStyle")
        return ps.get(W + "val") if ps is not None else None

    def para_text(p):
        return "".join(t.text or "" for t in p.findall(".//" + W + "t")).strip()

    idx = 0
    for p in list(body.findall(W + "p")):
        if para_style(p) in note_set:
            if para_text(p) == "":
                # empty placeholder: DEFERRED — report, do not delete
                rpt.empty_note_paras.append(idx)
            else:
                body.remove(p)
        idx += 1
    _save(tree, path)
    if rpt.empty_note_paras:
        rpt.notes.append(
            f"{len(rpt.empty_note_paras)} empty spec-note placeholder paragraph(s) "
            f"LEFT IN PLACE per current decision. Project rules say notes should not "
            f"remain as blank paragraphs; revisit."
        )


# ----------------------------------------------------------------------------
# 7. heading suffix fix (only 'nothing' suffixes on heading levels)
# ----------------------------------------------------------------------------
def fix_heading_suffix(work_dir: str, rpt: StyleReport) -> None:
    numbering_path = os.path.join(work_dir, "word", "numbering.xml")
    if not os.path.exists(numbering_path):
        return
    heading_styleids = {h[2] for h in rpt.heading_styles}
    tree = _parse(numbering_path)
    root = tree.getroot()
    name_changed = []
    for an in root.findall(W + "abstractNum"):
        for lvl in an.findall(W + "lvl"):
            ps = lvl.find(W + "pStyle")
            if ps is None:
                continue
            ref = ps.get(W + "val")
            suff = lvl.find(W + "suff")
            if suff is not None and suff.get(W + "val") == "nothing":
                # only fix if this level's pStyle is a discovered heading style
                if ref in heading_styleids or any(ref == h[2] for h in rpt.heading_styles):
                    suff.set(W + "val", "space")
                    name_changed.append(ref)
    if name_changed:
        _save(tree, numbering_path)
    rpt.suffix_fixes = name_changed


# ----------------------------------------------------------------------------
# 8. report
# ----------------------------------------------------------------------------
def write_report(rpt: StyleReport, path: str) -> None:
    L = []
    L.append("NMS/DDN PREPROCESSING REPORT (structure-only; no translation applied)")
    L.append("=" * 70)
    L.append(f"Detected source language : {rpt.source_lang}")
    L.append("")
    L.append("ENCODING PRE-SCAN")
    for k, v in rpt.encoding.items():
        L.append(f"  {k}: {v}")
    L.append("")
    L.append("PARAGRAPH STYLES (id : count)")
    for sid, c in sorted(rpt.para_styles.items(), key=lambda x: -x[1]):
        L.append(f"  {sid} : {c}")
    L.append("")
    L.append("CHARACTER STYLES (id : count)")
    if rpt.char_styles:
        for sid, c in sorted(rpt.char_styles.items(), key=lambda x: -x[1]):
            L.append(f"  {sid} : {c}")
    else:
        L.append("  (none)")
    L.append("")
    L.append("HEADING STYLES (discovered structurally via numbering.xml)")
    for aid, ilvl, sid, suff, fmt in rpt.heading_styles:
        L.append(f"  abstractNum {aid} ilvl {ilvl}: style={sid} suff={suff} fmt={fmt}")
    L.append("")
    L.append("SPEC-NOTE STYLES IDENTIFIED")
    L.append(f"  {rpt.spec_note_styles or '(none found)'}")
    if rpt.empty_note_paras:
        L.append(f"  empty note placeholders left in place: {rpt.empty_note_paras}")
    L.append("")
    L.append("TRACKED CHANGES")
    if rpt.tracked_changes:
        L.append(f"  before: {rpt.tracked_changes['before']}")
        L.append(f"  after : {rpt.tracked_changes['after']}")
    else:
        L.append("  (none)")
    L.append("")
    L.append(f"COMMENTS REMOVED (markup nodes): {rpt.comments_removed}")
    L.append("")
    L.append("HEADING SUFFIX FIX (nothing -> space)")
    L.append(f"  applied to: {rpt.suffix_fixes or '(no heading-level nothing suffixes found)'}")
    L.append("")
    L.append("NOTES / CAVEATS")
    if rpt.notes:
        for n in rpt.notes:
            L.append(f"  - {n}")
    else:
        L.append("  (none)")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


# ----------------------------------------------------------------------------
# orchestration
# ----------------------------------------------------------------------------
def preprocess(docx_path: str, out_docx: str, report_path: str,
               work_dir: str = "_work") -> StyleReport:
    rpt = StyleReport()
    unpack(docx_path, work_dir)
    encoding_prescan(work_dir, rpt)
    discover_styles(work_dir, rpt)
    accept_changes(work_dir, rpt)
    strip_comments(work_dir, rpt)
    strip_spec_notes(work_dir, rpt)
    fix_heading_suffix(work_dir, rpt)
    write_report(rpt, report_path)
    repack(work_dir, out_docx)
    return rpt


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("usage: python nms_preprocess.py <source.docx> [out.docx] [report.txt]")
        sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "preprocessed.docx"
    rep = sys.argv[3] if len(sys.argv) > 3 else "report.txt"
    r = preprocess(src, out, rep)
    print(f"Done. Output: {out}  Report: {rep}")
