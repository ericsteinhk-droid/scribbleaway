"""Gemini image-editing client (real google-genai integration).

Set ``USE_STUB = True`` to run the UI without a network/key (returns a
placeholder preview). In normal operation the model is called via the
``google-genai`` SDK; every failure is mapped to a :class:`GeminiError`
subclass so the UI can show a clean, specific message.
"""

from io import BytesIO

from PIL import Image, ImageDraw, ImageOps

# Editable default model. Confirmed against Google docs (July 2026):
#   gemini-3-pro-image     -> Nano Banana Pro (higher fidelity, reasoning) [DEFAULT]
#   gemini-2.5-flash-image -> Nano Banana (faster / cheaper alternative)
# Same google-genai generate_content request shape for both, so swapping this
# one string is all that is needed.
MODEL_ID = "gemini-3-pro-image"

# Set True to bypass the network and return a placeholder (useful for UI dev).
USE_STUB = False

# Request timeout in milliseconds. Pro image generation with "thinking" can be
# slow, so give it headroom; a hung socket fails by this deadline.
REQUEST_TIMEOUT_MS = 180_000


class GeminiError(Exception):
    """Base class for user-facing errors from the client."""


class MissingApiKeyError(GeminiError):
    pass


class InvalidApiKeyError(GeminiError):
    pass


class RateLimitError(GeminiError):
    pass


class NetworkError(GeminiError):
    pass


def edit_image(image: Image.Image, instruction: str, api_key: str) -> Image.Image:
    """Return an edited copy of ``image`` following ``instruction``.

    Raises a subclass of :class:`GeminiError` on any failure. Runs on a
    background thread (see app.workers).
    """
    if not api_key or not api_key.strip():
        raise MissingApiKeyError(
            "No Gemini API key is saved. Open Settings and paste your key."
        )
    if USE_STUB:
        return _stub_edit(image, instruction)
    return _real_edit(image, instruction, api_key.strip())


def _real_edit(image: Image.Image, instruction: str, api_key: str) -> Image.Image:
    try:
        from google import genai
        from google.genai import errors, types
    except ImportError as exc:  # pragma: no cover
        raise GeminiError(
            "The google-genai package is not installed.\n"
            "Install it with: pip install google-genai"
        ) from exc

    # Encode the (already-downscaled) image as PNG bytes.
    buf = BytesIO()
    image.convert("RGB").save(buf, format="PNG")
    image_bytes = buf.getvalue()

    try:
        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
        )
    except Exception as exc:  # noqa: BLE001
        raise GeminiError(f"Could not initialise the Gemini client:\n{exc}") from exc

    try:
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=[
                instruction,
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            ],
            config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
        )
    except errors.APIError as exc:
        raise _map_api_error(exc) from exc
    except Exception as exc:  # noqa: BLE001 - connection/DNS/TLS/timeout
        raise NetworkError(
            "Could not reach the Gemini API. Check your internet connection "
            f"and try again.\n\nDetails: {exc}"
        ) from exc

    result = _extract_image(response)
    if result is None:
        raise GeminiError(_no_image_message(response))
    return result


def _map_api_error(exc) -> GeminiError:
    """Translate a google.genai APIError into a specific GeminiError."""
    code = getattr(exc, "code", None)
    message = getattr(exc, "message", None) or str(exc)
    if code == 429:
        return RateLimitError(
            "Rate limit or quota exceeded. Wait a moment and try again, or "
            "check your plan's limits.\n\n" + message
        )
    if code in (401, 403):
        return InvalidApiKeyError(
            f"The API rejected your key (HTTP {code}). It may be invalid, "
            "revoked, or lack access to this model.\n\n" + message
        )
    if code == 400:
        # Google returns 400 (not 401/403) for a bad key: "API key not valid".
        low = message.lower()
        if "api key not valid" in low or "api_key_invalid" in low:
            return InvalidApiKeyError(
                "The API rejected your key (it is not valid). Open Settings and "
                "paste a valid Gemini API key.\n\n" + message
            )
        return GeminiError(
            "The request was rejected (HTTP 400). The image or instruction may "
            "be unsupported.\n\n" + message
        )
    return GeminiError(f"Gemini API error (HTTP {code}):\n{message}")


def _extract_image(response):
    """Find the first inline image in the response, or None."""
    for cand in getattr(response, "candidates", None) or []:
        content = getattr(cand, "content", None)
        for part in getattr(content, "parts", None) or []:
            inline = getattr(part, "inline_data", None)
            data = getattr(inline, "data", None) if inline else None
            if data:
                try:
                    return Image.open(BytesIO(data)).convert("RGB")
                except Exception:  # noqa: BLE001 - malformed part, keep looking
                    continue
    return None


def _no_image_message(response) -> str:
    """Build a helpful message when the model returned no image."""
    # Prompt-level block (safety etc.)
    feedback = getattr(response, "prompt_feedback", None)
    block_reason = getattr(feedback, "block_reason", None) if feedback else None
    if block_reason:
        return (f"The request was blocked ({block_reason}). Try different "
                "removal options or a different image.")

    # Any text the model returned instead of an image.
    texts = []
    for cand in getattr(response, "candidates", None) or []:
        content = getattr(cand, "content", None)
        for part in getattr(content, "parts", None) or []:
            if getattr(part, "text", None):
                texts.append(part.text)
    if texts:
        return "The model returned text instead of an image:\n\n" + "\n".join(texts)
    return ("The model did not return an image. Try again, adjust the removal "
            "options, or use a smaller image.")


def _stub_edit(image: Image.Image, instruction: str) -> Image.Image:
    """Fake 'edit': desaturate + banner so before/after clearly differs."""
    result = ImageOps.colorize(
        ImageOps.grayscale(image.convert("RGB")), "#101820", "#e8f0f8")
    draw = ImageDraw.Draw(result)
    w, h = result.size
    banner_h = max(28, h // 18)
    draw.rectangle([0, 0, w, banner_h], fill=(200, 40, 40))
    draw.text((10, max(4, banner_h // 4)),
              "STUB PREVIEW — no API call made", fill="white")
    return result
