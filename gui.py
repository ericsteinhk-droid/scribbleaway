"""
gui.py — EVOQ Spec Translator desktop GUI (tkinter, light mode).

Startup sequence:
  1. Privacy notice (bilingual, modal — must acknowledge to proceed)
  2. First-run wizard if config.json is missing
  3. Main window

Threading: pipeline runs in a daemon thread; all UI updates via after().
"""
from __future__ import annotations

import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
from pathlib import Path

from PIL import Image, ImageTk

import config as cfg_module
from config import Config, load, save, find_lexicon_near_exe

# run_pipeline is imported lazily in App._finish_init so the splash screen
# is visible during the slow lxml/anthropic import chain.
_run_pipeline = None


APP_TITLE    = "EVOQ Spec Translator"
APP_SUBTITLE = "Full-Featured Edition"
PAD = 8
BG = "#f0f0f0"
ACCENT = "#0055a5"
LOGO_FILE = "evoq_logo.png"


# ---------------------------------------------------------------------------
# Resource path helper (works in dev and in PyInstaller one-file exe)
# ---------------------------------------------------------------------------
def resource_path(relative: str) -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)


def load_logo(max_w: int, max_h: int) -> ImageTk.PhotoImage | None:
    try:
        img = Image.open(resource_path(LOGO_FILE))
        img.thumbnail((max_w, max_h), Image.LANCZOS)
        return ImageTk.PhotoImage(img)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Privacy notice (bilingual, modal)
# ---------------------------------------------------------------------------
class PrivacyNotice(tk.Toplevel):
    def __init__(self, parent: tk.Tk):
        super().__init__(parent)
        self.title(f"Avis / Notice — {APP_TITLE}")
        self.resizable(False, False)
        self.configure(bg="white")
        self.grab_set()
        self.attributes("-topmost", True)
        self.accepted = False

        logo = load_logo(240, 57)
        if logo:
            lbl = tk.Label(self, image=logo, bg="white")
            lbl.image = logo
            lbl.pack(pady=(PAD * 2, PAD))

        tk.Label(
            self,
            text="⚠   Avis de confidentialité / Privacy Notice",
            font=("Segoe UI", 11, "bold"),
            bg="white",
        ).pack(padx=PAD * 3, pady=(PAD, 4))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=PAD * 3, pady=4)

        tk.Label(
            self,
            text=(
                "Cette application transmet des extraits du document à l'API Claude d'Anthropic "
                "afin d'effectuer la traduction. Conformément aux conditions d'utilisation "
                "d'Anthropic, les données transmises via l'API ne sont pas utilisées pour "
                "entraîner des modèles d'intelligence artificielle. Il est néanmoins fortement "
                "recommandé d'anonymiser les renseignements protégés, tels que les références "
                "de projet et de client figurant dans l'en-tête du document, avant de commencer "
                "la traduction."
            ),
            wraplength=460,
            justify="left",
            font=("Segoe UI", 9),
            bg="white",
        ).pack(padx=PAD * 3, pady=(4, PAD))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=PAD * 3, pady=4)

        tk.Label(
            self,
            text=(
                "This application sends document excerpts to Anthropic's Claude API to perform "
                "translation. Under Anthropic's terms of service, data submitted via the API is "
                "not used to train AI models. It is nonetheless strongly recommended that "
                "protected information such as project and client references in the title "
                "header be anonymized before beginning the translation."
            ),
            wraplength=460,
            justify="left",
            font=("Segoe UI", 9),
            bg="white",
        ).pack(padx=PAD * 3, pady=(4, PAD))

        tk.Button(
            self,
            text="J'accepte / I Acknowledge",
            command=self._accept,
            font=("Segoe UI", 10, "bold"),
            bg=ACCENT,
            fg="white",
            activebackground="#003d7a",
            padx=PAD * 2,
            pady=6,
            relief="flat",
            cursor="hand2",
        ).pack(pady=(PAD, PAD * 2))

        self.protocol("WM_DELETE_WINDOW", lambda: None)

        self.update_idletasks()
        w, h = self.winfo_width(), self.winfo_height()
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"+{x}+{y}")

    def _accept(self) -> None:
        self.accepted = True
        self.destroy()


