"""
gui.py — NMS/DDN Translator desktop GUI (tkinter, light mode).

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
from config import Config, load, save
from nms_pipeline import run_pipeline


APP_TITLE = "NMS/DDN Translator"
PAD = 8
BG = "#f0f0f0"
ACCENT = "#0055a5"
LOGO_FILE = "evoq_logo.png"
MAX_FILES = 3


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
        self.title("Avis / Notice — NMS/DDN Translator")
        self.resizable(False, False)
        self.configure(bg="white")
        self.grab_set()
        self.accepted = False

        # Logo
        logo = load_logo(240, 57)
        if logo:
            lbl = tk.Label(self, image=logo, bg="white")
            lbl.image = logo
            lbl.pack(pady=(PAD * 2, PAD))

        # Title
        tk.Label(
            self,
            text="⚠   Avis de confidentialité / Privacy Notice",
            font=("Segoe UI", 11, "bold"),
            bg="white",
        ).pack(padx=PAD * 3, pady=(PAD, 4))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=PAD * 3, pady=4)

        # French
        tk.Label(
            self,
            text=(
                "Cette application transmet temporairement des informations à un modèle de "
                "langage IA accessible sur Internet afin d'effectuer la traduction. Il est "
                "fortement recommandé d'anonymiser les renseignements protégés, tels que les "
                "références de projet et de client figurant dans l'en-tête du document, "
                "avant de commencer la traduction."
            ),
            wraplength=460,
            justify="left",
            font=("Segoe UI", 9),
            bg="white",
        ).pack(padx=PAD * 3, pady=(4, PAD))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=PAD * 3, pady=4)

        # English
        tk.Label(
            self,
            text=(
                "This application temporarily shares information with an internet-based AI "
                "language model to perform translation. It is strongly recommended that "
                "protected information such as project and client references in the title "
                "header be anonymized before beginning the translation."
            ),
            wraplength=460,
            justify="left",
            font=("Segoe UI", 9),
            bg="white",
        ).pack(padx=PAD * 3, pady=(4, PAD))

        # Acknowledge button
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

        # Prevent closing without acknowledging
        self.protocol("WM_DELETE_WINDOW", lambda: None)

        # Centre on screen
        self.update_idletasks()
        w, h = self.winfo_width(), self.winfo_height()
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"+{x}+{y}")

    def _accept(self) -> None:
        self.accepted = True
        self.destroy()


# ---------------------------------------------------------------------------
# First-run wizard
# ---------------------------------------------------------------------------
class SetupWizard(tk.Toplevel):
    def __init__(self, parent: tk.Tk):
        super().__init__(parent)
        self.title("Setup — NMS/DDN Translator")
        self.resizable(False, False)
        self.configure(bg=BG)
        self.grab_set()
        self.config_saved = False

        tk.Label(
            self,
            text="Configuration initiale / Initial Setup",
            font=("Segoe UI", 10, "bold"),
            bg=BG,
        ).grid(row=0, column=0, columnspan=3, padx=PAD * 2, pady=(PAD * 2, PAD), sticky="w")

        tk.Label(self, text="Anthropic API key:", bg=BG).grid(
            row=1, column=0, padx=PAD * 2, pady=4, sticky="w"
        )
        self._key_var = tk.StringVar()
        tk.Entry(self, textvariable=self._key_var, show="*", width=52).grid(
            row=1, column=1, columnspan=2, padx=(0, PAD * 2), pady=4, sticky="ew"
        )

        tk.Label(self, text="Lexicon file (.txt):", bg=BG).grid(
            row=2, column=0, padx=PAD * 2, pady=4, sticky="w"
        )
        self._lex_var = tk.StringVar()
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
        ).grid(row=3, column=0, columnspan=3, padx=PAD * 2, pady=(PAD, PAD * 2))

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
        lex = self._lex_var.get().strip()
        if not key.startswith("sk-ant-"):
            messagebox.showerror("Invalid key", "API key must start with sk-ant-…", parent=self)
            return
        if not lex or not Path(lex).exists():
            messagebox.showerror(
                "Missing lexicon", "Please select a valid lexicon .txt file.", parent=self
            )
            return
        save(api_key=key, lexicon_path=lex)
        self.config_saved = True
        self.destroy()


# ---------------------------------------------------------------------------
# Main window
# ---------------------------------------------------------------------------
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.resizable(True, True)
        self.minsize(680, 580)
        self.configure(bg=BG)

        self._cfg: Config | None = None
        self._log_queue: queue.Queue[str] = queue.Queue()
        self._running = False

        self._build_ui()

        # Show privacy notice before anything else
        self._show_privacy_notice()

        # Load config (may trigger first-run wizard)
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
        # ── Logo header ──
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
        ttk.Separator(self, orient="horizontal").pack(fill="x")

        # ── Inputs ──
        frm = tk.Frame(self, bg=BG, padx=PAD, pady=PAD)
        frm.pack(fill="x")

        # File rows (up to MAX_FILES)
        self._src_vars: list[tk.StringVar] = []
        file_labels = ["File 1 (required):", "File 2:", "File 3:"]
        for i in range(MAX_FILES):
            tk.Label(frm, text=file_labels[i], bg=BG, width=18, anchor="e").grid(
                row=i, column=0, padx=(0, 4), pady=3, sticky="e"
            )
            var = tk.StringVar()
            self._src_vars.append(var)
            tk.Entry(frm, textvariable=var).grid(
                row=i, column=1, padx=(0, 4), pady=3, sticky="ew"
            )
            tk.Button(
                frm, text="Browse…", command=lambda idx=i: self._browse_src(idx)
            ).grid(row=i, column=2, pady=3)

        # Direction
        tk.Label(frm, text="Direction:", bg=BG, width=18, anchor="e").grid(
            row=MAX_FILES, column=0, padx=(0, 4), pady=4, sticky="e"
        )
        self._dir_var = tk.StringVar(value="fr→en")
        dir_frame = tk.Frame(frm, bg=BG)
        dir_frame.grid(row=MAX_FILES, column=1, sticky="w", pady=4)
        for val, label in [("fr→en", "French → English"), ("en→fr", "English → French")]:
            tk.Radiobutton(
                dir_frame, text=label, variable=self._dir_var, value=val, bg=BG
            ).pack(side="left", padx=(0, PAD))

        # Output folder
        tk.Label(frm, text="Output folder:", bg=BG, width=18, anchor="e").grid(
            row=MAX_FILES + 1, column=0, padx=(0, 4), pady=4, sticky="e"
        )
        self._out_var = tk.StringVar()
        tk.Entry(frm, textvariable=self._out_var).grid(
            row=MAX_FILES + 1, column=1, padx=(0, 4), pady=4, sticky="ew"
        )
        tk.Button(frm, text="Browse…", command=self._browse_out).grid(
            row=MAX_FILES + 1, column=2, pady=4
        )

        frm.columnconfigure(1, weight=1)

        # ── Settings link ──
        sf = tk.Frame(self, bg=BG)
        sf.pack(fill="x", padx=PAD)
        tk.Button(
            sf, text="Settings…", command=self._open_settings,
            relief="flat", fg=ACCENT, cursor="hand2", bg=BG,
        ).pack(side="right")

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

    # ── Browse helpers ───────────────────────────────────────────────────
    def _browse_src(self, idx: int) -> None:
        path = filedialog.askopenfilename(
            title="Select source DOCX file",
            filetypes=[("Word documents", "*.docx"), ("All files", "*.*")],
        )
        if path:
            self._src_vars[idx].set(path)
            if idx == 0 and not self._out_var.get():
                self._out_var.set(str(Path(path).parent))

    def _browse_out(self) -> None:
        path = filedialog.askdirectory(title="Select output folder")
        if path:
            self._out_var.set(path)

    def _open_settings(self) -> None:
        self._run_wizard()
        self._cfg = load()

    # ── Translation ──────────────────────────────────────────────────────
    def _start_translation(self) -> None:
        if self._running:
            return

        srcs = [v.get().strip() for v in self._src_vars if v.get().strip()]
        out = self._out_var.get().strip()

        if not srcs:
            messagebox.showerror("Missing file", "Please select at least one source DOCX file.")
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
        if not out:
            messagebox.showerror("Missing folder", "Please select an output folder.")
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
            args=(srcs, out, self._dir_var.get()),
            daemon=True,
        )
        thread.start()

    def _pipeline_thread(self, srcs: list[str], out: str, direction: str) -> None:
        total_files = len(srcs)
        try:
            for i, src in enumerate(srcs):
                if total_files > 1:
                    self._enqueue_log(
                        f"\n{'─' * 50}\n"
                        f"  File {i + 1} of {total_files}: {Path(src).name}\n"
                        f"{'─' * 50}"
                    )
                outputs = run_pipeline(
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
            for v in self._src_vars:
                v.set("")
            self._out_var.set("")
            self._clear_log()
            self._progress.configure(mode="determinate", value=0)
            self._prog_lbl.set("")
            self._status_var.set("Ready.")
        else:
            messagebox.showinfo(
                "Thank you",
                "Thank you for using NMS/DDN Translator.\n\nThe application will now close.",
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
