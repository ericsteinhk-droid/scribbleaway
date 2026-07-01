"""ScribbleAway main window — single-window UI."""

from PySide6.QtCore import Qt, QThread
from PySide6.QtWidgets import (
    QCheckBox, QFileDialog, QFrame, QGroupBox, QHBoxLayout, QLabel,
    QMainWindow, QMessageBox, QPlainTextEdit, QPushButton, QVBoxLayout, QWidget,
)

from app.core import images, keystore
from app.core.gemini_client import MODEL_ID, USE_STUB
from app.core.images import ImageError
from app.core.prompts import (
    CHECKBOX_FRAGMENTS, assemble_instruction, has_any_instruction,
)
from app.ui.beforeafter import BeforeAfterView
from app.ui.settings_dialog import SettingsDialog
from app.workers import EditWorker


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ScribbleAway — construction-site clutter removal")
        self.resize(1100, 720)

        self._original = None   # PIL.Image loaded from disk
        self._result = None      # PIL.Image returned by the edit
        self._thread = None
        self._worker = None

        root = QWidget()
        self.setCentralWidget(root)
        outer = QHBoxLayout(root)

        outer.addWidget(self._build_left_panel(), 0)
        outer.addWidget(self._build_right_panel(), 1)

        self._refresh_key_banner()
        self.statusBar().showMessage("Ready.")

    # -- layout -------------------------------------------------------------
    def _build_left_panel(self):
        panel = QWidget()
        panel.setFixedWidth(320)
        v = QVBoxLayout(panel)

        self.load_btn = QPushButton("📂  Load image…")
        self.load_btn.clicked.connect(self.on_load)
        v.addWidget(self.load_btn)

        box = QGroupBox("Remove from photo")
        box_v = QVBoxLayout(box)
        self._checkboxes = []
        for label, fragment in CHECKBOX_FRAGMENTS:
            cb = QCheckBox(label)
            cb.setChecked(False)  # all unchecked by default
            cb._fragment = fragment
            self._checkboxes.append(cb)
            box_v.addWidget(cb)
        v.addWidget(box)

        v.addWidget(QLabel("Anything else to remove:"))
        self.free_text = QPlainTextEdit()
        self.free_text.setPlaceholderText(
            "e.g. remove the orange power cable across the entrance"
        )
        self.free_text.setFixedHeight(70)
        v.addWidget(self.free_text)

        self.run_btn = QPushButton("✨  Remove clutter")
        self.run_btn.setStyleSheet("font-weight: bold; padding: 8px;")
        self.run_btn.clicked.connect(self.on_run)
        self.run_btn.setEnabled(False)
        v.addWidget(self.run_btn)

        self.settings_btn = QPushButton("⚙  Settings (API key)…")
        self.settings_btn.clicked.connect(self.on_settings)
        v.addWidget(self.settings_btn)

        self.key_banner = QLabel()
        self.key_banner.setWordWrap(True)
        v.addWidget(self.key_banner)

        v.addStretch(1)
        return panel

    def _build_right_panel(self):
        panel = QWidget()
        v = QVBoxLayout(panel)

        self.view = BeforeAfterView()
        v.addWidget(self.view, 1)

        self.note = QLabel(
            "Large removals can cause the model to invent façade detail — "
            "compare carefully, then Accept or Reject.\n"
            "Note: outputs carry an invisible Google SynthID watermark marking "
            "them as AI-edited."
        )
        self.note.setWordWrap(True)
        self.note.setStyleSheet("color: #889; font-size: 11px;")
        v.addWidget(self.note)

        row = QHBoxLayout()
        row.addStretch(1)
        self.reject_btn = QPushButton("✖  Reject")
        self.reject_btn.clicked.connect(self.on_reject)
        self.accept_btn = QPushButton("✔  Accept & save…")
        self.accept_btn.clicked.connect(self.on_accept)
        for b in (self.reject_btn, self.accept_btn):
            b.setEnabled(False)
            row.addWidget(b)
        v.addLayout(row)
        return panel

    # -- key banner ---------------------------------------------------------
    def _refresh_key_banner(self):
        if keystore.has_key():
            txt = "🔑 API key: saved"
            self.key_banner.setStyleSheet("color: #2e7d32; font-size: 11px;")
        else:
            txt = "🔑 API key: none — open Settings to add one"
            self.key_banner.setStyleSheet("color: #c62828; font-size: 11px;")
        if USE_STUB:
            txt += f"\n(Stub mode — no real API calls. Model: {MODEL_ID})"
        self.key_banner.setText(txt)

    # -- actions ------------------------------------------------------------
    def on_settings(self):
        SettingsDialog(self).exec()
        self._refresh_key_banner()

    def on_load(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Load image", "",
            "Images (*.png *.jpg *.jpeg *.webp *.bmp *.tif *.tiff)")
        if not path:
            return
        try:
            self._original = images.load_image(path)
        except ImageError as exc:
            QMessageBox.critical(self, "Cannot open image", str(exc))
            return
        self._result = None
        self.view.set_single(images.pil_to_qpixmap(self._original))
        self.accept_btn.setEnabled(False)
        self.reject_btn.setEnabled(False)
        self.run_btn.setEnabled(True)
        self.statusBar().showMessage(
            f"Loaded {path}  ({self._original.width}×{self._original.height})")

    def _selected_fragments(self):
        return [cb._fragment for cb in self._checkboxes if cb.isChecked()]

    def on_run(self):
        if self._original is None:
            return
        fragments = self._selected_fragments()
        free_text = self.free_text.toPlainText()
        if not has_any_instruction(fragments, free_text):
            QMessageBox.information(
                self, "Nothing selected",
                "Tick at least one box or type what to remove.")
            return
        if not keystore.has_key():
            QMessageBox.warning(
                self, "No API key",
                "No Gemini API key is saved. Open Settings and paste your key.")
            return

        instruction = assemble_instruction(fragments, free_text)
        self._set_busy(True)
        self.statusBar().showMessage("Removing clutter…")

        self._thread = QThread()
        self._worker = EditWorker(self._original, instruction, keystore.load_key())
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.run)
        self._worker.finished.connect(self._on_edit_done)
        self._worker.failed.connect(self._on_edit_failed)
        # teardown
        self._worker.finished.connect(self._thread.quit)
        self._worker.failed.connect(self._thread.quit)
        self._thread.finished.connect(self._worker.deleteLater)
        self._thread.start()

    def _on_edit_done(self, result_image):
        self._result = result_image
        self.view.set_compare(images.pil_to_qpixmap(self._original),
                              images.pil_to_qpixmap(result_image))
        self.accept_btn.setEnabled(True)
        self.reject_btn.setEnabled(True)
        self._set_busy(False)
        self.statusBar().showMessage("Done. Drag the divider to compare.")

    def _on_edit_failed(self, message):
        self._set_busy(False)
        self.statusBar().showMessage("Edit failed.")
        QMessageBox.critical(self, "Could not remove clutter", message)

    def on_accept(self):
        if self._result is None:
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "Save cleaned image", "cleaned.png",
            "PNG (*.png);;JPEG (*.jpg);;WebP (*.webp)")
        if not path:
            return
        try:
            images.save_image(self._result, path)
        except ImageError as exc:
            QMessageBox.critical(self, "Cannot save", str(exc))
            return
        self.statusBar().showMessage(f"Saved to {path}")

    def on_reject(self):
        self._result = None
        if self._original is not None:
            self.view.set_single(images.pil_to_qpixmap(self._original))
        self.accept_btn.setEnabled(False)
        self.reject_btn.setEnabled(False)
        self.statusBar().showMessage("Rejected. Adjust options and try again.")

    def _set_busy(self, busy):
        for w in (self.run_btn, self.load_btn, self.accept_btn,
                  self.reject_btn, self.settings_btn):
            w.setEnabled(not busy)
        if not busy:
            # run stays enabled only while an image is loaded
            self.run_btn.setEnabled(self._original is not None)