# ---------------------------------------------------------------------------
# Lexicon term add/edit dialog
# ---------------------------------------------------------------------------
class _TermDialog(tk.Toplevel):
    def __init__(self, parent: tk.Widget, title: str, en: str, fr: str):
        super().__init__(parent)
        self.title(title)
        self.resizable(False, False)
        self.configure(bg=BG)
        self.grab_set()
        self.result: tuple[str, str] | None = None

        tk.Label(self, text="English:", bg=BG).grid(
            row=0, column=0, padx=PAD, pady=PAD, sticky="e"
        )
        self._en = tk.StringVar(value=en)
        tk.Entry(self, textvariable=self._en, width=36).grid(
            row=0, column=1, padx=(0, PAD), pady=PAD
        )

        tk.Label(self, text="French:", bg=BG).grid(
            row=1, column=0, padx=PAD, pady=4, sticky="e"
        )
        self._fr = tk.StringVar(value=fr)
        tk.Entry(self, textvariable=self._fr, width=36).grid(
            row=1, column=1, padx=(0, PAD), pady=4
        )

        bf = tk.Frame(self, bg=BG)
        bf.grid(row=2, column=0, columnspan=2, pady=(PAD, PAD))
        tk.Button(
            bf, text="OK", width=10, bg=ACCENT, fg="white",
            activebackground="#003d7a", relief="flat", command=self._ok,
        ).pack(side="left", padx=4)
        tk.Button(bf, text="Cancel", width=10, command=self.destroy).pack(
            side="left", padx=4
        )

        self.bind("<Return>", lambda _e: self._ok())
        self.bind("<Escape>", lambda _e: self.destroy())

        self.update_idletasks()
        w, h = self.winfo_reqwidth(), self.winfo_reqheight()
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")

    def _ok(self) -> None:
        en = self._en.get().strip()
        fr = self._fr.get().strip()
        if not en or not fr:
            messagebox.showwarning("Incomplete", "Both fields are required.", parent=self)
            return
        self.result = (en, fr)
        self.destroy()


