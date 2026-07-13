"""
Render Enhancer — turns architectural renders (e.g. Enscape output) into
hyper-photorealistic presentation images to help get a design approved by a
client.

Uses Google's Gemini "Nano Banana" image model (gemini-2.5-flash-image) for
image-to-image enhancement. The user picks one or more of four curated
narrative styles; each style keeps the original viewpoint, geometry and
proportions while re-lighting and re-texturing the scene for realism.

The GUI is bilingual (English / Français) — switchable at runtime.

Requires: Pillow, requests, certifi  (tkinterdnd2 optional, for drag-and-drop)
Build to .exe: pyinstaller render_enhancer.spec
"""

import os
import re
import sys
import json
import time
import base64
import threading
import subprocess
import webbrowser
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    HAS_DND = True
except ImportError:
    HAS_DND = False

from PIL import Image, ImageTk, ImageOps

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# Pin the CA bundle explicitly so HTTPS works in a frozen (PyInstaller) build,
# where requests' bundled certificates can otherwise be missing.
try:
    import certifi
    _CA_BUNDLE = certifi.where()
except Exception:
    _CA_BUNDLE = True  # fall back to requests' default verification


# ── Constants ─────────────────────────────────────────────────────────────────
APP_VERSION = "v1.1"
APP_DATE    = "July 2026"
COPYRIGHT   = f"© Eric Stein 2026  ·  {APP_VERSION}"

# ── UI palette (bright, sleek) ──────────────────────────────────────────────────
UI_BG        = "#f5f8fc"   # bright, near-white background
UI_INPUT     = "#ffffff"   # entry/list/text fields
UI_FG        = "#1f2a37"   # primary text
UI_MUTED     = "#64748b"   # hints / secondary text
UI_BORDER    = "#cbd5e1"   # subtle field borders
UI_BTN       = "#e7edf5"   # secondary button
UI_BTN_HOVER = "#d7e0ec"
UI_ACCENT    = "#2563eb"   # primary action / links
UI_ACCENT_HI = "#1d4ed8"
UI_LINK      = "#1a5276"

# "Nano Banana" — Gemini 2.5 Flash Image. Try the stable id first, then preview.
GEMINI_MODELS = ("gemini-2.5-flash-image", "gemini-2.5-flash-image-preview")
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
MAX_UPLOAD_PX = 3072   # downscale huge renders before upload (higher = finer texture detail)
MAX_REF_PX = 1280      # material reference swatches need less resolution
MAX_REFS = 3           # max material reference images per request
REQUEST_TIMEOUT = 180  # seconds per image

# Appended to the prompt when material reference photos are attached.
REF_INSTRUCTION = (
    "\nMaterial reference: the FIRST attached image is the architectural render "
    "to enhance; the remaining attached image(s) are real material reference "
    "photographs. Faithfully reproduce the exact materials shown in those "
    "references — the brick, stone, metal and glass — matching their true colour, "
    "surface texture, mortar joints, weathering, finish and reflectivity, and "
    "apply them to the corresponding surfaces of the building. Do not copy the "
    "references' shapes, lighting or composition; use them only as material "
    "samples, while strictly preserving the render's geometry, viewpoint and "
    "proportions."
)
MAX_RETRIES = 3        # attempts per request on transient errors
RETRYABLE_STATUS = {429, 500, 502, 503, 504}

GET_KEY_URL = "https://aistudio.google.com/app/apikey"
CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".evoq_render_enhancer.json")


# ── Narrative prompt library ────────────────────────────────────────────────────
# The prompt text stays in English (the model is tuned for it and the wording is
# carefully engineered); only the display name/blurb are localised via I18N.
#
# Design note: these prompts deliberately AVOID diffusion jargon like
# "low denoising", which Nano Banana reads as "change as little as possible" and
# which suppresses material re-rendering. Instead they split what must be
# preserved (geometry / camera / openings) from what should be fully re-rendered
# (materials / lighting), and describe real masonry coursing so brick/stone read
# naturally instead of as flat CGI texture.

# Shared clause: lock the geometry, license full material/lighting re-rendering.
_PRESERVE = (
    "Preserve exactly, with zero deviation: the camera viewpoint and focal "
    "length, all architectural geometry, massing and structural proportions, and "
    "the position, size and shape of every window, door and opening. Do NOT move, "
    "add or remove any building element. Within those fixed constraints, fully "
    "re-render every surface material and all lighting to convincing photographic "
    "realism — the result must look like a real photograph of this exact "
    "building, not a preserved CAD or Enscape render.\n"
)

# Shared clause: how real masonry should be laid, to fix flat texture / coursing.
_MASONRY = (
    "Masonry realism: render all brick or stone as a real, laid wall in a natural "
    "running bond — level, continuous bed joints of consistent course height that "
    "align to sill and lintel levels, with soldier or lintel courses over openings "
    "where appropriate. Mortar joints are slightly recessed and weathered. Give "
    "believable brick-to-brick (or stone-to-stone) colour, tone and texture "
    "variation with natural chips and imperfections. Completely eliminate any "
    "repeating, mirrored or tiled texture pattern and any flat, plastic or CGI "
    "sheen. "
)

NARRATIVES = [
    {
        "key": "golden_hour",
        "prompt": (
            _PRESERVE +
            "Lighting: clear, low-angle morning golden-hour sunlight raking across "
            "the facade, casting long, well-defined shadows and warm highlights.\n"
            "Materials: " + _MASONRY +
            "The warm raking light makes the masonry texture and mortar joints "
            "highly tactile. Metal facades and mullions show complex, warm specular "
            "highlights. Glass is transparent, revealing detailed warm-lit interiors "
            "and a soft reflection of the low sun.\n"
            "Diverse Human Entourage: no more than 5 human figures for scale, all "
            "distant and positioned only in the mid-ground or background — diverse "
            "individuals (e.g., a Black grandmother, a young child, and a few "
            "professionals of varying ages). Shot on a 50mm lens, professional "
            "architectural photography, hyper-realistic, 8k resolution."
        ),
    },
    {
        "key": "soft_diffuse",
        "prompt": (
            _PRESERVE +
            "Lighting: soft, diffuse, perfectly even light under an overcast sky "
            "that gently defines form without dramatic shadow.\n"
            "Materials: " + _MASONRY +
            "Under the even light, focus on fine, true material texture and "
            "accurate colour. All metal finishes appear sleek and matte with "
            "accurate material transitions. Glass is exceptionally transparent with "
            "minimal, soft, cool-toned reflections, revealing the true colour and "
            "details of the interior spaces.\n"
            "Diverse Human Entourage: no more than 5 diverse human figures for "
            "accurate scale, located only in the mid-ground and background, never "
            "close to the camera (e.g., a few students and professionals). Shot on "
            "a 35mm lens, high-fidelity architectural presentation, photorealistic, "
            "8k."
        ),
    },
    {
        "key": "blue_hour",
        "prompt": (
            _PRESERVE +
            "Lighting: a deep twilight-blue 'blue hour' sky, with warm interior "
            "lighting radiating from every window and contrasting with the cool "
            "ambient exterior light.\n"
            "Materials: " + _MASONRY +
            "The masonry shows a gradient — cooler on exposed exterior faces, "
            "warmed near interior light sources. The metal framework reads highly "
            "visible and crisp. Glass is intensely transparent, providing clear, "
            "detailed views into the complex, warm-lit interior programs.\n"
            "Diverse Human Entourage: strict maximum of 5 diverse people positioned "
            "well away from the viewer in the mid-ground and background, interacting "
            "with the plaza or terrace at dusk. Professional night architectural "
            "photography, 8k resolution."
        ),
    },
    {
        "key": "post_rain",
        "prompt": (
            _PRESERVE +
            "Lighting: dynamic post-rain conditions with soft, breaking sunlight "
            "pushing through retreating storm clouds and highlighting wet "
            "surfaces.\n"
            "Materials: " + _MASONRY +
            "The masonry walls read darker and damp with realistic water sheen. "
            "Metal elements and fixtures are highly reflective. Glass is crisp with "
            "clear, slightly distorted reflections. Surrounding ground surfaces are "
            "wet, featuring sharp, complex reflections of the building and the "
            "pedestrians.\n"
            "Diverse Human Entourage: exactly 4 diverse pedestrians navigating the "
            "wet pavement, all positioned in the mid-ground and background, clear of "
            "the immediate foreground, walking at different speeds and of varying "
            "age groups and ethnicities. Extreme detail, photorealistic, 8k."
        ),
    },
]
NARRATIVE_BY_KEY = {n["key"]: n for n in NARRATIVES}


