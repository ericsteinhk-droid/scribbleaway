"""
gui.py — NMS/DDN Translator desktop GUI (tkinter).

Single-window design: file picker, direction selector, output folder,
progress log, Translate button.  First-run wizard appears automatically
when config.json is missing.

Threading: the pipeline runs in a daemon thread so the UI stays responsive.
tkinter is not thread-safe — all UI updates go through after() callbacks.
"""
from __future__ import annotations

import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
from pathlib import Path

import config as cfg_module
from config import Config, load, save
from nms_pipeline import run_pipeline


APP_TITLE = "NMS/DDN Translator"
PAD = 8
BG = "#f5f5f5"


# ---------------------------------------------------------------------------
# First-run wizard
# ---------------------------------------------------------------------------
class SetupWizard(tk.Toplevel):
    def __init__(self, parent: tk.Tk):
        super().__init__(parent)
        self.title("Setup — NMS/DDN Translator")
        self.resizable(False, False)
        self.grab_set()  # modal
        self.config_saved = False

        tk.Label(self, text="Welcome!  Please configure NMS/DDN Translator.",
                 font=("Segoe UI", 10, "bold")).grid(row=0, column=0, columnspan=3,
                                                     padx=PAD*2, pady=(PAD*2, PAD), sticky="w")

        # API key
        tk.Label(self, text="Anthropic API key:").grid(row=1, column=0, padx=PAD*2,
                                                       pady=4, sticky="w")
        self._key_var = tk.StringVar()
        tk.Entry(self, textvariable=self._key_var, show="*", width=52).grid(
            row=1, column=1, columnspan=2, padx=(0, PAD*2), pady=4, sticky="ew")

        # Lexicon path
        tk.Label(self, text="Lexicon file (.txt):").grid(row=2, column=0, padx=PAD*2,
                                                         pady=4, sticky="w")
        self._lex_var = tk.StringVar()
        tk.Entry(self, textvariable=self._lex_var, width=40).grid(
            row=2, column=1, padx=(0, 4), pady=4, sticky="ew")
        tk.Button(self, text="Browse…", command=self._browse_lex).grid(
            row=2, column=2, padx=(0, PAD*2), pady=4)

        # Save button
        tk.Button(self, text="Save & Continue", command=self._save,
                  width=18).grid(row=3, column=0, columnspan=3,
                                 padx=PAD*2, pady=(PAD, PAD*2))

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
            messagebox.showerror("Missing lexicon", "Please select a valid lexicon .txt file.",
                                 parent=self)
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
        self.minsize(640, 480)
        self.configure(bg=BG)

        self._cfg: Config | None = None
        self._log_queue: queue.Queue[str] = queue.Queue()
        self._running = False

        self._build_ui()
        self._load_config()
        self.after(100, self._drain_log)

    # ── Config ──────────────────────────────────────────────────────────
    def _load_config(self) -> None:
        self._cfg = load()
        if self._cfg is None:
            self._run_wizard()
            self._cfg = load()
        if self._cfg is None:
            messagebox.showerror(
                "Setup incomplete",
                "Configuration was not saved.  Please restart and complete setup.",
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
        # ── Top frame: inputs ──
        frm = tk.Frame(self, bg=BG, padx=PAD, pady=PAD)
        frm.pack(fill="x")

        # Source DOCX
        tk.Label(frm, text="Source DOCX:", bg=BG, width=14, anchor="e").grid(
            row=0, column=0, padx=(0, 4), pady=4, sticky="e")
        self._src_var = tk.StringVar()
        tk.Entry(frm, textvariable=self._src_var, width=50).grid(
            row=0, column=1, padx=(0, 4), pady=4, sticky="ew")
        tk.Button(frm, text="Browse…", command=self._browse_src).grid(
            row=0, column=2, pady=4)

        # Direction
        tk.Label(frm, text="Direction:", bg=BG, width=14, anchor="e").grid(
            row=1, column=0, padx=(0, 4), pady=4, sticky="e")
        self._dir_var = tk.StringVar(value="fr→en")
        dir_frame = tk.Frame(frm, bg=BG)
        dir_frame.grid(row=1, column=1, sticky="w", pady=4)
        for val, label in [("fr→en", "French → English"), ("en→fr", "English → French")]:
            tk.Radiobutton(dir_frame, text=label, variable=self._dir_var, value=val,
                           bg=BG).pack(side="left", padx=(0, PAD))

        # Output folder
        tk.Label(frm, text="Output folder:", bg=BG, width=14, anchor="e").grid(
            row=2, column=0, padx=(0, 4), pady=4, sticky="e")
        self._out_var = tk.StringVar()
        tk.Entry(frm, textvariable=self._out_var, width=50).grid(
            row=2, column=1, padx=(0, 4), pady=4, sticky="ew")
        tk.Button(frm, text="Browse…", command=self._browse_out).grid(
            row=2, column=2, pady=4)

        frm.columnconfigure(1, weight=1)

        # ── Settings link ──
        settings_frm = tk.Frame(self, bg=BG)
        settings_frm.pack(fill="x", padx=PAD)
        tk.Button(settings_frm, text="Settings…", command=self._open_settings,
                  relief="flat", fg="#0066cc", cursor="hand2", bg=BG).pack(side="right")

        # ── Translate button ──
        self._btn = tk.Button(
            self, text="Translate", command=self._start_translation,
            font=("Segoe UI", 11, "bold"), bg="#0055a5", fg="white",
            activebackground="#003d7a", padx=PAD*2, pady=6,
        )
        self._btn.pack(pady=(4, 8))

        # ── Progress log ──
        tk.Label(self, text="Progress:", bg=BG, anchor="w").pack(
            fill="x", padx=PAD, pady=(0, 2))
        self._log = scrolledtext.ScrolledText(
            self, height=16, state="disabled",
            font=("Consolas", 9), bg="#1e1e1e", fg="#d4d4d4",
            insertbackground="white", wrap="word",
        )
        self._log.pack(fill="both", expand=True, padx=PAD, pady=(0, PAD))

        # ── Status bar ──
        self._status_var = tk.StringVar(value="Ready.")
        tk.Label(self, textvariable=self._status_var, bd=1, relief="sunken",
                 anchor="w", bg="#e0e0e0").pack(fill="x", side="bottom")

    # ── Browse helpers ───────────────────────────────────────────────────
    def _browse_src(self) -> None:
        path = filedialog.askopenfilename(
            title="Select source DOCX",
            filetypes=[("Word documents", "*.docx"), ("All files", "*.*")],
        )
        if path:
            self._src_var.set(path)
            # Default output folder to same directory
            if not self._out_var.get():
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

        src = self._src_var.get().strip()
        out = self._out_var.get().strip()

        if not src or not Path(src).exists():
            messagebox.showerror("Missing file", "Please select a valid source DOCX file.")
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
        direction = self._dir_var.get()

        thread = threading.Thread(
            target=self._pipeline_thread,
            args=(src, out, direction),
            daemon=True,
        )
        thread.start()

    def _pipeline_thread(self, src: str, out: str, direction: str) -> None:
        try:
            outputs = run_pipeline(
                src_docx=src,
                output_dir=out,
                direction=direction,
                cfg=self._cfg,
                delete_empty_notes=False,  # project decision: leave in place
                log=self._enqueue_log,
            )
            self._enqueue_log("")
            self._enqueue_log("Output files:")
            for label, path in outputs.items():
                self._enqueue_log(f"  {label}: {path}")
            self._enqueue_log("")
            self._enqueue_log("Translation complete.")
            self.after(0, lambda: self._status_var.set("Translation complete."))
        except Exception as exc:
            msg = str(exc)
            self._enqueue_log(f"\nERROR: {msg}")
            self.after(0, lambda: messagebox.showerror("Translation failed", msg))
            self.after(0, lambda: self._status_var.set("Error — see log."))
        finally:
            self.after(0, lambda: self._set_running(False))

    def _enqueue_log(self, msg: str) -> None:
        self._log_queue.put(msg)

    def _drain_log(self) -> None:
        """Poll the log queue from the main thread (thread-safe UI updates)."""
        try:
            while True:
                msg = self._log_queue.get_nowait()
                self._append_log(msg)
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
        state = "disabled" if running else "normal"
        self._btn.configure(state=state)
        self._status_var.set("Translating…" if running else "Ready.")


# ---------------------------------------------------------------------------
def main() -> None:
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
