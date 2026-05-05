"""
Word Search GUI — searches for keywords across .docx files in a selected folder.
Requires: python-docx
Build to .exe: see README_BUILD.md
"""

import csv
import os
import queue
import re
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from docx import Document
    from docx.opc.exceptions import PackageNotFoundError
except ImportError:
    messagebox.showerror(
        "Missing dependency",
        "python-docx is not installed.\nRun: pip install python-docx",
    )
    raise SystemExit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sentences_around(text: str, keyword: str, case_sensitive: bool, context: int = 120) -> str:
    """Return a short excerpt that contains *keyword* inside *text*."""
    flags = 0 if case_sensitive else re.IGNORECASE
    match = re.search(re.escape(keyword), text, flags=flags)
    if not match:
        return ""
    start = max(0, match.start() - context)
    end = min(len(text), match.end() + context)
    excerpt = text[start:end].replace("\n", " ").strip()
    if start > 0:
        excerpt = "…" + excerpt
    if end < len(text):
        excerpt = excerpt + "…"
    return excerpt


def _extract_text(path: str):
    """
    Return full text of a .docx file as a single string.
    Raises on unreadable / password-protected files.
    """
    doc = Document(path)
    parts = []
    for para in doc.paragraphs:
        parts.append(para.text)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                parts.append(cell.text)
    return "\n".join(parts)


def _collect_docx(folder: str, recursive: bool):
    """Yield absolute paths to every .docx under *folder*."""
    if recursive:
        for root, _dirs, files in os.walk(folder):
            for f in files:
                if f.lower().endswith(".docx"):
                    yield os.path.join(root, f)
    else:
        for f in os.listdir(folder):
            if f.lower().endswith(".docx"):
                yield os.path.join(folder, f)


# ---------------------------------------------------------------------------
# Search worker (runs in background thread)
# ---------------------------------------------------------------------------

def search_worker(
    folder: str,
    recursive: bool,
    keywords: list,
    match_all: bool,
    case_sensitive: bool,
    result_queue: queue.Queue,
):
    """
    Scans .docx files and puts result dicts onto *result_queue*.
    Special sentinel messages:
      {"type": "progress", "current": n, "total": n, "filename": str}
      {"type": "match", ...row data...}
      {"type": "error", "filename": str, "path": str, "reason": str}
      {"type": "done", "matches": int, "files_with_matches": set}
    """
    paths = list(_collect_docx(folder, recursive))
    total = len(paths)
    match_count = 0
    files_with_matches = set()

    for idx, path in enumerate(paths, 1):
        filename = os.path.basename(path)
        result_queue.put({"type": "progress", "current": idx, "total": total, "filename": filename})

        try:
            text = _extract_text(path)
        except (PackageNotFoundError, Exception) as exc:
            result_queue.put({"type": "error", "filename": filename, "path": path, "reason": str(exc)})
            continue

        flags = 0 if case_sensitive else re.IGNORECASE

        matched_keywords = []
        for kw in keywords:
            if re.search(re.escape(kw), text, flags):
                matched_keywords.append(kw)

        hit = (len(matched_keywords) == len(keywords)) if match_all else bool(matched_keywords)

        if hit:
            for kw in matched_keywords:
                excerpt = _sentences_around(text, kw, case_sensitive)
                result_queue.put({
                    "type": "match",
                    "filename": filename,
                    "path": path,
                    "keyword": kw,
                    "excerpt": excerpt,
                })
                match_count += 1
            files_with_matches.add(path)

    result_queue.put({"type": "done", "matches": match_count, "files_with_matches": files_with_matches})


# ---------------------------------------------------------------------------
# Main application
# ---------------------------------------------------------------------------

class WordSearchApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Word Search — .docx Files")
        self.minsize(900, 600)
        self.configure(bg="#f0f0f0")

        self._result_queue = queue.Queue()
        self._search_thread = None
        self._all_rows = []        # list of (filename, path, keyword, excerpt)
        self._error_rows = []      # list of (filename, path, reason)

        self._build_ui()
        self.after(100, self._poll_queue)

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        pad = {"padx": 8, "pady": 4}

        # ---- Top panel: folder + options ----
        top = tk.LabelFrame(self, text="Search Settings", bg="#f0f0f0", font=("Segoe UI", 9, "bold"))
        top.pack(fill="x", padx=10, pady=(10, 4))

        # Folder row
        tk.Label(top, text="Folder:", bg="#f0f0f0").grid(row=0, column=0, sticky="e", **pad)
        self._folder_var = tk.StringVar()
        tk.Entry(top, textvariable=self._folder_var, width=60).grid(row=0, column=1, sticky="ew", **pad)
        tk.Button(top, text="Browse…", command=self._browse_folder).grid(row=0, column=2, **pad)

        # Keywords row
        tk.Label(top, text="Keywords:", bg="#f0f0f0").grid(row=1, column=0, sticky="e", **pad)
        self._keywords_var = tk.StringVar()
        kw_entry = tk.Entry(top, textvariable=self._keywords_var, width=60)
        kw_entry.grid(row=1, column=1, sticky="ew", **pad)
        tk.Label(top, text="(comma-separated)", bg="#f0f0f0", fg="#666").grid(row=1, column=2, sticky="w", **pad)

        # Options row
        opts = tk.Frame(top, bg="#f0f0f0")
        opts.grid(row=2, column=0, columnspan=3, sticky="w", padx=8, pady=4)

        self._recursive_var = tk.BooleanVar(value=True)
        tk.Checkbutton(opts, text="Include subfolders", variable=self._recursive_var,
                       bg="#f0f0f0").pack(side="left", padx=(0, 16))

        self._match_all_var = tk.BooleanVar(value=False)
        tk.Checkbutton(opts, text="Match ALL keywords (AND)", variable=self._match_all_var,
                       bg="#f0f0f0").pack(side="left", padx=(0, 16))

        self._case_var = tk.BooleanVar(value=False)
        tk.Checkbutton(opts, text="Case-sensitive", variable=self._case_var,
                       bg="#f0f0f0").pack(side="left", padx=(0, 16))

        top.columnconfigure(1, weight=1)

        # ---- Action bar ----
        action = tk.Frame(self, bg="#f0f0f0")
        action.pack(fill="x", padx=10, pady=2)

        self._search_btn = tk.Button(
            action, text="Search", bg="#0078d4", fg="white",
            font=("Segoe UI", 10, "bold"), padx=16, pady=4,
            relief="flat", cursor="hand2", command=self._start_search,
        )
        self._search_btn.pack(side="left")

        self._export_btn = tk.Button(
            action, text="Export to CSV…", padx=12, pady=4,
            relief="flat", cursor="hand2", command=self._export_csv, state="disabled",
        )
        self._export_btn.pack(side="left", padx=(8, 0))

        self._errors_btn = tk.Button(
            action, text="Show Skipped Files", padx=12, pady=4,
            relief="flat", cursor="hand2", command=self._show_errors, state="disabled",
        )
        self._errors_btn.pack(side="left", padx=(8, 0))

        self._status_var = tk.StringVar(value="Ready.")
        tk.Label(action, textvariable=self._status_var, bg="#f0f0f0", fg="#444",
                 font=("Segoe UI", 9)).pack(side="left", padx=16)

        # ---- Progress bar ----
        self._progress_var = tk.DoubleVar(value=0)
        self._progress = ttk.Progressbar(self, variable=self._progress_var, maximum=100)
        self._progress.pack(fill="x", padx=10, pady=(2, 4))

        # ---- Results table ----
        results_frame = tk.LabelFrame(self, text="Results", bg="#f0f0f0",
                                      font=("Segoe UI", 9, "bold"))
        results_frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        cols = ("filename", "path", "keyword", "excerpt")
        self._tree = ttk.Treeview(results_frame, columns=cols, show="headings", selectmode="extended")
        self._tree.heading("filename", text="File Name")
        self._tree.heading("path", text="Full Path")
        self._tree.heading("keyword", text="Matched Keyword")
        self._tree.heading("excerpt", text="Excerpt")

        self._tree.column("filename", width=180, minwidth=100)
        self._tree.column("path", width=260, minwidth=120)
        self._tree.column("keyword", width=120, minwidth=80)
        self._tree.column("excerpt", width=340, minwidth=140)

        vsb = ttk.Scrollbar(results_frame, orient="vertical", command=self._tree.yview)
        hsb = ttk.Scrollbar(results_frame, orient="horizontal", command=self._tree.xview)
        self._tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        self._tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")
        results_frame.rowconfigure(0, weight=1)
        results_frame.columnconfigure(0, weight=1)

        # Alternating row colors
        self._tree.tag_configure("odd", background="#ffffff")
        self._tree.tag_configure("even", background="#f5f8fc")

        # Double-click to open file location
        self._tree.bind("<Double-1>", self._open_file_location)

    # ------------------------------------------------------------------
    # UI actions
    # ------------------------------------------------------------------

    def _browse_folder(self):
        folder = filedialog.askdirectory(title="Select folder to search")
        if folder:
            self._folder_var.set(folder)

    def _start_search(self):
        folder = self._folder_var.get().strip()
        if not folder or not os.path.isdir(folder):
            messagebox.showwarning("No folder", "Please select a valid folder first.")
            return

        raw_kw = self._keywords_var.get().strip()
        if not raw_kw:
            messagebox.showwarning("No keywords", "Please enter at least one keyword.")
            return

        keywords = [k.strip() for k in raw_kw.split(",") if k.strip()]
        if not keywords:
            messagebox.showwarning("No keywords", "Could not parse any keywords.")
            return

        if self._search_thread and self._search_thread.is_alive():
            messagebox.showinfo("Busy", "A search is already running. Please wait.")
            return

        # Reset state
        self._all_rows.clear()
        self._error_rows.clear()
        for item in self._tree.get_children():
            self._tree.delete(item)
        self._progress_var.set(0)
        self._export_btn.config(state="disabled")
        self._errors_btn.config(state="disabled")
        self._search_btn.config(state="disabled")
        self._status_var.set("Scanning…")

        self._search_thread = threading.Thread(
            target=search_worker,
            args=(
                folder,
                self._recursive_var.get(),
                keywords,
                self._match_all_var.get(),
                self._case_var.get(),
                self._result_queue,
            ),
            daemon=True,
        )
        self._search_thread.start()

    def _poll_queue(self):
        """Drain the result queue and update the UI — called every 50 ms."""
        try:
            while True:
                msg = self._result_queue.get_nowait()
                mtype = msg["type"]

                if mtype == "progress":
                    pct = (msg["current"] / msg["total"] * 100) if msg["total"] else 0
                    self._progress_var.set(pct)
                    self._status_var.set(
                        f"Scanning {msg['current']}/{msg['total']}: {msg['filename']}"
                    )

                elif mtype == "match":
                    self._all_rows.append((
                        msg["filename"], msg["path"], msg["keyword"], msg["excerpt"]
                    ))
                    tag = "even" if len(self._all_rows) % 2 == 0 else "odd"
                    self._tree.insert(
                        "", "end",
                        values=(msg["filename"], msg["path"], msg["keyword"], msg["excerpt"]),
                        tags=(tag,),
                    )

                elif mtype == "error":
                    self._error_rows.append((msg["filename"], msg["path"], msg["reason"]))

                elif mtype == "done":
                    n_matches = msg["matches"]
                    n_files = len(msg["files_with_matches"])
                    self._status_var.set(
                        f"Done. Found {n_matches} match{'es' if n_matches != 1 else ''}"
                        f" across {n_files} file{'s' if n_files != 1 else ''}."
                    )
                    self._progress_var.set(100)
                    self._search_btn.config(state="normal")
                    if self._all_rows:
                        self._export_btn.config(state="normal")
                    if self._error_rows:
                        self._errors_btn.config(state="normal")

        except queue.Empty:
            pass

        self.after(50, self._poll_queue)

    def _open_file_location(self, _event):
        """Double-click: reveal file in Explorer (Windows only)."""
        selection = self._tree.selection()
        if not selection:
            return
        path = self._tree.item(selection[0], "values")[1]
        if os.path.exists(path):
            os.startfile(os.path.dirname(path))

    def _export_csv(self):
        if not self._all_rows:
            messagebox.showinfo("Nothing to export", "No results to export.")
            return
        dest = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            title="Save results as CSV",
        )
        if not dest:
            return
        try:
            with open(dest, "w", newline="", encoding="utf-8-sig") as f:
                writer = csv.writer(f)
                writer.writerow(["File Name", "Full Path", "Matched Keyword", "Excerpt"])
                writer.writerows(self._all_rows)
            messagebox.showinfo("Exported", f"Results saved to:\n{dest}")
        except OSError as exc:
            messagebox.showerror("Export failed", str(exc))

    def _show_errors(self):
        if not self._error_rows:
            return
        win = tk.Toplevel(self)
        win.title("Skipped / Unreadable Files")
        win.minsize(700, 300)

        cols = ("filename", "path", "reason")
        tree = ttk.Treeview(win, columns=cols, show="headings")
        tree.heading("filename", text="File Name")
        tree.heading("path", text="Full Path")
        tree.heading("reason", text="Reason Skipped")
        tree.column("filename", width=160)
        tree.column("path", width=280)
        tree.column("reason", width=240)

        vsb = ttk.Scrollbar(win, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=vsb.set)
        tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

        for row in self._error_rows:
            tree.insert("", "end", values=row)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = WordSearchApp()
    app.mainloop()