# ── Translations ────────────────────────────────────────────────────────────────
LANGUAGES = [("English", "en"), ("Français", "fr")]

I18N = {
    "en": {
        "subtitle": "Render Enhancer — Rehaussement de rendus",
        "powered_by": "Powered by Google Gemini “Nano Banana”",
        "language": "Language:",
        "src_frame": "Source Renders",
        "dnd_hint": "  —  drag renders here",
        "add_files": "Add Files…",
        "add_folder": "Add Folder…",
        "clear": "Clear",
        "all": "All",
        "none": "None",
        "count_none": "No renders added.",
        "count_all": "{n} render(s) selected.",
        "count_some": "{sel} of {total} renders selected.",
        "no_images_title": "No Images",
        "no_images_msg": "No images found in that folder.",
        "ref_frame": "Material References (optional)",
        "ref_hint": ("Attach photos of the real brick, stone or glass to "
                     "reproduce — the model copies their exact material onto the "
                     "building. Up to 3."),
        "ref_add": "Add reference…",
        "ref_none": "No references.",
        "ref_count": "{n} reference(s):",
        "ref_max": "You can attach at most {n} material references.",
        "sel_refs": "Select Material References",
        "narr_frame": "Narrative Styles  (tick one or more)",
        "narr_hint": "Each ticked style produces its own image per render.",
        "all4": "All 4",
        "custom_hint": ("Write your own full prompt; it runs as its own image, "
                        "in addition to any styles ticked above."),
        "extra_label": "Extra instructions (optional):",
        "api_frame": "Gemini API Key (Nano Banana)",
        "show": "Show",
        "remember": "Remember key on this computer",
        "get_key": "Get a key…",
        "output_frame": "Output Folder",
        "browse": "Browse…",
        "open_after": "Open enhanced image when done",
        "preview_frame": "Preview  (click an image to open it)",
        "prev_selected": "Selected render",
        "prev_result": "Enhanced result",
        "none_img": "(none)",
        "preview_fail": "(could not preview)",
        "enhance": "Enhance Render(s)",
        "cancel": "Cancel",
        "ready": "Ready.",
        "starting": "Starting…",
        "enhancing": "Enhancing {name} — {style} ({i} of {n})…",
        "retry_net": "Network error — retrying ({a}/{m})…",
        "retry_busy": "Gemini busy (HTTP {code}) — retrying in {wait}s ({a}/{m})…",
        "cancelling": "Cancelling… (finishing current step)",
        "done_saved": "Done. Saved {n} image(s) to {dir}",
        "cancelled_saved": "Cancelled. Saved {n} image(s) to {dir}",
        "no_images_produced": "No images were produced.",
        "cancelled": "Cancelled.",
        "styles": {
            "golden_hour": ("Golden Hour",
                            "High-contrast morning light, long shadows, tactile masonry."),
            "soft_diffuse": ("Soft Diffuse Overcast",
                             "Even overcast light, subtle texture, accurate colour."),
            "blue_hour": ("Blue Hour Twilight",
                          "Deep twilight sky, warm glowing interiors, luminous depth."),
            "post_rain": ("Post-Rain Dramatic",
                          "Breaking storm light, wet reflective surfaces, drama."),
            "custom": ("Custom prompt", ""),
        },
        # dialogs
        "dlg_missing_title": "Missing dependency",
        "dlg_missing_msg": ("The 'requests' library is required. Install it with:\n\n"
                            "pip install requests"),
        "dlg_missing_warn": ("The 'requests' library is not installed, so the app "
                             "cannot contact the Gemini API.\n\nInstall it with:  "
                             "pip install requests"),
        "err_title": "Error",
        "err_no_images": "Select at least one render to enhance.",
        "err_no_styles": "Tick at least one narrative style.",
        "err_custom_empty": "Custom prompt is ticked but empty — write a prompt or untick it.",
        "err_no_key": "Enter your Gemini API key.",
        "err_no_output": "Choose a valid output folder.",
        "done_title": "Done",
        "done_msg": "Saved {n} enhanced image(s) to:\n{dir}",
        "cancel_title": "Cancelled",
        "cancel_msg": "Stopped. Saved {n} image(s) before cancelling.",
        "cancel_errs": "\n\nErrors:\n{errs}",
        "partial_title": "Completed with some errors",
        "partial_msg": "Saved {n} image(s).\n\nSome jobs failed:\n{errs}",
        "failed_title": "Failed",
        "failed_msg": "No images were produced:\n\n{errs}",
        "sel_folder": "Select Render Folder",
        "sel_files": "Select Renders",
        "sel_output": "Select Output Folder",
        "filetype_images": "Image files",
        "filetype_all": "All files",
    },
    "fr": {
        "subtitle": "Render Enhancer — Rehaussement de rendus",
        "powered_by": "Propulsé par Google Gemini « Nano Banana »",
        "language": "Langue :",
        "src_frame": "Rendus source",
        "dnd_hint": "  —  glissez les rendus ici",
        "add_files": "Ajouter des fichiers…",
        "add_folder": "Ajouter un dossier…",
        "clear": "Effacer",
        "all": "Tout",
        "none": "Aucun",
        "count_none": "Aucun rendu ajouté.",
        "count_all": "{n} rendu(s) sélectionné(s).",
        "count_some": "{sel} de {total} rendus sélectionnés.",
        "no_images_title": "Aucune image",
        "no_images_msg": "Aucune image trouvée dans ce dossier.",
        "ref_frame": "Références de matériaux (facultatif)",
        "ref_hint": ("Joignez des photos de la brique, pierre ou vitrage réels à "
                     "reproduire — le modèle applique leur matériau exact au "
                     "bâtiment. Jusqu'à 3."),
        "ref_add": "Ajouter une référence…",
        "ref_none": "Aucune référence.",
        "ref_count": "{n} référence(s) :",
        "ref_max": "Vous pouvez joindre au maximum {n} références de matériaux.",
        "sel_refs": "Sélectionner les références de matériaux",
        "narr_frame": "Styles narratifs  (cochez-en un ou plusieurs)",
        "narr_hint": "Chaque style coché produit sa propre image par rendu.",
        "all4": "Les 4",
        "custom_hint": ("Rédigez votre propre invite complète ; elle produit sa "
                        "propre image, en plus des styles cochés ci-dessus."),
        "extra_label": "Instructions supplémentaires (facultatif) :",
        "api_frame": "Clé API Gemini (Nano Banana)",
        "show": "Afficher",
        "remember": "Mémoriser la clé sur cet ordinateur",
        "get_key": "Obtenir une clé…",
        "output_frame": "Dossier de sortie",
        "browse": "Parcourir…",
        "open_after": "Ouvrir l'image améliorée une fois terminé",
        "preview_frame": "Aperçu  (cliquez une image pour l'ouvrir)",
        "prev_selected": "Rendu sélectionné",
        "prev_result": "Résultat amélioré",
        "none_img": "(aucun)",
        "preview_fail": "(aperçu impossible)",
        "enhance": "Améliorer le(s) rendu(s)",
        "cancel": "Annuler",
        "ready": "Prêt.",
        "starting": "Démarrage…",
        "enhancing": "Amélioration de {name} — {style} ({i} de {n})…",
        "retry_net": "Erreur réseau — nouvelle tentative ({a}/{m})…",
        "retry_busy": "Gemini occupé (HTTP {code}) — nouvelle tentative dans {wait}s ({a}/{m})…",
        "cancelling": "Annulation… (fin de l'étape en cours)",
        "done_saved": "Terminé. {n} image(s) enregistrée(s) dans {dir}",
        "cancelled_saved": "Annulé. {n} image(s) enregistrée(s) dans {dir}",
        "no_images_produced": "Aucune image produite.",
        "cancelled": "Annulé.",
        "styles": {
            "golden_hour": ("Heure dorée",
                            "Lumière matinale contrastée, longues ombres, maçonnerie tactile."),
            "soft_diffuse": ("Ciel couvert diffus",
                             "Lumière douce et uniforme, texture subtile, couleurs fidèles."),
            "blue_hour": ("Heure bleue",
                          "Ciel crépusculaire profond, intérieurs chaleureux, profondeur lumineuse."),
            "post_rain": ("Après la pluie",
                          "Éclaircie dramatique, surfaces mouillées et réfléchissantes."),
            "custom": ("Invite personnalisée", ""),
        },
        "dlg_missing_title": "Dépendance manquante",
        "dlg_missing_msg": ("La bibliothèque « requests » est requise. Installez-la avec :\n\n"
                            "pip install requests"),
        "dlg_missing_warn": ("La bibliothèque « requests » n'est pas installée ; "
                             "l'application ne peut pas contacter l'API Gemini.\n\n"
                             "Installez-la avec :  pip install requests"),
        "err_title": "Erreur",
        "err_no_images": "Sélectionnez au moins un rendu à améliorer.",
        "err_no_styles": "Cochez au moins un style narratif.",
        "err_custom_empty": "L'invite personnalisée est cochée mais vide — rédigez-la ou décochez-la.",
        "err_no_key": "Saisissez votre clé API Gemini.",
        "err_no_output": "Choisissez un dossier de sortie valide.",
        "done_title": "Terminé",
        "done_msg": "{n} image(s) améliorée(s) enregistrée(s) dans :\n{dir}",
        "cancel_title": "Annulé",
        "cancel_msg": "Arrêté. {n} image(s) enregistrée(s) avant l'annulation.",
        "cancel_errs": "\n\nErreurs :\n{errs}",
        "partial_title": "Terminé avec des erreurs",
        "partial_msg": "{n} image(s) enregistrée(s).\n\nCertaines tâches ont échoué :\n{errs}",
        "failed_title": "Échec",
        "failed_msg": "Aucune image produite :\n\n{errs}",
        "sel_folder": "Sélectionner le dossier de rendus",
        "sel_files": "Sélectionner les rendus",
        "sel_output": "Sélectionner le dossier de sortie",
        "filetype_images": "Fichiers image",
        "filetype_all": "Tous les fichiers",
    },
}