# ---------------------------------------------------------------------------
# Lexicon manager dialog
# ---------------------------------------------------------------------------
class LexiconManager(tk.Toplevel):
    """
    Modal dialog for viewing and editing the bilingual lexicon.

    The MASTER lexicon file is NEVER written to — all user changes are saved
    to a separate _custom.txt file in the same folder.  Custom entries override
    master entries with the same EN key at translation time.

    Colour coding:
      Gray  — master entry (read-only; can be overridden but not deleted)
      Blue  — custom-only entry (added by the user)
      Green — custom override of a master entry
    """

    _TAG_MASTER   = "master"
    _TAG_CUSTOM   = "custom"
    _TAG_OVERRIDE = "override"

    def __init__(self, parent: tk.Widget, lex_path: Path):
        super().__init__(parent)
        self.title("Manage Lexicon")
        self.resizable(True, True)
        self.minsize(700, 460)
        self.configure(bg=BG)
        self.grab_set()
        self._master_path = lex_path
        self._custom_path = lex_path.parent / (lex_path.stem + "_custom.txt")
        self._dirty = False

        self._build_ui()
        self._load()

        self.update_idletasks()
        w = max(self.winfo_width(), 700)
        h = max(self.winfo_height(), 460)
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")

    def _build_ui(self) -> None:
        top = tk.Frame(self, bg=BG, padx=PAD, pady=PAD)
        top.pack(fill="x")
        tk.Label(top, text="Search:", bg=BG).pack(side="left")
        self._search_var = tk.StringVar()
        self._search_var.trace_add("write", lambda *_: self._apply_filter())
        tk.Entry(top, textvariable=self._search_var, width=30).pack(
            side="left", padx=(4, PAD)
        )
        self._count_var = tk.StringVar(value="")
        tk.Label(
            top, textvariable=self._count_var,
            bg=BG, fg="#555555", font=("Segoe UI", 8),
        ).pack(side="right")

        # Legend
        leg = tk.Frame(self, bg=BG, padx=PAD)
        leg.pack(fill="x")
        for colour, label in [
            ("#888888", "Master (read-only)"),
            (ACCENT,    "Custom (new)"),
            ("#006600", "Custom override of master"),
        ]:
            tk.Label(leg, text="■", fg=colour, bg=BG,
                     font=("Segoe UI", 9)).pack(side="left")
            tk.Label(leg, text=label, bg=BG,
                     font=("Segoe UI", 8), fg=colour).pack(
                side="left", padx=(1, PAD)
            )

        mid = tk.Frame(self, bg=BG)
        mid.pack(fill="both", expand=True, padx=PAD, pady=(2, PAD))

        cols = ("en", "fr")
        self._tree = ttk.Treeview(
            mid, columns=cols, show="headings", selectmode="browse"
        )
        self._tree.heading("en", text="English Term",
                           command=lambda: self._sort("en"))
        self._tree.heading("fr", text="French Term",
                           command=lambda: self._sort("fr"))
        self._tree.column("en", width=290, minwidth=120)
        self._tree.column("fr", width=310, minwidth=120)
        self._tree.tag_configure(self._TAG_MASTER,   foreground="#888888")
        self._tree.tag_configure(self._TAG_CUSTOM,   foreground=ACCENT)
        self._tree.tag_configure(self._TAG_OVERRIDE, foreground="#006600")
        vsb = ttk.Scrollbar(mid, orient="vertical", command=self._tree.yview)
        self._tree.configure(yscrollcommand=vsb.set)
        self._tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="left", fill="y")
        self._tree.bind("<Double-1>", lambda _e: self._edit_selected())

        btn_col = tk.Frame(self, bg=BG, padx=PAD, pady=PAD)
        btn_col.pack(side="right", fill="y")
        for label, cmd in [
            ("Add",    self._add),
            ("Edit",   self._edit_selected),
            ("Delete", self._delete_selected),
        ]:
            tk.Button(btn_col, text=label, width=10, command=cmd).pack(pady=(0, 4))
        ttk.Separator(btn_col, orient="horizontal").pack(fill="x", pady=6)
        tk.Button(
            btn_col, text="Save", width=10, bg=ACCENT, fg="white",
            activebackground="#003d7a", relief="flat", command=self._save,
        ).pack(pady=(0, 4))
        tk.Button(btn_col, text="Close", width=10, command=self._close).pack()

        self._sort_col = "en"
        self._sort_rev = False

    def _load(self) -> None:
        from nms_translate import load_lexicon
        self._master: dict[str, str] = load_lexicon(self._master_path)
        self._custom: dict[str, str] = (
            load_lexicon(self._custom_path)
            if self._custom_path.is_file() else {}
        )
        self._apply_filter()

    def _merged(self) -> dict[str, str]:
        m = dict(self._master)
        m.update(self._custom)
        return m

    def _tag(self, en: str) -> str:
        if en in self._custom:
            return self._TAG_OVERRIDE if en in self._master else self._TAG_CUSTOM
        return self._TAG_MASTER

    def _apply_filter(self) -> None:
        q = self._search_var.get().strip().lower()
        self._tree.delete(*self._tree.get_children())
        merged = self._merged()
        pairs = sorted(
            merged.items(),
            key=lambda kv: kv[0 if self._sort_col == "en" else 1].lower(),
            reverse=self._sort_rev,
        )
        shown = 0
        for en, fr in pairs:
            if q and q not in en.lower() and q not in fr.lower():
                continue
            self._tree.insert("", "end", iid=en, values=(en, fr),
                               tags=(self._tag(en),))
            shown += 1
        total = len(merged)
        n_cust = len(self._custom)
        self._count_var.set(
            f"{shown} of {total} entries ({n_cust} custom)" if not q
            else f"{shown} of {total} shown"
        )

    def _sort(self, col: str) -> None:
        if self._sort_col == col:
            self._sort_rev = not self._sort_rev
        else:
            self._sort_col = col
            self._sort_rev = False
        self._apply_filter()

    def _add(self) -> None:
        dlg = _TermDialog(self, "Add Custom Term", "", "")
        self.wait_window(dlg)
        if dlg.result:
            en, fr = dlg.result
            self._custom[en] = fr
            self._dirty = True
            self._apply_filter()
            try:
                self._tree.selection_set(en)
                self._tree.see(en)
            except Exception:
                pass

    def _edit_selected(self) -> None:
        sel = self._tree.selection()
        if not sel:
            return
        en_old = sel[0]
        fr_old = self._custom.get(en_old) or self._master.get(en_old, "")
        dlg = _TermDialog(self, "Edit Term", en_old, fr_old)
        self.wait_window(dlg)
        if dlg.result:
            en_new, fr_new = dlg.result
            if en_new != en_old and en_old in self._custom:
                del self._custom[en_old]
            self._custom[en_new] = fr_new
            self._dirty = True
            self._apply_filter()
            try:
                self._tree.selection_set(en_new)
                self._tree.see(en_new)
            except Exception:
                pass

    def _delete_selected(self) -> None:
        sel = self._tree.selection()
        if not sel:
            return
        en = sel[0]
        if en not in self._custom:
            messagebox.showinfo(
                "Read-only entry",
                f"'{en}' is a master lexicon entry and cannot be deleted.\n\n"
                "To override it, select Edit — your custom value will take "
                "precedence during translation.",
                parent=self,
            )
            return
        is_override = en in self._master
        action = (
            "Remove custom override (master entry will be restored)"
            if is_override else "Delete custom entry"
        )
        if messagebox.askyesno(
            "Confirm delete",
            f"{action}:\n  {en}  →  {self._custom[en]}",
            parent=self,
        ):
            del self._custom[en]
            self._dirty = True
            self._apply_filter()

    def _save(self) -> None:
        if not self._custom:
            messagebox.showinfo(
                "Nothing to save", "No custom terms have been added.", parent=self
            )
            self._dirty = False
            return
        try:
            with open(self._custom_path, "w", encoding="utf-8") as f:
                f.write("# NMS/DDN Custom Terms — EVOQ Spec Translator\n")
                f.write("# Entries here override the master lexicon.\n")
                f.write("# Format: English term<TAB>French term\n")
                f.write("# ============================================================\n")
                for en, fr in sorted(self._custom.items()):
                    f.write(f"{en}\t{fr}\n")
            self._dirty = False
            messagebox.showinfo(
                "Saved",
                f"{len(self._custom)} custom term(s) saved to:\n"
                f"{self._custom_path.name}",
                parent=self,
            )
        except Exception as e:
            messagebox.showerror("Save failed", str(e), parent=self)

    def _close(self) -> None:
        if self._dirty:
            if messagebox.askyesno(
                "Unsaved changes",
                "Save custom terms before closing?",
                parent=self,
            ):
                self._save()
        self.destroy()


