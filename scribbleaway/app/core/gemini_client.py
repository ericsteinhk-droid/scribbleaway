"""Gemini image-editing client.

STAGE 2: this is a STUB. ``edit_image`` does not call the network; it returns a
visibly-modified copy of the input so the full UI flow (load -> select -> run ->
before/after -> accept/reject) can be exercised without an API key. Stage 3
replaces ``_real_edit`` with the actual google-genai call.
"""

from PIL import Image, ImageDraw, ImageOps

# Editable default model. Confirmed against Google docs (July 2026):
#   gemini-3-pro-image     -> Nano Banana Pro (higher fidelity, reasoning) [DEFAULT]
#   gemini-2.5-flash-image -> Nano Banana (faster / cheaper alternative)
# Same google-genai generate_content request shape for both, so swapping this
# one string is all that is needed.
MODEL_ID = "gemini-3-pro-image"

# Flip to False in Stage 3 once _real_edit is implemented.
USE_STUB = True


class GeminiError(Exception):
    """Base class for user-facing errors from the client."""


class MissingApiKeyError(GeminiError):
    pass


class RateLimitError(GeminiError):
    pass


class NetworkError(GeminiError):
    pass


def edit_image(image: Image.Image, instruction: str, api_key: str) -> Image.Image:
    """Return an edited copy of ``image`` following ``instruction``.

    Raises a subclass of :class:`GeminiError` on any failure so the UI can show
    a clean message. Runs on a background thread (see app.workers).
    """
    if not api_key or not api_key.strip():
        raise MissingApiKeyError(
            "No Gemini API key is saved. Open Settings and paste your key."
        )
    if USE_STUB:
        return _stub_edit(image, instruction)
    return _real_edit(image, instruction, api_key)  # Stage 3


def _stub_edit(image: Image.Image, instruction: str) -> Image.Image:
    """Fake 'edit': desaturate + banner so before/after clearly differs."""
    result = ImageOps.grayscale(image.convert("RGB")).convert("RGB")
    result = ImageOps.colorize(ImageOps.grayscale(result), "#101820", "#e8f0f8")
    draw = ImageDraw.Draw(result)
    w, h = result.size
    banner_h = max(28, h // 18)
    draw.rectangle([0, 0, w, banner_h], fill=(200, 40, 40))
    draw.text((10, max(4, banner_h // 4)),
              "STUB PREVIEW — no API call made (Stage 2)", fill="white")
    return result


def _real_edit(image: Image.Image, instruction: str, api_key: str) -> Image.Image:
    """Stage 3: real google-genai call. Not yet implemented."""
    raise NotImplementedError("Real Gemini integration lands in Stage 3.")