# ── Utilities ─────────────────────────────────────────────────────────────────
def _resource_path(filename):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, filename)


def _asset(*parts):
    return _resource_path(os.path.join(*parts))


def natural_sort_key(s):
    parts = re.split(r'(\d+)', s)
    return [int(p) if p.isdigit() else p.lower() for p in parts]


def load_config():
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg):
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f)
    except Exception:
        pass


# ── Gemini API ──────────────────────────────────────────────────────────────────
class GeminiError(Exception):
    pass


class CancelledError(Exception):
    """Raised when the user cancels an in-progress batch."""
    pass


def _sleep_cancellable(seconds, should_cancel):
    """Sleep in small steps so a cancel request is honoured promptly."""
    waited = 0.0
    while waited < seconds:
        if should_cancel and should_cancel():
            raise CancelledError()
        time.sleep(0.2)
        waited += 0.2


def _retry_after(resp):
    try:
        return int(resp.headers.get("Retry-After", ""))
    except (TypeError, ValueError):
        return None


def _encode_image(path, max_px=MAX_UPLOAD_PX):
    """Load, EXIF-correct, downscale if huge, return (base64_png, mime)."""
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')
        w, h = img.width, img.height
        if max(w, h) > max_px:
            ratio = max_px / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        import io
        buf = io.BytesIO()
        img.save(buf, 'PNG')
        return base64.b64encode(buf.getvalue()).decode('ascii'), 'image/png'