# ---------------------------------------------------------------------------
# Setup wizard (first run: API key only; settings mode: API key + lexicon)
# ---------------------------------------------------------------------------
class SetupWizard(tk.Toplevel):
    def __init__(
        self,
        parent: tk.Tk,
        first_run: bool = True,
        current_cfg: Config | None = None,
    ):
        super().__init__(parent)
        self.title(
            f"Setup — {APP_TITLE}" if first_run else f"Settings — {APP_TITLE}"
        )
        self.resizable(False, False)
        self.configure(bg=BG)
        self.grab_set()
        self.config_saved = False
        self._first_run = first_run

        heading = (
            "Configuration initiale / Initial Setup"
            if first_run
            else "Settings / Paramètres"
        )
        tk.Label(
            self, text=heading, font=("Segoe UI", 10, "bold"), bg=BG,
        ).grid(row=0, column=0, columnspan=3, padx=PAD * 2, pady=(PAD * 2, PAD), sticky="w")

        tk.Label(self, text="Anthropic API key:", bg=BG).grid(
            row=1, column=0, padx=PAD * 2, pady=4, sticky="w"
        )
        self._key_var = tk.StringVar(value=current_cfg.api_key if current_cfg else "")
        tk.Entry(self, textvariable=self._key_var, show="*", width=52).grid(
            row=1, column=1, columnspan=2, padx=(0, PAD * 2), pady=4, sticky="ew"
        )

        if first_run:
            discovered = find_lexicon_near_exe()
            lex_note = (
                f"Default lexicon: {discovered.name}"
                if discovered
                else "No lexicon found in app folder — use Settings to add one."
            )
            tk.Label(
                self, text=lex_note, bg=BG, fg="#555555", font=("Segoe UI", 8), anchor="w",
            ).grid(row=2, column=0, columnspan=3, padx=PAD * 2, pady=(0, PAD), sticky="w")
            self._lex_var = None
        else:
            current_lex = str(current_cfg.lexicon_path) if current_cfg else ""
            tk.Label(self, text="Lexicon file (.txt):", bg=BG).grid(
                row=2, column=0, padx=PAD * 2, pady=4, sticky="w"
            )
            self._lex_var = tk.StringVar(value=current_lex)
            tk.Entry(self, textvariable=self._lex_var, width=40).grid(
                row=2, column=1, padx=(0, 4), pady=4, sticky="ew"
            )
            tk.Button(self, text="Browse…", command=self._browse_lex).grid(
                row=2, column=2, padx=(0, PAD * 2), pady=4
            )

        tk.Button(
            self,
            text="Save & Continue",
            command=self._save,
            width=18,
            bg=ACCENT,
            fg="white",
            activebackground="#003d7a",
            relief="flat",
        ).grid(row=3, column=0, columnspan=3, padx=PAD * 2, pady=(PAD, PAD // 2))

        tk.Button(
            self,
            text="Manage Lexicon…",
            command=self._open_lexicon_manager,
            width=18,
            relief="flat",
            fg=ACCENT,
            bg=BG,
            cursor="hand2",
        ).grid(row=4, column=0, columnspan=3, padx=PAD * 2, pady=(PAD // 2, 2))

        tk.Button(
            self,
            text="Clear Translation Cache…",
            command=self._clear_cache,
            width=22,
            relief="flat",
            fg="#888888",
            bg=BG,
            cursor="hand2",
            font=("Segoe UI", 8),
        ).grid(row=5, column=0, columnspan=3, padx=PAD * 2, pady=(0, PAD * 2))

        self.columnconfigure(1, weight=1)

    def _browse_lex(self) -> None:
        path = filedialog.askopenfilename(
            title="Select lexicon file",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
        )
        if path:
            self._lex_var.set(path)

    def _save(self) -> None:
        key = self._key_var.get().strip()
        if not key.startswith("sk-ant-"):
            messagebox.showerror(
                "Invalid key", "API key must start with sk-ant-…", parent=self
            )
            return

        if self._first_run:
            discovered = find_lexicon_near_exe()
            lex = str(discovered) if discovered else ""
        else:
            lex = self._lex_var.get().strip()
            if not lex or not Path(lex).exists():
                messagebox.showerror(
                    "Missing lexicon",
                    "Please select a valid lexicon .txt file.",
                    parent=self,
                )
                return

        save(api_key=key, lexicon_path=lex)
        self.config_saved = True
        self.destroy()

    def _open_lexicon_manager(self) -> None:
        lex_path_str = self._lex_var.get().strip() if self._lex_var else ""
        if not lex_path_str or not Path(lex_path_str).exists():
            found = find_lexicon_near_exe()
            if found:
                lex_path_str = str(found)
            else:
                messagebox.showinfo(
                    "No lexicon",
                    "Save settings with a valid lexicon path first.",
                    parent=self,
                )
                return
        LexiconManager(self, Path(lex_path_str))

    def _clear_cache(self) -> None:
        import nms_cache
        n = nms_cache.count()
        if n == 0:
            messagebox.showinfo(
                "Cache empty", "Translation cache is already empty.", parent=self
            )
            return
        if messagebox.askyesno(
            "Clear cache",
            f"Delete all {n} cached translation(s)?\n\nThis cannot be undone.",
            parent=self,
        ):
            nms_cache.clear()
            messagebox.showinfo("Cleared", "Translation cache cleared.", parent=self)


# ---------------------------------------------------------------------------
# Main window
# ---------------------------------------------------------------------------
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.withdraw()

        self._cfg: Config | None = None
        self._log_queue: queue.Queue[str] = queue.Queue()
        self._running = False

        splash = self._make_launch_splash()
        self.after(50, lambda: self._finish_init(splash))

    def _make_launch_splash(self) -> tk.Toplevel:
        sp = tk.Toplevel(self)
        sp.overrideredirect(True)
        sp.configure(bg="white")
        sp.attributes("-topmost", True)
        logo = load_logo(200, 47)
        if logo:
            lbl = tk.Label(sp, image=logo, bg="white")
            lbl.image = logo
            lbl.pack(padx=40, pady=(28, 6))
        else:
            tk.Label(
                sp, text=APP_TITLE, font=("Segoe UI", 13, "bold"),
                bg="white", fg=ACCENT,
            ).pack(padx=40, pady=(28, 6))
        tk.Label(
            sp, text=APP_SUBTITLE, font=("Segoe UI", 9, "italic"),
            bg="white", fg="#444444",
        ).pack(pady=(0, 4))
        tk.Label(
            sp, text="Starting…", font=("Segoe UI", 9),
            bg="white", fg="#666666",
        ).pack(pady=(0, 24))
        sp.update_idletasks()
        w, h = sp.winfo_reqwidth(), sp.winfo_reqheight()
        sw, sh = sp.winfo_screenwidth(), sp.winfo_screenheight()
        sp.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")
        sp.update()
        return sp

    def _finish_init(self, splash: tk.Toplevel) -> None:
        global _run_pipeline
        from nms_pipeline import run_pipeline as _rp
        _run_pipeline = _rp

        try:
            import pyi_splash  # type: ignore[import]
            pyi_splash.close()
        except ImportError:
            pass

        splash.destroy()

        self.title(f"{APP_TITLE} — {APP_SUBTITLE}")
        self.resizable(True, True)
        self.minsize(700, 600)
        self.configure(bg=BG)

        self._build_ui()
        self.deiconify()

        self._show_privacy_notice()
        self._load_config()
        self.after(100, self._drain_log)

    # ── Privacy notice ───────────────────────────────────────────────────
    def _show_privacy_notice(self) -> None:
        notice = PrivacyNotice(self)
        self.wait_window(notice)
        if not notice.accepted:
            self.destroy()

    # ── Config ──────────────────────────────────────────────────────────
    def _load_config(self) -> None:
        self._cfg = load()
        if self._cfg is None:
            self._run_wizard()
            self._cfg = load()
        if self._cfg is None:
            messagebox.showerror(
                "Setup incomplete",
                "Configuration was not saved. Please restart and complete setup.",
            )
            self.destroy()
            return
        errors = self._cfg.validate()
        if errors:
            messagebox.showwarning(
                "Config issues",
                "Problems with saved configuration:\n\n" + "\n".join(errors) +
                "\n\nOpen Settings to fix.",
            )

    def _run_wizard(self) -> None:
        wizard = SetupWizard(self)
        self.wait_window(wizard)

    # ── UI construction ──────────────────────────────────────────────────
    def _build_ui(self) -> None:
        # ── Logo / title header ──
        header = tk.Frame(self, bg="white", pady=PAD)
        header.pack(fill="x")
        logo = load_logo(200, 47)
        if logo:
            lbl = tk.Label(header, image=logo, bg="white")
            lbl.image = logo
            lbl.pack()
        else:
            tk.Label(
                header, text=APP_TITLE, font=("Segoe UI", 13, "bold"), bg="white"
            ).pack()
        tk.Label(
            header, text=APP_SUBTITLE, font=("Segoe UI", 8, "italic"),
            bg="white", fg="#555555",
        ).pack(pady=(0, 4))
        ttk.Separator(self, orient="horizontal").pack(fill="x")

        # ── File queue ──
        fq = tk.Frame(self, bg=BG, padx=PAD, pady=PAD)
        fq.pack(fill="x")
        tk.Label(fq, text="Files to translate:", bg=BG, anchor="w").grid(
            row=0, column=0, columnspan=2, sticky="w", pady=(0, 2)
        )
        self._file_list: list[str] = []
        self._listbox = tk.Listbox(
            fq, height=4, selectmode="extended", font=("Segoe UI", 9)
        )
        self._listbox.grid(row=1, column=0, sticky="nsew", padx=(0, 4))
        sb = tk.Scrollbar(fq, orient="vertical", command=self._listbox.yview)
        sb.grid(row=1, column=1, sticky="ns")
        self._listbox.configure(yscrollcommand=sb.set)
        btn_col = tk.Frame(fq, bg=BG)
        btn_col.grid(row=1, column=2, sticky="n", padx=(4, 0))
        tk.Button(btn_col, text="Add Files…", width=12,
                  command=self._add_files).pack(pady=(0, 3))
        tk.Button(btn_col, text="Add Folder…", width=12,
                  command=self._add_folder).pack(pady=(0, 3))
        tk.Button(btn_col, text="Remove", width=12,
                  command=self._remove_selected).pack()
        fq.columnconfigure(0, weight=1)

        # ── Direction + output note ──
        frm = tk.Frame(self, bg=BG, padx=PAD)
        frm.pack(fill="x")
        tk.Label(frm, text="Direction:", bg=BG, width=12, anchor="e").grid(
            row=0, column=0, padx=(0, 4), pady=4, sticky="e"
        )
        self._dir_var = tk.StringVar(value="fr→en")
        dir_frame = tk.Frame(frm, bg=BG)
        dir_frame.grid(row=0, column=1, sticky="w", pady=4)
        for val, label in [("fr→en", "French → English"), ("en→fr", "English → French")]:
            tk.Radiobutton(
                dir_frame, text=label, variable=self._dir_var, value=val, bg=BG
            ).pack(side="left", padx=(0, PAD))
        tk.Label(
            frm, text="Output: same folder as each source file",
            bg=BG, fg="#666666", font=("Segoe UI", 8), anchor="w",
        ).grid(row=1, column=1, padx=(0, 4), pady=(0, 4), sticky="w")
        frm.columnconfigure(1, weight=1)

        # ── Settings / Estimate cost bar ──
        sf = tk.Frame(self, bg=BG)
        sf.pack(fill="x", padx=PAD)
        tk.Button(
            sf, text="Settings…", command=self._open_settings,
            relief="flat", fg=ACCENT, cursor="hand2", bg=BG,
        ).pack(side="right")
        tk.Button(
            sf, text="Estimate API cost…", command=self._estimate_cost,
            relief="flat", fg=ACCENT, cursor="hand2", bg=BG,
            font=("Segoe UI", 9),
        ).pack(side="left")

        # ── Translate button ──
        self._btn = tk.Button(
            self,
            text="Translate",
            command=self._start_translation,
            font=("Segoe UI", 11, "bold"),
            bg=ACCENT,
            fg="white",
            activebackground="#003d7a",
            padx=PAD * 2,
            pady=6,
            relief="flat",
            cursor="hand2",
        )
        self._btn.pack(pady=(4, 6))

        # ── Progress bar ──
        prog_frame = tk.Frame(self, bg=BG, padx=PAD)
        prog_frame.pack(fill="x", pady=(0, 2))
        self._progress = ttk.Progressbar(prog_frame, mode="indeterminate", length=100)
        self._progress.pack(side="left", fill="x", expand=True)
        self._prog_lbl = tk.StringVar(value="")
        tk.Label(
            prog_frame, textvariable=self._prog_lbl, bg=BG,
            font=("Segoe UI", 8), width=28, anchor="w",
        ).pack(side="left", padx=(6, 0))

        # ── Log ──
        tk.Label(self, text="Progress log:", bg=BG, anchor="w").pack(
            fill="x", padx=PAD, pady=(2, 0)
        )
        self._log = scrolledtext.ScrolledText(
            self,
            height=14,
            state="disabled",
            font=("Consolas", 9),
            bg="#ffffff",
            fg="#1a1a1a",
            insertbackground="black",
            wrap="word",
        )
        self._log.pack(fill="both", expand=True, padx=PAD, pady=(0, PAD))

        # ── Status bar ──
        self._status_var = tk.StringVar(value="Ready.")
        tk.Label(
            self, textvariable=self._status_var,
            bd=1, relief="sunken", anchor="w", bg="#e0e0e0",
        ).pack(fill="x", side="bottom")

    # ── File queue helpers ───────────────────────────────────────────────
    def _add_files(self) -> None:
        paths = filedialog.askopenfilenames(
            title="Select DOCX file(s)",
            filetypes=[("Word documents", "*.docx"), ("All files", "*.*")],
        )
        for p in paths:
            if p not in self._file_list:
                self._file_list.append(p)
                self._listbox.insert("end", Path(p).name)

    def _add_folder(self) -> None:
        folder = filedialog.askdirectory(
            title="Select folder containing DOCX files"
        )
        if not folder:
            return
        found = sorted(Path(folder).glob("*.docx"))
        if not found:
            messagebox.showinfo(
                "No files found", f"No .docx files found in:\n{folder}"
            )
            return
        added = 0
        for p in found:
            sp = str(p)
            if sp not in self._file_list:
                self._file_list.append(sp)
                self._listbox.insert("end", p.name)
                added += 1
        if added:
            self._enqueue_log(f"Added {added} file(s) from: {folder}")

    def _remove_selected(self) -> None:
        for idx in reversed(self._listbox.curselection()):
            self._listbox.delete(idx)
            self._file_list.pop(idx)

    # ── Settings ─────────────────────────────────────────────────────────
    def _open_settings(self) -> None:
        wizard = SetupWizard(self, first_run=False, current_cfg=self._cfg)
        self.wait_window(wizard)
        self._cfg = load()

    # ── Cost estimate ─────────────────────────────────────────────────────
    def _estimate_cost(self) -> None:
        srcs = list(self._file_list)
        if not srcs:
            messagebox.showinfo("No files", "Add at least one file first.")
            return
        from nms_translate import estimate_translation_cost
        lines = []
        total_cost = 0.0
        for src in srcs:
            est = estimate_translation_cost(src)
            if "error" in est:
                lines.append(f"{Path(src).name}:\n  Error — {est['error']}")
            else:
                lines.append(
                    f"{Path(src).name}:\n"
                    f"  {est['para_count']} paragraphs, {est['total_chars']:,} chars\n"
                    f"  ~{est['est_input_tokens']:,} input / "
                    f"{est['est_output_tokens']:,} output tokens\n"
                    f"  Est. USD ${est['est_cost_usd']:.4f} (with prompt caching)"
                )
                total_cost += est["est_cost_usd"]
        if len(srcs) > 1:
            lines.append(f"Total estimated cost: USD ${total_cost:.4f}")
        lines.append("(Estimates assume Sonnet 4.6 pricing; actual costs vary.)")
        messagebox.showinfo("API Cost Estimate", "\n\n".join(lines))

    # ── Translation ──────────────────────────────────────────────────────
    def _start_translation(self) -> None:
        if self._running:
            return

        srcs = list(self._file_list)

        if not srcs:
            messagebox.showerror(
                "Missing file", "Please add at least one source DOCX file."
            )
            return
        for src in srcs:
            if not Path(src).exists():
                messagebox.showerror("File not found", f"File not found:\n{src}")
                return
            if Path(src).suffix.lower() != ".docx":
                messagebox.showerror(
                    "Unsupported file type",
                    f"Only DOCX files can be translated:\n{Path(src).name}",
                )
                return
        if self._cfg is None:
            messagebox.showerror("No config", "Configuration missing. Open Settings.")
            return
        errors = self._cfg.validate()
        if errors:
            messagebox.showerror("Config error", "\n".join(errors))
            return

        self._clear_log()
        self._set_running(True)

        thread = threading.Thread(
            target=self._pipeline_thread,
            args=(srcs, self._dir_var.get()),
            daemon=True,
        )
        thread.start()

    def _pipeline_thread(self, srcs: list[str], direction: str) -> None:
        total_files = len(srcs)
        try:
            for i, src in enumerate(srcs):
                out = str(Path(src).parent)
                if total_files > 1:
                    self._enqueue_log(
                        f"\n{'─' * 50}\n"
                        f"  File {i + 1} of {total_files}: {Path(src).name}\n"
                        f"{'─' * 50}"
                    )
                outputs = _run_pipeline(
                    src_docx=src,
                    output_dir=out,
                    direction=direction,
                    cfg=self._cfg,
                    delete_empty_notes=False,
                    log=self._enqueue_log,
                    progress_cb=lambda done, total, fi=i + 1, ft=total_files:
                        self._on_progress(done, total, fi, ft),
                )
                self._enqueue_log("")
                self._enqueue_log("Output files:")
                for label, path in outputs.items():
                    self._enqueue_log(f"  {label}: {path}")

            self._enqueue_log("")
            n = f"{total_files} file{'s' if total_files > 1 else ''}"
            self._enqueue_log(f"✓ {n} translated successfully.")
            self.after(0, lambda: self._status_var.set("Success!"))
            self.after(0, lambda: self._on_success(total_files))
        except Exception as exc:
            msg = str(exc)
            self._enqueue_log(f"\nERROR: {msg}")
            self.after(0, lambda: messagebox.showerror("Translation failed", msg))
            self.after(0, lambda: self._status_var.set("Error — see log."))
        finally:
            self.after(0, lambda: self._set_running(False))

    def _on_success(self, count: int) -> None:
        n = f"{count} file{'s' if count > 1 else ''}"
        again = messagebox.askyesno(
            "Success!",
            f"{n} translated successfully!\n\nTranslate more files?",
            icon="info",
        )
        if again:
            self._file_list.clear()
            self._listbox.delete(0, "end")
            self._clear_log()
            self._progress.configure(mode="determinate", value=0)
            self._prog_lbl.set("")
            self._status_var.set("Ready.")
        else:
            messagebox.showinfo(
                "Thank you",
                f"Thank you for using {APP_TITLE}.\n\nThe application will now close.",
            )
            self.destroy()

    def _on_progress(self, done: int, total: int, file_idx: int, total_files: int) -> None:
        if total_files > 1:
            label = f"File {file_idx}/{total_files}: {done}/{total} paras"
        else:
            label = f"{done} / {total} paragraphs"
        pct = int(done / total * 100) if total else 0

        def _update() -> None:
            self._prog_lbl.set(label)
            self._progress.stop()
            self._progress.configure(mode="determinate", maximum=100, value=pct)

        self.after(0, _update)

    def _enqueue_log(self, msg: str) -> None:
        self._log_queue.put(msg)

    def _drain_log(self) -> None:
        try:
            while True:
                self._append_log(self._log_queue.get_nowait())
        except queue.Empty:
            pass
        self.after(100, self._drain_log)

    def _append_log(self, msg: str) -> None:
        self._log.configure(state="normal")
        self._log.insert("end", msg + "\n")
        self._log.see("end")
        self._log.configure(state="disabled")

    def _clear_log(self) -> None:
        self._log.configure(state="normal")
        self._log.delete("1.0", "end")
        self._log.configure(state="disabled")

    def _set_running(self, running: bool) -> None:
        self._running = running
        self._btn.configure(state="disabled" if running else "normal")
        if running:
            self._progress.configure(mode="indeterminate", value=0)
            self._progress.start(12)
            self._prog_lbl.set("Working…")
            self._status_var.set("Translating…")
        else:
            self._progress.stop()
            if not self._prog_lbl.get().startswith("ERROR"):
                self._prog_lbl.set("")
            self._progress.configure(mode="determinate", value=0)


# ---------------------------------------------------------------------------
def main() -> None:
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
