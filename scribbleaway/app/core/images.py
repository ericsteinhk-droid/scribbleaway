"""Image loading, downscaling, and format helpers."""

from io import BytesIO

from PIL import Image
from PySide6.QtGui import QImage, QPixmap

# Long-edge cap applied before sending to the API. Keeps the request under the
# inline-payload ceiling and reduces token cost. Editable.
MAX_DIMENSION = 2048

SUPPORTED_INPUT = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff")


class ImageError(Exception):
    pass


def load_image(path: str) -> Image.Image:
    try:
        img = Image.open(path)
        img.load()
    except Exception as exc:  # noqa: BLE001 - surfaced to the user as a message
        raise ImageError(f"Could not open image:\n{exc}") from exc
    # Normalise to RGB so downstream save/encode is predictable.
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    return img


def downscale_if_needed(img: Image.Image, max_dim: int = MAX_DIMENSION) -> Image.Image:
    """Return a copy scaled so its long edge is <= ``max_dim`` (aspect kept)."""
    w, h = img.size
    longest = max(w, h)
    if longest <= max_dim:
        return img
    scale = max_dim / float(longest)
    new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
    return img.resize(new_size, Image.LANCZOS)


def pil_to_qpixmap(img: Image.Image) -> QPixmap:
    """Convert a PIL image to a QPixmap for display."""
    rgba = img.convert("RGBA")
    data = rgba.tobytes("raw", "RGBA")
    qimg = QImage(data, rgba.width, rgba.height, QImage.Format_RGBA8888)
    # copy() so the QImage owns its buffer independent of ``data``.
    return QPixmap.fromImage(qimg.copy())


def save_image(img: Image.Image, path: str) -> None:
    """Save to disk, inferring format from the extension (default PNG)."""
    fmt = None
    lower = path.lower()
    if lower.endswith((".jpg", ".jpeg")):
        fmt = "JPEG"
        img = img.convert("RGB")
    elif lower.endswith(".webp"):
        fmt = "WEBP"
    try:
        img.save(path, format=fmt)
    except Exception as exc:  # noqa: BLE001
        raise ImageError(f"Could not save image:\n{exc}") from exc


def encode_png_bytes(img: Image.Image) -> bytes:
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