def enhance_image(api_key, prompt, image_path, status_cb=None, should_cancel=None,
                  messages=None, ref_paths=None):
    """Call Gemini image model. Returns raw bytes of the enhanced image.

    Transient failures (429 / 5xx / network) are retried with exponential
    backoff. Passing should_cancel (a callable returning bool) lets a running
    batch be aborted between attempts. messages optionally supplies localised
    'retry_net' / 'retry_busy' templates for status_cb. ref_paths is an optional
    list of material-reference image paths sent alongside the render.
    """
    if not HAS_REQUESTS:
        raise GeminiError("The 'requests' library is not installed.")

    msg_net = (messages or {}).get(
        "retry_net", "Network error — retrying ({a}/{m})…")
    msg_busy = (messages or {}).get(
        "retry_busy", "Gemini busy (HTTP {code}) — retrying in {wait}s ({a}/{m})…")

    refs = ref_paths or []
    if refs:
        prompt = prompt + REF_INSTRUCTION

    b64, mime = _encode_image(image_path)
    parts = [
        {"text": prompt},
        {"inline_data": {"mime_type": mime, "data": b64}},
    ]
    for ref in refs[:MAX_REFS]:
        rb64, rmime = _encode_image(ref, max_px=MAX_REF_PX)
        parts.append({"inline_data": {"mime_type": rmime, "data": rb64}})

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    last_err = None
    for model in GEMINI_MODELS:
        url = GEMINI_ENDPOINT.format(model=model)
        resp = None
        for attempt in range(1, MAX_RETRIES + 1):
            if should_cancel and should_cancel():
                raise CancelledError()
            try:
                resp = requests.post(url, headers=headers, json=body,
                                     timeout=REQUEST_TIMEOUT, verify=_CA_BUNDLE)
            except requests.exceptions.RequestException as e:
                last_err = f"Network error: {e}"
                if attempt < MAX_RETRIES:
                    if status_cb:
                        status_cb(msg_net.format(a=attempt, m=MAX_RETRIES))
                    _sleep_cancellable(2 ** attempt, should_cancel)
                    continue
                raise GeminiError(
                    f"Network error contacting Gemini after {MAX_RETRIES} "
                    f"attempts: {e}")

            if resp.status_code in RETRYABLE_STATUS and attempt < MAX_RETRIES:
                wait = _retry_after(resp) or 2 ** attempt
                if status_cb:
                    status_cb(msg_busy.format(code=resp.status_code, wait=wait,
                                              a=attempt, m=MAX_RETRIES))
                _sleep_cancellable(wait, should_cancel)
                continue
            break  # non-retryable response, or retries exhausted

        if resp is None:
            continue
        if resp.status_code == 404:
            last_err = f"Model '{model}' not found (404)."
            continue  # try the next model id
        if resp.status_code in (401, 403):
            raise GeminiError(
                "Authentication failed. Check that your Gemini API key is "
                "correct and has access to the image model.")
        if resp.status_code == 429:
            raise GeminiError(
                "Rate limit / quota exceeded (429). Wait a moment or check "
                "your Google AI Studio quota, then try again.")
        if resp.status_code != 200:
            snippet = _error_snippet(resp)
            raise GeminiError(f"Gemini returned HTTP {resp.status_code}: {snippet}")

        data = resp.json()
        img_bytes = _extract_image(data)
        if img_bytes is not None:
            return img_bytes
        # 200 but no image — surface any text / block reason the model returned
        raise GeminiError(_no_image_reason(data))

    raise GeminiError(last_err or "No usable Gemini image model was found.")


def _extract_image(data):
    for cand in data.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inline_data") or part.get("inlineData")
            if inline and inline.get("data"):
                try:
                    return base64.b64decode(inline["data"])
                except Exception:
                    continue
    return None


def _no_image_reason(data):
    fb = data.get("promptFeedback", {})
    if fb.get("blockReason"):
        return (f"The request was blocked by Gemini "
                f"(reason: {fb['blockReason']}). Try a different image.")
    for cand in data.get("candidates", []):
        fr = cand.get("finishReason")
        texts = [p.get("text") for p in cand.get("content", {}).get("parts", [])
                 if p.get("text")]
        if texts:
            return ("Gemini returned text instead of an image: "
                    + " ".join(texts)[:300])
        if fr and fr not in ("STOP", "MAX_TOKENS"):
            return f"Gemini stopped without an image (finishReason: {fr})."
    return "Gemini did not return an image for this request."


def _error_snippet(resp):
    try:
        j = resp.json()
        return j.get("error", {}).get("message", resp.text[:300])
    except Exception:
        return resp.text[:300]


# ── GUI ───────────────────────────────────────────────────────────────────────
_AppBase = TkinterDnD.Tk if HAS_DND else tk.Tk


