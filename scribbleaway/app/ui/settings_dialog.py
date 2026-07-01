"""Settings dialog: paste, view status, replace, or clear the API key."""

from PySide6.QtWidgets import (
    QCheckBox, QDialog, QDialogButtonBox, QHBoxLayout, QLabel, QLineEdit,
    QMessageBox, QPushButton, QVBoxLayout,
)

from app.core import keystore


class SettingsDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings — Gemini API key")
        self.setMinimumWidth(460)

        layout = QVBoxLayout(self)

        self.status = QLabel()
        self.status.setWordWrap(True)
        layout.addWidget(self.status)

        layout.addWidget(QLabel("Gemini API key:"))
        row = QHBoxLayout()
        self.edit = QLineEdit()
        self.edit.setEchoMode(QLineEdit.Password)
        self.edit.setPlaceholderText("Paste your key here to save or replace it")
        row.addWidget(self.edit)
        self.show_box = QCheckBox("Show")
        self.show_box.toggled.connect(self._toggle_echo)
        row.addWidget(self.show_box)
        layout.addLayout(row)

        hint = QLabel(
            'Get a key from Google AI Studio (aistudio.google.com). It is stored '
            'locally in the OS credential store — never committed or bundled.'
        )
        hint.setWordWrap(True)
        hint.setStyleSheet("color: #778;")
        layout.addWidget(hint)

        self.clear_btn = QPushButton("Clear saved key")
        self.clear_btn.clicked.connect(self._clear)
        layout.addWidget(self.clear_btn)

        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self._save)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self._refresh_status()

    def _toggle_echo(self, shown):
        self.edit.setEchoMode(QLineEdit.Normal if shown else QLineEdit.Password)

    def _refresh_status(self):
        if keystore.has_key():
            self.status.setText(
                f"✅ A key is currently saved.\nStored in: {keystore.backend_name()}"
            )
        else:
            self.status.setText(
                f"⚠️ No key saved yet.\nWill be stored in: {keystore.backend_name()}"
            )
        self.clear_btn.setEnabled(keystore.has_key())

    def _save(self):
        key = self.edit.text().strip()
        if not key:
            QMessageBox.information(self, "Nothing to save",
                                    "Paste a key first, or press Cancel.")
            return
        try:
            keystore.save_key(key)
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Could not save key", str(exc))
            return
        QMessageBox.information(self, "Saved", "API key saved.")
        self.accept()

    def _clear(self):
        if QMessageBox.question(self, "Clear key",
                                "Remove the saved API key?") == QMessageBox.Yes:
            keystore.clear_key()
            self.edit.clear()
            self._refresh_status()
