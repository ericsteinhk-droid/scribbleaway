"""Background worker so the API call never blocks the UI thread."""

from PySide6.QtCore import QObject, Signal

from app.core import images
from app.core.gemini_client import GeminiError, edit_image


class EditWorker(QObject):
    """Runs one edit on a worker thread and reports back via signals."""

    finished = Signal(object)   # emits a PIL.Image on success
    failed = Signal(str)        # emits a user-facing error message

    def __init__(self, image, instruction, api_key):
        super().__init__()
        self._image = image
        self._instruction = instruction
        self._api_key = api_key

    def run(self):
        try:
            prepared = images.downscale_if_needed(self._image)
            result = edit_image(prepared, self._instruction, self._api_key)
            self.finished.emit(result)
        except GeminiError as exc:
            self.failed.emit(str(exc))
        except Exception as exc:  # noqa: BLE001 - never let the thread die silently
            self.failed.emit(f"Unexpected error:\n{exc}")