class App(_AppBase):
    def __init__(self):
        super().__init__()
        self.title("EVOQ Render Enhancer")
        self.minsize(720, 480)
        self._image_order = []
        self._image_set = set()
        self._ref_order = []
        self._ref_set = set()
        self._logo_img = None
        self._icon_img = None
        self._orig_preview = None
        self._result_preview = None
        self._orig_path = None
        self._last_result_path = None
        self._cancel = threading.Event()
        self._custom_prompt = ""
        self._cfg = load_config()
        self._lang = self._cfg.get("lang") if self._cfg.get("lang") in I18N else "en"

        self._init_vars()
        self._apply_style()
        self._set_window_icon()
        self._build_ui()
        self._restore_config()
        self._set_initial_geometry()
        if HAS_DND:
            self.drop_target_register(DND_FILES)
            self.dnd_bind('<<Drop>>', self._handle_drop)

    def _set_initial_geometry(self):
        """Open at a comfortable size that fits the screen; the body scrolls."""
        self.update_idletasks()
        try:
            sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        except Exception:
            sw, sh = 1280, 800
        w = min(960, max(760, sw - 120))
        h = min(940, max(480, sh - 100))
        self.geometry(f"{w}x{h}")

    # Persistent tk variables (created once so they survive UI rebuilds) ─────────
    def _init_vars(self):
        self.lang_var = tk.StringVar(
            value=next(n for n, c in LANGUAGES if c == self._lang))
        self.count_var = tk.StringVar()
        self.ref_count_var = tk.StringVar()
        self.narrative_vars = {n["key"]: tk.BooleanVar(value=(i == 0))
                               for i, n in enumerate(NARRATIVES)}
        self.extra_var = tk.StringVar()
        self.api_var = tk.StringVar()
        self._show_key = tk.BooleanVar(value=False)
        self.remember_key = tk.BooleanVar(value=True)
        docs = os.path.join(os.path.expanduser("~"), "Documents")
        default_dir = docs if os.path.isdir(docs) else os.path.expanduser("~")
        self.output_var = tk.StringVar(value=default_dir)
        self.open_after_var = tk.BooleanVar(value=True)
        self.custom_var = tk.BooleanVar(value=False)
        self.status_var = tk.StringVar()

    def _apply_style(self):
        """A bright, flat, consistent look applied to classic tk + ttk widgets."""
        self.configure(bg=UI_BG)
        o = self.option_add
        o('*Font', ('Segoe UI', 9))
        o('*background', UI_BG)
        o('*foreground', UI_FG)
        o('*Label.background', UI_BG)
        o('*Frame.background', UI_BG)
        o('*Labelframe.background', UI_BG)
        o('*Labelframe.foreground', UI_FG)
        o('*Labelframe.font', ('Segoe UI', 9, 'bold'))
        for cls in ('Checkbutton', 'Radiobutton'):
            o(f'*{cls}.background', UI_BG)
            o(f'*{cls}.foreground', UI_FG)
            o(f'*{cls}.activeBackground', UI_BG)
            o(f'*{cls}.selectColor', UI_INPUT)
            o(f'*{cls}.highlightThickness', 0)
        o('*Button.background', UI_BTN)
        o('*Button.foreground', UI_FG)
        o('*Button.activeBackground', UI_BTN_HOVER)
        o('*Button.activeForeground', UI_FG)
        o('*Button.relief', 'flat')
        o('*Button.borderWidth', 0)
        o('*Button.highlightThickness', 0)
        o('*Button.padX', 10)
        o('*Button.padY', 5)
        o('*Button.cursor', 'hand2')
        for w in ('Entry', 'Text'):
            o(f'*{w}.background', UI_INPUT)
            o(f'*{w}.foreground', UI_FG)
            o(f'*{w}.relief', 'solid')
            o(f'*{w}.borderWidth', 1)
            o(f'*{w}.highlightThickness', 1)
            o(f'*{w}.highlightColor', UI_ACCENT)
            o(f'*{w}.highlightBackground', UI_BORDER)
            o(f'*{w}.insertBackground', UI_FG)
        o('*Listbox.background', UI_INPUT)
        o('*Listbox.foreground', UI_FG)
        o('*Listbox.relief', 'flat')
        o('*Listbox.borderWidth', 0)
        o('*Listbox.highlightThickness', 1)
        o('*Listbox.highlightBackground', UI_BORDER)
        o('*Listbox.selectBackground', UI_ACCENT)
        o('*Listbox.selectForeground', '#ffffff')

        style = ttk.Style(self)
        try:
            style.theme_use('clam')
        except Exception:
            pass
        style.configure('TCombobox', fieldbackground=UI_INPUT,
                        background=UI_BTN, foreground=UI_FG, arrowsize=14)
        style.map('TCombobox', fieldbackground=[('readonly', UI_INPUT)])
        style.configure('Horizontal.TProgressbar', background=UI_ACCENT,
                        troughcolor='#e2e8f0', borderwidth=0, thickness=8)

    def t(self, key, **kw):
        s = I18N[self._lang].get(key, I18N["en"].get(key, key))
        return s.format(**kw) if kw else s

    def _style_text(self, key):
        return I18N[self._lang]["styles"].get(
            key, I18N["en"]["styles"][key])

    def _set_window_icon(self):
        # Taskbar / title-bar icon (works on all platforms via a PhotoImage).
        png = _asset("assets", "render_enhancer_icon.png")
        if not os.path.exists(png):
            png = _asset("render_enhancer_icon.png")
        try:
            if os.path.exists(png):
                with Image.open(png) as raw:
                    self._icon_img = ImageTk.PhotoImage(
                        raw.resize((64, 64), Image.LANCZOS))
                self.iconphoto(True, self._icon_img)
        except Exception:
            pass
        # On Windows an .ico gives a crisper title-bar icon.
        ico = _asset("assets", "render_enhancer.ico")
        if not os.path.exists(ico):
            ico = _asset("render_enhancer.ico")
        if sys.platform.startswith("win") and os.path.exists(ico):
            try:
                self.iconbitmap(ico)
            except Exception:
                pass

    # ── UI construction (rebuildable for language switch) ───────────────────────
    def _build_ui(self):
        pad = dict(padx=10, pady=5)

        # Root layout: scrollable body (row 0) + fixed action bar (row 1) so the
        # Enhance/Cancel buttons stay reachable on any screen size.
        self.rowconfigure(0, weight=1)
        self.rowconfigure(1, weight=0)
        self.columnconfigure(0, weight=1)

        canvas = tk.Canvas(self, bg=UI_BG, highlightthickness=0)
        canvas.grid(row=0, column=0, sticky="nsew")
        vbar = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)
        vbar.grid(row=0, column=1, sticky="ns")
        canvas.configure(yscrollcommand=vbar.set)
        body = tk.Frame(canvas)
        body_id = canvas.create_window((0, 0), window=body, anchor="nw")
        canvas.bind("<Configure>",
                    lambda e: canvas.itemconfigure(body_id, width=e.width))
        body.bind("<Configure>",
                  lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        self._bind_wheel(canvas)

        body.columnconfigure(0, weight=1)
        body.columnconfigure(1, weight=1)

        # Header: logo + language selector
        header = tk.Frame(body)
        header.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        header.columnconfigure(0, weight=1)
        logo_path = _resource_path('evoq_logo.png')
        if os.path.exists(logo_path):
            if self._logo_img is None:
                with Image.open(logo_path) as raw:
                    dw = 260
                    dh = round(raw.height / raw.width * dw)
                    self._logo_img = ImageTk.PhotoImage(
                        raw.resize((dw, dh), Image.LANCZOS))
            tk.Label(header, image=self._logo_img, bg=self.cget('bg')).grid(
                row=0, column=0, sticky="w", padx=(10, 0))
        lang_box = tk.Frame(header)
        lang_box.grid(row=0, column=1, sticky="ne", padx=8)
        tk.Label(lang_box, text=self.t("language")).pack(side="left")
        lang_menu = ttk.Combobox(lang_box, textvariable=self.lang_var,
                                 values=[n for n, _ in LANGUAGES],
                                 state="readonly", width=10)
        lang_menu.pack(side="left")
        lang_menu.bind("<<ComboboxSelected>>", self._on_language)

        title_box = tk.Frame(body)
        title_box.grid(row=1, column=0, columnspan=2, pady=(2, 6))
        tk.Label(title_box, text=self.t("subtitle"),
                 font=("Segoe UI", 12, "bold"), fg=UI_FG).pack()
        tk.Label(title_box, text=self.t("powered_by"),
                 font=("Segoe UI", 8), fg=UI_MUTED).pack()

        left = tk.Frame(body)
        left.grid(row=2, column=0, sticky="nsew", **pad)
        right = tk.Frame(body)
        right.grid(row=2, column=1, sticky="nsew", **pad)

        self._build_image_panel(left)
        self._build_ref_panel(left)
        self._build_narrative_panel(left)
        self._build_api_panel(left)
        self._build_output_panel(left)
        self._build_preview_panel(right)

        # Fixed bottom bar (progress + status + actions + copyright)
        bar = tk.Frame(self)
        bar.grid(row=1, column=0, columnspan=2, sticky="ew")
        bar.columnconfigure(0, weight=1)
        self.progress = ttk.Progressbar(bar, mode="determinate")
        self.progress.grid(row=0, column=0, padx=10, pady=(6, 2), sticky="ew")
        if not self.status_var.get():
            self.status_var.set(self.t("ready"))
        tk.Label(bar, textvariable=self.status_var, anchor="w").grid(
            row=1, column=0, sticky="ew", padx=10)

        btn_bar = tk.Frame(bar)
        btn_bar.grid(row=2, column=0, pady=(4, 4))
        self.gen_btn = tk.Button(btn_bar, text=self.t("enhance"),
                                 command=self._generate, width=26,
                                 font=("Segoe UI", 10, "bold"),
                                 bg=UI_ACCENT, fg="#ffffff",
                                 activebackground=UI_ACCENT_HI,
                                 activeforeground="#ffffff", padx=12, pady=6)
        self.gen_btn.pack(side="left", padx=(0, 6))
        self.cancel_btn = tk.Button(btn_bar, text=self.t("cancel"), width=10,
                                    command=self._request_cancel, state="disabled")
        self.cancel_btn.pack(side="left")

        tk.Label(bar, text=COPYRIGHT, anchor="center", fg=UI_MUTED,
                 font=("Segoe UI", 8)).grid(
            row=3, column=0, pady=(0, 8))

        self._refresh_count()

    def _bind_wheel(self, canvas):
        def _wheel(event):
            if getattr(event, "num", None) == 4:
                canvas.yview_scroll(-1, "units")
            elif getattr(event, "num", None) == 5:
                canvas.yview_scroll(1, "units")
            elif event.delta:
                canvas.yview_scroll(int(-event.delta / 120), "units")
        canvas.bind_all("<MouseWheel>", _wheel)   # Windows / macOS
        canvas.bind_all("<Button-4>", _wheel)     # Linux scroll up
        canvas.bind_all("<Button-5>", _wheel)     # Linux scroll down

    def _build_image_panel(self, parent):
        title = self.t("src_frame") + (self.t("dnd_hint") if HAS_DND else "")
        frame = tk.LabelFrame(parent, text=title)
        frame.pack(fill="both", expand=True, pady=(0, 6))

        btn_row = tk.Frame(frame)
        btn_row.pack(fill="x", padx=5, pady=(5, 2))
        tk.Button(btn_row, text=self.t("add_files"),
                  command=self._browse_files).pack(side="left", padx=(0, 4))
        tk.Button(btn_row, text=self.t("add_folder"),
                  command=self._browse_folder).pack(side="left", padx=(0, 4))
        tk.Button(btn_row, text=self.t("clear"),
                  command=self._clear_images).pack(side="left")

        list_outer = tk.Frame(frame, relief="sunken", bd=1)
        list_outer.pack(fill="both", expand=True, padx=5, pady=(2, 0))
        self._listbox = tk.Listbox(list_outer, selectmode=tk.EXTENDED,
                                   height=6, activestyle="none",
                                   exportselection=False)
        vsb = tk.Scrollbar(list_outer, orient="vertical",
                           command=self._listbox.yview)
        self._listbox.configure(yscrollcommand=vsb.set)
        self._listbox.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")
        self._listbox.bind("<<ListboxSelect>>", lambda _: self._on_select())
        # Repopulate after a rebuild
        for path in self._image_order:
            self._listbox.insert(tk.END, os.path.basename(path))

        count_row = tk.Frame(frame)
        count_row.pack(fill="x", padx=5, pady=(2, 5))
        tk.Label(count_row, textvariable=self.count_var, anchor="w").pack(
            side="left", expand=True, fill="x")
        tk.Button(count_row, text=self.t("none"), command=self._select_none,
                  width=5).pack(side="right", padx=(2, 0))
        tk.Button(count_row, text=self.t("all"), command=self._select_all,
                  width=5).pack(side="right")

    def _build_ref_panel(self, parent):
        frame = tk.LabelFrame(parent, text=self.t("ref_frame"))
        frame.pack(fill="x", pady=(0, 6))
        tk.Label(frame, text=self.t("ref_hint"), fg="#555",
                 font=("Segoe UI", 8), wraplength=360, justify="left").pack(
            anchor="w", padx=8, pady=(4, 0))
        row = tk.Frame(frame)
        row.pack(fill="x", padx=8, pady=(2, 6))
        tk.Button(row, text=self.t("ref_add"),
                  command=self._browse_refs).pack(side="left", padx=(0, 4))
        tk.Button(row, text=self.t("clear"),
                  command=self._clear_refs).pack(side="left")
        tk.Label(row, textvariable=self.ref_count_var, anchor="w",
                 fg="#555", font=("Segoe UI", 8)).pack(
            side="left", padx=(8, 0), expand=True, fill="x")
        self._refresh_ref_count()

    def _build_narrative_panel(self, parent):
        frame = tk.LabelFrame(parent, text=self.t("narr_frame"))
        frame.pack(fill="x", pady=(0, 6))

        hdr = tk.Frame(frame)
        hdr.pack(fill="x", padx=8, pady=(4, 0))
        tk.Label(hdr, text=self.t("narr_hint"), fg="#555",
                 font=("Segoe UI", 8)).pack(side="left")
        tk.Button(hdr, text=self.t("all4"), width=6,
                  command=lambda: self._set_all_narratives(True)).pack(side="right")
        tk.Button(hdr, text=self.t("none"), width=6,
                  command=lambda: self._set_all_narratives(False)).pack(
            side="right", padx=(0, 2))

        for n in NARRATIVES:
            name, blurb = self._style_text(n["key"])
            tk.Checkbutton(frame, text=name, variable=self.narrative_vars[n["key"]],
                           font=("Segoe UI", 9, "bold")).pack(
                anchor="w", padx=8, pady=(4, 0))
            tk.Label(frame, text=blurb, fg=UI_MUTED,
                     font=("Segoe UI", 8)).pack(anchor="w", padx=28, pady=(0, 2))

        # Custom prompt style
        tk.Checkbutton(frame, text=self._style_text("custom")[0],
                       variable=self.custom_var,
                       font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=8,
                                                          pady=(4, 0))
        tk.Label(frame, text=self.t("custom_hint"), fg=UI_MUTED,
                 font=("Segoe UI", 8), wraplength=360, justify="left").pack(
            anchor="w", padx=28, pady=(0, 2))
        self._custom_text = tk.Text(frame, height=3, wrap="word",
                                    font=("Segoe UI", 9))
        self._custom_text.pack(fill="x", padx=28, pady=(0, 4))
        if self._custom_prompt:
            self._custom_text.insert("1.0", self._custom_prompt)

        extra_row = tk.Frame(frame)
        extra_row.pack(fill="x", padx=8, pady=(4, 6))
        tk.Label(extra_row, text=self.t("extra_label"),
                 font=("Segoe UI", 8)).pack(anchor="w")
        tk.Entry(extra_row, textvariable=self.extra_var).pack(fill="x")

    def _build_api_panel(self, parent):
        frame = tk.LabelFrame(parent, text=self.t("api_frame"))
        frame.pack(fill="x", pady=(0, 6))
        row = tk.Frame(frame)
        row.pack(fill="x", padx=6, pady=6)
        self.api_entry = tk.Entry(row, textvariable=self.api_var,
                                  show="" if self._show_key.get() else "•")
        self.api_entry.pack(side="left", fill="x", expand=True)
        tk.Checkbutton(row, text=self.t("show"), variable=self._show_key,
                       command=self._toggle_key).pack(side="left", padx=(4, 0))

        bottom = tk.Frame(frame)
        bottom.pack(fill="x", padx=6, pady=(0, 4))
        tk.Checkbutton(bottom, text=self.t("remember"),
                       variable=self.remember_key).pack(side="left")
        link = tk.Label(bottom, text=self.t("get_key"), fg="#1a5276",
                        cursor="hand2", font=("Segoe UI", 8, "underline"))
        link.pack(side="right")
        link.bind("<Button-1>", lambda _: webbrowser.open(GET_KEY_URL))

    def _build_output_panel(self, parent):
        frame = tk.LabelFrame(parent, text=self.t("output_frame"))
        frame.pack(fill="x", pady=(0, 6))
        row = tk.Frame(frame)
        row.pack(fill="x", padx=6, pady=6)
        tk.Entry(row, textvariable=self.output_var).pack(
            side="left", fill="x", expand=True)
        tk.Button(row, text=self.t("browse"),
                  command=self._browse_output).pack(side="left", padx=(4, 0))
        tk.Checkbutton(frame, text=self.t("open_after"),
                       variable=self.open_after_var).pack(
            anchor="w", padx=6, pady=(0, 4))

    def _build_preview_panel(self, parent):
        frame = tk.LabelFrame(parent, text=self.t("preview_frame"))
        frame.pack(fill="both", expand=True)
        tk.Label(frame, text=self.t("prev_selected"),
                 font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=6, pady=(4, 0))
        self._orig_label = tk.Label(frame, text=self.t("none_img"), fg="#888",
                                    width=40, height=9, relief="sunken", bd=1,
                                    cursor="hand2")
        self._orig_label.pack(fill="both", expand=True, padx=6, pady=(2, 6))
        self._orig_label.bind(
            "<Button-1>", lambda _: self._open_path(self._orig_path))
        tk.Label(frame, text=self.t("prev_result"),
                 font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=6, pady=(0, 0))
        self._result_label = tk.Label(frame, text=self.t("none_img"), fg="#888",
                                      width=40, height=9, relief="sunken", bd=1,
                                      cursor="hand2")
        self._result_label.pack(fill="both", expand=True, padx=6, pady=(2, 6))
        self._result_label.bind(
            "<Button-1>", lambda _: self._open_path(self._last_result_path))
        # Re-attach previews after a rebuild
        if self._orig_preview is not None:
            self._orig_label.config(image=self._orig_preview, text="")
        if self._result_preview is not None:
            self._result_label.config(image=self._result_preview, text="")

    @staticmethod
    def _open_path(path):
        if not path or not os.path.exists(path):
            return
        try:
            if sys.platform.startswith("win"):
                os.startfile(path)  # noqa: Windows only
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
        except Exception:
            pass

    # ── Language switch ─────────────────────────────────────────────────────────
    def _on_language(self, _evt=None):
        code = dict((n, c) for n, c in LANGUAGES).get(self.lang_var.get(), "en")
        if code == self._lang:
            return
        ready_texts = {I18N[l]["ready"] for l in I18N}
        was_idle = self.status_var.get() in ready_texts
        self._lang = code
        self._custom_prompt = self._get_custom_prompt()  # preserve across rebuild
        sel = list(self._listbox.curselection())
        for w in self.winfo_children():
            w.destroy()
        self._build_ui()
        if was_idle:
            self.status_var.set(self.t("ready"))
        for i in sel:
            self._listbox.select_set(i)
        self._refresh_count()
        self._cfg["lang"] = code
        save_config(self._cfg)

    # ── Config persistence ─────────────────────────────────────────────────────
    def _restore_config(self):
        if self._cfg.get("api_key"):
            self.api_var.set(self._cfg["api_key"])
        saved = self._cfg.get("narratives")
        if isinstance(saved, list) and any(k in NARRATIVE_BY_KEY for k in saved):
            for key, var in self.narrative_vars.items():
                var.set(key in saved)
        if self._cfg.get("output_dir") and os.path.isdir(self._cfg["output_dir"]):
            self.output_var.set(self._cfg["output_dir"])
        if self._cfg.get("custom_prompt"):
            self._custom_prompt = self._cfg["custom_prompt"]
            if hasattr(self, "_custom_text"):
                self._custom_text.delete("1.0", "end")
                self._custom_text.insert("1.0", self._custom_prompt)
        self.custom_var.set(bool(self._cfg.get("custom_on")))

    def _persist_config(self):
        cfg = dict(self._cfg)
        cfg["lang"] = self._lang
        cfg["narratives"] = [n["key"] for n in self._selected_narratives()
                             if n["key"] in NARRATIVE_BY_KEY]
        cfg["custom_on"] = bool(self.custom_var.get())
        cfg["custom_prompt"] = self._get_custom_prompt()
        cfg["output_dir"] = self.output_var.get().strip()
        if self.remember_key.get():
            cfg["api_key"] = self.api_var.get().strip()
        else:
            cfg.pop("api_key", None)
        self._cfg = cfg
        save_config(cfg)

    # ── Small UI helpers ────────────────────────────────────────────────────────
    def _toggle_key(self):
        self.api_entry.config(show="" if self._show_key.get() else "•")

    def _set_all_narratives(self, value):
        for var in self.narrative_vars.values():
            var.set(value)

    def _get_custom_prompt(self):
        if hasattr(self, "_custom_text"):
            return self._custom_text.get("1.0", "end").strip()
        return self._custom_prompt

    def _selected_narratives(self):
        sel = [n for n in NARRATIVES if self.narrative_vars[n["key"]].get()]
        if self.custom_var.get():
            text = self._get_custom_prompt()
            if text:
                sel.append({"key": "custom", "prompt": text})
        return sel

    def _on_select(self):
        self._refresh_count()
        sel = self._listbox.curselection()
        if sel:
            self._show_original_preview(self._image_order[sel[0]])

    # ── Image list management ─────────────────────────────────────────────────
    def _add_images(self, paths):
        start = len(self._image_order)
        for path in paths:
            if path in self._image_set:
                continue
            self._image_order.append(path)
            self._image_set.add(path)
            self._listbox.insert(tk.END, os.path.basename(path))
        if len(self._image_order) > start:
            self._listbox.select_clear(0, tk.END)
            self._listbox.select_set(start)
            self._show_original_preview(self._image_order[start])
        self._refresh_count()

    def _collect_from_folder(self, folder):
        images = []
        for fname in sorted(os.listdir(folder), key=natural_sort_key):
            if os.path.splitext(fname)[1].lower() in IMAGE_EXTS:
                images.append(os.path.join(folder, fname))
        return images

    def _clear_images(self):
        self._listbox.delete(0, tk.END)
        self._image_order.clear()
        self._image_set.clear()
        self._orig_label.config(image="", text=self.t("none_img"))
        self._orig_preview = None
        self._orig_path = None
        self._refresh_count()

    def _select_all(self):
        self._listbox.select_set(0, tk.END)
        self._refresh_count()

    def _select_none(self):
        self._listbox.select_clear(0, tk.END)
        self._refresh_count()

    def _refresh_count(self):
        total = len(self._image_order)
        sel = len(self._listbox.curselection()) if hasattr(self, "_listbox") else 0
        if total == 0:
            self.count_var.set(self.t("count_none"))
        elif sel == total:
            self.count_var.set(self.t("count_all", n=total))
        else:
            self.count_var.set(self.t("count_some", sel=sel, total=total))

    def _get_selected(self):
        return [self._image_order[i] for i in self._listbox.curselection()]

    # ── Material reference management ───────────────────────────────────────────
    def _browse_refs(self):
        paths = filedialog.askopenfilenames(
            title=self.t("sel_refs"),
            filetypes=[(self.t("filetype_images"), "*.jpg *.jpeg *.png *.webp *.bmp"),
                       (self.t("filetype_all"), "*.*")])
        if paths:
            self._add_refs(list(paths))

    def _add_refs(self, paths):
        for path in paths:
            if len(self._ref_order) >= MAX_REFS:
                messagebox.showinfo(self.t("ref_frame"),
                                    self.t("ref_max", n=MAX_REFS))
                break
            if path in self._ref_set:
                continue
            self._ref_order.append(path)
            self._ref_set.add(path)
        self._refresh_ref_count()

    def _clear_refs(self):
        self._ref_order.clear()
        self._ref_set.clear()
        self._refresh_ref_count()

    def _refresh_ref_count(self):
        n = len(self._ref_order)
        if n == 0:
            self.ref_count_var.set(self.t("ref_none"))
        else:
            names = ", ".join(os.path.basename(p) for p in self._ref_order)
            self.ref_count_var.set(self.t("ref_count", n=n) + "  " + names)

    # ── Preview rendering ────────────────────────────────────────────────────────
    def _show_original_preview(self, path):
        img = self._make_thumb(path)
        if img is not None:
            self._orig_preview = img
            self._orig_path = path
            self._orig_label.config(image=img, text="")

    def _show_result_preview_from_bytes(self, data):
        import io
        try:
            with Image.open(io.BytesIO(data)) as im:
                thumb = self._fit_thumb(im.copy())
            self._result_preview = ImageTk.PhotoImage(thumb)
            self._result_label.config(image=self._result_preview, text="")
        except Exception:
            self._result_label.config(image="", text=self.t("preview_fail"))

    def _make_thumb(self, path):
        try:
            with Image.open(path) as im:
                im = ImageOps.exif_transpose(im)
                thumb = self._fit_thumb(im.copy())
            return ImageTk.PhotoImage(thumb)
        except Exception:
            return None

    @staticmethod
    def _fit_thumb(im, box=(360, 200)):
        im.thumbnail(box, Image.LANCZOS)
        return im

    # ── Event handlers ──────────────────────────────────────────────────────────
    def _handle_drop(self, event):
        paths = self._parse_dnd(event.data)
        images = []
        for path in paths:
            if os.path.isdir(path):
                images.extend(self._collect_from_folder(path))
            elif os.path.isfile(path):
                if os.path.splitext(path)[1].lower() in IMAGE_EXTS:
                    images.append(path)
        if images:
            self._add_images(images)

    @staticmethod
    def _parse_dnd(raw):
        paths, i = [], 0
        while i < len(raw):
            if raw[i] == '{':
                end = raw.index('}', i)
                paths.append(raw[i + 1:end])
                i = end + 2
            elif raw[i] == ' ':
                i += 1
            else:
                end = raw.find(' ', i)
                if end == -1:
                    end = len(raw)
                paths.append(raw[i:end])
                i = end + 1
        return [p for p in paths if p]

    def _browse_folder(self):
        folder = filedialog.askdirectory(title=self.t("sel_folder"))
        if not folder:
            return
        images = self._collect_from_folder(folder)
        if images:
            self._add_images(images)
        else:
            messagebox.showwarning(self.t("no_images_title"),
                                   self.t("no_images_msg"))

    def _browse_files(self):
        paths = filedialog.askopenfilenames(
            title=self.t("sel_files"),
            filetypes=[(self.t("filetype_images"), "*.jpg *.jpeg *.png *.webp *.bmp"),
                       (self.t("filetype_all"), "*.*")])
        if paths:
            self._add_images(list(paths))

    def _browse_output(self):
        folder = filedialog.askdirectory(title=self.t("sel_output"))
        if folder:
            self.output_var.set(folder)

    # ── Generation ──────────────────────────────────────────────────────────────
    def _request_cancel(self):
        self._cancel.set()
        self.cancel_btn.config(state="disabled")
        self.status_var.set(self.t("cancelling"))

    def _generate(self):
        images = self._get_selected()
        api_key = self.api_var.get().strip()
        output_dir = self.output_var.get().strip()
        narratives = self._selected_narratives()
        extra = self.extra_var.get().strip()

        if not HAS_REQUESTS:
            messagebox.showerror(self.t("dlg_missing_title"),
                                 self.t("dlg_missing_msg"))
            return
        if not images:
            messagebox.showerror(self.t("err_title"), self.t("err_no_images"))
            return
        if not narratives:
            key = ("err_custom_empty" if self.custom_var.get()
                   else "err_no_styles")
            messagebox.showerror(self.t("err_title"), self.t(key))
            return
        if not api_key:
            messagebox.showerror(self.t("err_title"), self.t("err_no_key"))
            return
        if not output_dir or not os.path.isdir(output_dir):
            messagebox.showerror(self.t("err_title"), self.t("err_no_output"))
            return

        self._persist_config()
        jobs = [(path, n) for path in images for n in narratives]
        refs = list(self._ref_order)
        retry_msgs = {"retry_net": self.t("retry_net"),
                      "retry_busy": self.t("retry_busy")}

        self._cancel.clear()
        self.gen_btn.config(state="disabled")
        self.cancel_btn.config(state="normal")
        self.progress["value"] = 0
        self.status_var.set(self.t("starting"))

        def status(msg):
            self.after(0, lambda: self.status_var.set(msg))

        def run():
            total = len(jobs)
            done = 0
            saved_paths = []
            errors = []
            cancelled = False
            for path, narrative in jobs:
                if self._cancel.is_set():
                    cancelled = True
                    break
                name = os.path.basename(path)
                style_name = self._style_text(narrative["key"])[0]
                status(self.t("enhancing", name=name, style=style_name,
                              i=done + 1, n=total))
                prompt = narrative["prompt"]
                if extra:
                    prompt = prompt + "\nAdditional direction: " + extra
                try:
                    data = enhance_image(
                        api_key, prompt, path,
                        status_cb=status,
                        should_cancel=self._cancel.is_set,
                        messages=retry_msgs,
                        ref_paths=refs)
                    out_path = self._output_path(output_dir, path, narrative["key"])
                    with open(out_path, 'wb') as f:
                        f.write(data)
                    saved_paths.append(out_path)
                    self._last_result_path = out_path
                    self.after(0, lambda d=data: self._show_result_preview_from_bytes(d))
                except CancelledError:
                    cancelled = True
                    break
                except (GeminiError, Exception) as e:
                    errors.append(f"{name} [{style_name}]: {e}")
                done += 1
                self.after(0, lambda d=done: self.progress.config(
                    value=d / total * 100))

            self.after(0, lambda: self._finish(
                saved_paths, errors, output_dir, cancelled))

        threading.Thread(target=run, daemon=True).start()

    @staticmethod
    def _output_path(output_dir, src_path, narrative_key):
        base = os.path.splitext(os.path.basename(src_path))[0]
        candidate = os.path.join(output_dir, f"{base}_{narrative_key}.png")
        n = 2
        while os.path.exists(candidate):
            candidate = os.path.join(output_dir, f"{base}_{narrative_key}_{n}.png")
            n += 1
        return candidate

    def _finish(self, saved_paths, errors, output_dir, cancelled=False):
        self.gen_btn.config(state="normal")
        self.cancel_btn.config(state="disabled")
        self._cancel.clear()

        n = len(saved_paths)
        if n:
            key = "cancelled_saved" if cancelled else "done_saved"
            self.status_var.set(self.t(key, n=n, dir=output_dir))
            if self.open_after_var.get() and not cancelled:
                self._open_path(saved_paths[-1])
        else:
            self.status_var.set(
                self.t("cancelled") if cancelled else self.t("no_images_produced"))

        errs = "\n".join(errors[:8])
        if cancelled:
            msg = self.t("cancel_msg", n=n)
            if errors:
                msg += self.t("cancel_errs", errs="\n".join(errors[:6]))
            messagebox.showinfo(self.t("cancel_title"), msg)
        elif errors and saved_paths:
            messagebox.showwarning(self.t("partial_title"),
                                   self.t("partial_msg", n=n, errs=errs))
        elif errors:
            messagebox.showerror(self.t("failed_title"),
                                 self.t("failed_msg", errs=errs))
        else:
            messagebox.showinfo(self.t("done_title"),
                                self.t("done_msg", n=n, dir=output_dir))


if __name__ == "__main__":
    app = App()
    app.mainloop()
