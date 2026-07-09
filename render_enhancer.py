"""
Render Enhancer — turns architectural renders (e.g. Enscape output) into
hyper-photorealistic presentation images to help get a design approved by a
client.

Uses Google's Gemini "Nano Banana" image model (gemini-2.5-flash-image) for
image-to-image enhancement. The user picks one of four curated narrative
styles; each style keeps the original viewpoint, geometry and proportions
while re-lighting and re-texturing the scene for realism.

Requires: Pillow, requests  (tkinterdnd2 optional, for drag-and-drop)
Build to .exe: pyinstaller render_enhancer.spec
"""

import os
import re
import sys
import json
import base64
import threading
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


# ── Constants ─────────────────────────────────────────────────────────────────
APP_VERSION = "v1.0"
APP_DATE    = "July 2026"
COPYRIGHT   = f"© Eric Stein, EVOQ Architecture  ·  {APP_VERSION}  ·  {APP_DATE}"

# "Nano Banana" — Gemini 2.5 Flash Image. Try the stable id first, then preview.
GEMINI_MODELS = ("gemini-2.5-flash-image", "gemini-2.5-flash-image-preview")
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
MAX_UPLOAD_PX = 2048   # downscale huge renders before upload to stay within limits
REQUEST_TIMEOUT = 180  # seconds per image

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".evoq_render_enhancer.json")


# ── Narrative prompt library ────────────────────────────────────────────────────
# Each entry keeps the render's exact geometry/viewpoint and only changes the
# lighting narrative, materiality and (limited, background-only) human entourage.
NARRATIVES = [
    {
        "key": "golden_hour",
        "name": "Golden Hour",
        "blurb": "High-contrast morning light, long shadows, tactile masonry.",
        "prompt": (
            "[Image-to-Image with low denoising] Strict, non-negotiable adherence "
            "to the original viewpoint, structural proportions, and all "
            "architectural geometry of the attached render. This scene must be an "
            "exact structural replica of the base image, bathed in clear, "
            "low-angle morning golden hour sunlight, casting long, defined "
            "shadows.\n"
            "Material Focus: The warm light must emphasize the specific masonry, "
            "making the rough texture and precise mortar joints highly tactile. "
            "The metal facades and mullions exhibit complex, warm specular "
            "highlights. Glass is transparent, revealing detailed, warm-lit "
            "interiors and a reflection of the low sun.\n"
            "Diverse Human Entourage: A total of no more than 5 human figures "
            "provide scale. Crucially, all figures are distant and positioned only "
            "in the mid-ground or background. The figures include diverse "
            "individuals (e.g., a Black grandmother, a young child, and a few "
            "professionals of varying ages). Shot on a 50mm lens, professional "
            "architectural photography, hyper-realistic, 8k resolution."
        ),
    },
    {
        "key": "soft_diffuse",
        "name": "Soft Diffuse Overcast",
        "blurb": "Even overcast light, subtle texture, accurate colour.",
        "prompt": (
            "[Image-to-Image with low denoising] Transform the attached Enscape "
            "render into a convincing, hyper-realistic visualization while "
            "maintaining precise, identical architectural geometry and "
            "perspective. The lighting is soft, diffuse, and perfectly even under "
            "an overcast sky, subtly defining form.\n"
            "Material Focus: Material definition must be perfect. Detail the "
            "specific masonry (e.g., brickwork) without dramatic shadow, focusing "
            "on fine texture and accurate color. All metal finishes appear sleek "
            "and matte, with accurate material transitions. Glass is exceptionally "
            "transparent, with minimal, soft, cool-toned reflections, revealing "
            "the true color and details of the interior spaces.\n"
            "Diverse Human Entourage: A total of no more than 5 diverse human "
            "figures provide accurate human scale. All figures must be located in "
            "the mid-ground and background, never close to the camera. The figures "
            "include diverse individuals (e.g., a few students and professionals). "
            "Shot on a 35mm lens, high-fidelity architectural presentation, "
            "photorealistic, 8k."
        ),
    },
    {
        "key": "blue_hour",
        "name": "Blue Hour Twilight",
        "blurb": "Deep twilight sky, warm glowing interiors, luminous depth.",
        "prompt": (
            "[Image-to-Image with low denoising] Generate a high-resolution, "
            "photorealistic 'blue hour' rendering, retaining the exact viewpoint "
            "and all architectural geometry of the attached model. The sky is a "
            "deep twilight blue, with warm interior lighting radiating from every "
            "window, contrasting with the cool ambient exterior light.\n"
            "Material Focus: All masonry features a gradient: cooler on the "
            "exterior face, warmed by proximity to interior light sources. The "
            "metal framework is highly visible and crisp. Glass is intensely "
            "transparent, providing clear, detailed views of the complex, warm-lit "
            "interior programs.\n"
            "Diverse Human Entourage: Strict maximum of 5 human figures. Introduce "
            "a dynamic scene with these 5 diverse people positioned well away from "
            "the viewer in the mid-ground and background, interacting with the "
            "plaza or terrace at dusk. Professional night architectural "
            "photography, 8k resolution."
        ),
    },
    {
        "key": "post_rain",
        "name": "Post-Rain Dramatic",
        "blurb": "Breaking storm light, wet reflective surfaces, drama.",
        "prompt": (
            "[Image-to-Image with low denoising] Create a hyper-realistic "
            "visualization of the attached building model under dynamic post-rain "
            "conditions. Strict maintenance of original viewpoint and identical "
            "structural proportions. Soft, breaking sunlight is pushing through "
            "retreating storm clouds, highlighting wet surfaces.\n"
            "Material Focus: All masonry walls appear darker and damp, with "
            "detailed water sheens. Metal elements and fixtures are highly "
            "reflective. Glass is crisp, with clear, distorted reflections. "
            "Surrounding ground surfaces are wet, featuring sharp, complex "
            "reflections of the building and the pedestrians.\n"
            "Diverse Human Entourage: Populate the scene with exactly 4 diverse "
            "pedestrians navigating the wet pavement. These 4 figures must all be "
            "positioned in the mid-ground and background, clear of the immediate "
            "foreground. The diverse individuals (from varying age groups and "
            "ethnicities) walk at different speeds. Extreme detail, photorealistic, "
            "8k."
        ),
    },
]
NARRATIVE_BY_KEY = {n["key"]: n for n in NARRATIVES}


# ── Utilities ─────────────────────────────────────────────────────────────────
def _resource_path(filename):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, filename)


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


def _encode_image(path):
    """Load, EXIF-correct, downscale if huge, return (base64_png, mime)."""
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')
        w, h = img.width, img.height
        if max(w, h) > MAX_UPLOAD_PX:
            ratio = MAX_UPLOAD_PX / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        import io
        buf = io.BytesIO()
        img.save(buf, 'PNG')
        return base64.b64encode(buf.getvalue()).decode('ascii'), 'image/png'


def enhance_image(api_key, prompt, image_path):
    """Call Gemini image model. Returns raw bytes of the enhanced image."""
    if not HAS_REQUESTS:
        raise GeminiError("The 'requests' library is not installed.")

    b64, mime = _encode_image(image_path)
    body = {
        "contents": [{
            "role": "user",
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": mime, "data": b64}},
            ],
        }],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    last_err = None
    for model in GEMINI_MODELS:
        url = GEMINI_ENDPOINT.format(model=model)
        try:
            resp = requests.post(url, headers=headers, json=body,
                                 timeout=REQUEST_TIMEOUT)
        except requests.exceptions.RequestException as e:
            raise GeminiError(f"Network error contacting Gemini: {e}")

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
    # Prompt-level block?
    fb = data.get("promptFeedback", {})
    if fb.get("blockReason"):
        return (f"The request was blocked by Gemini "
                f"(reason: {fb['blockReason']}). Try a different image.")
    # Candidate-level text or finish reason?
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
        self.minsize(720, 640)
        self._image_order = []
        self._image_set = set()
        self._logo_img = None
        self._orig_preview = None
        self._result_preview = None
        self._result_bytes = None
        self._cfg = load_config()
        self._build_ui()
        self._restore_config()
        if HAS_DND:
            self.drop_target_register(DND_FILES)
            self.dnd_bind('<<Drop>>', self._handle_drop)

    # ── UI construction ───────────────────────────────────────────────────────
    def _build_ui(self):
        pad = dict(padx=10, pady=5)

        # Logo / header
        logo_path = _resource_path('evoq_logo.png')
        if os.path.exists(logo_path):
            with Image.open(logo_path) as raw:
                dw = 260
                dh = round(raw.height / raw.width * dw)
                self._logo_img = ImageTk.PhotoImage(
                    raw.resize((dw, dh), Image.LANCZOS))
            tk.Label(self, image=self._logo_img, bg=self.cget('bg')).grid(
                row=0, column=0, columnspan=2, pady=(12, 0))
        tk.Label(self, text="Render Enhancer — hyper-photorealistic upgrades "
                            "for client approval",
                 font=("Segoe UI", 11, "bold")).grid(
            row=1, column=0, columnspan=2, pady=(2, 6))

        # Left column: images + settings; Right column: previews
        left = tk.Frame(self)
        left.grid(row=2, column=0, sticky="nsew", **pad)
        right = tk.Frame(self)
        right.grid(row=2, column=1, sticky="nsew", **pad)
        self.columnconfigure(0, weight=1)
        self.columnconfigure(1, weight=1)
        self.rowconfigure(2, weight=1)

        self._build_image_panel(left)
        self._build_narrative_panel(left)
        self._build_api_panel(left)
        self._build_output_panel(left)
        self._build_preview_panel(right)

        # Progress + status
        self.progress = ttk.Progressbar(self, length=440, mode="determinate")
        self.progress.grid(row=3, column=0, columnspan=2, padx=10, pady=(6, 2),
                           sticky="ew")
        self.status_var = tk.StringVar(value="Ready.")
        tk.Label(self, textvariable=self.status_var, anchor="w").grid(
            row=4, column=0, columnspan=2, sticky="ew", padx=10)

        # Generate button
        self.gen_btn = tk.Button(self, text="Enhance Render(s)",
                                 command=self._generate, width=30,
                                 font=("Segoe UI", 10, "bold"))
        self.gen_btn.grid(row=5, column=0, columnspan=2, pady=(4, 4))

        tk.Label(self, text=COPYRIGHT, anchor="center",
                 fg="#666", font=("Segoe UI", 8)).grid(
            row=6, column=0, columnspan=2, pady=(0, 8))

        if not HAS_REQUESTS:
            messagebox.showwarning(
                "Missing dependency",
                "The 'requests' library is not installed, so the app cannot "
                "contact the Gemini API.\n\nInstall it with:  pip install requests")

    def _build_image_panel(self, parent):
        dnd_hint = "  —  drag renders here" if HAS_DND else ""
        frame = tk.LabelFrame(parent, text=f"Source Renders{dnd_hint}")
        frame.pack(fill="both", expand=True, pady=(0, 6))

        btn_row = tk.Frame(frame)
        btn_row.pack(fill="x", padx=5, pady=(5, 2))
        tk.Button(btn_row, text="Add Files…",
                  command=self._browse_files).pack(side="left", padx=(0, 4))
        tk.Button(btn_row, text="Add Folder…",
                  command=self._browse_folder).pack(side="left", padx=(0, 4))
        tk.Button(btn_row, text="Clear",
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

        count_row = tk.Frame(frame)
        count_row.pack(fill="x", padx=5, pady=(2, 5))
        self.count_var = tk.StringVar(value="No renders added.")
        tk.Label(count_row, textvariable=self.count_var, anchor="w").pack(
            side="left", expand=True, fill="x")
        tk.Button(count_row, text="None", command=self._select_none,
                  width=5).pack(side="right", padx=(2, 0))
        tk.Button(count_row, text="All", command=self._select_all,
                  width=5).pack(side="right")

    def _build_narrative_panel(self, parent):
        frame = tk.LabelFrame(parent, text="Narrative Style")
        frame.pack(fill="x", pady=(0, 6))
        self.narrative_var = tk.StringVar(value=NARRATIVES[0]["key"])
        for n in NARRATIVES:
            rb = tk.Radiobutton(frame, text=n["name"], value=n["key"],
                                variable=self.narrative_var,
                                font=("Segoe UI", 9, "bold"),
                                command=self._on_narrative)
            rb.pack(anchor="w", padx=8, pady=(4, 0))
            tk.Label(frame, text=n["blurb"], fg="#555",
                     font=("Segoe UI", 8)).pack(anchor="w", padx=28, pady=(0, 2))

        extra_row = tk.Frame(frame)
        extra_row.pack(fill="x", padx=8, pady=(4, 6))
        tk.Label(extra_row, text="Extra instructions (optional):",
                 font=("Segoe UI", 8)).pack(anchor="w")
        self.extra_var = tk.StringVar()
        tk.Entry(extra_row, textvariable=self.extra_var).pack(fill="x")

    def _build_api_panel(self, parent):
        frame = tk.LabelFrame(parent, text="Gemini API Key (Nano Banana)")
        frame.pack(fill="x", pady=(0, 6))
        row = tk.Frame(frame)
        row.pack(fill="x", padx=6, pady=6)
        self.api_var = tk.StringVar()
        self.api_entry = tk.Entry(row, textvariable=self.api_var, show="•")
        self.api_entry.pack(side="left", fill="x", expand=True)
        self._show_key = tk.BooleanVar(value=False)
        tk.Checkbutton(row, text="Show", variable=self._show_key,
                       command=self._toggle_key).pack(side="left", padx=(4, 0))
        self.remember_key = tk.BooleanVar(value=True)
        tk.Checkbutton(frame, text="Remember key on this computer",
                       variable=self.remember_key).pack(
            anchor="w", padx=6, pady=(0, 4))

    def _build_output_panel(self, parent):
        frame = tk.LabelFrame(parent, text="Output Folder")
        frame.pack(fill="x", pady=(0, 6))
        docs = os.path.join(os.path.expanduser("~"), "Documents")
        default_dir = docs if os.path.isdir(docs) else os.path.expanduser("~")
        self.output_var = tk.StringVar(value=default_dir)
        row = tk.Frame(frame)
        row.pack(fill="x", padx=6, pady=6)
        tk.Entry(row, textvariable=self.output_var).pack(
            side="left", fill="x", expand=True)
        tk.Button(row, text="Browse…",
                  command=self._browse_output).pack(side="left", padx=(4, 0))
        self.open_after_var = tk.BooleanVar(value=True)
        tk.Checkbutton(frame, text="Open enhanced image when done",
                       variable=self.open_after_var).pack(
            anchor="w", padx=6, pady=(0, 4))

    def _build_preview_panel(self, parent):
        frame = tk.LabelFrame(parent, text="Preview")
        frame.pack(fill="both", expand=True)
        tk.Label(frame, text="Selected render", font=("Segoe UI", 8, "bold")).pack(
            anchor="w", padx=6, pady=(4, 0))
        self._orig_label = tk.Label(frame, text="(none)", fg="#888",
                                    width=40, height=9, relief="sunken", bd=1)
        self._orig_label.pack(fill="both", expand=True, padx=6, pady=(2, 6))
        tk.Label(frame, text="Enhanced result", font=("Segoe UI", 8, "bold")).pack(
            anchor="w", padx=6, pady=(0, 0))
        self._result_label = tk.Label(frame, text="(none)", fg="#888",
                                      width=40, height=9, relief="sunken", bd=1)
        self._result_label.pack(fill="both", expand=True, padx=6, pady=(2, 6))

    # ── Config persistence ─────────────────────────────────────────────────────
    def _restore_config(self):
        if self._cfg.get("api_key"):
            self.api_var.set(self._cfg["api_key"])
        if self._cfg.get("narrative") in NARRATIVE_BY_KEY:
            self.narrative_var.set(self._cfg["narrative"])
        if self._cfg.get("output_dir") and os.path.isdir(self._cfg["output_dir"]):
            self.output_var.set(self._cfg["output_dir"])

    def _persist_config(self):
        cfg = dict(self._cfg)
        cfg["narrative"] = self.narrative_var.get()
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

    def _on_narrative(self):
        pass  # placeholder for future live-preview of the prompt

    def _on_select(self):
        self._update_count()
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
        self._update_count()

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
        self._orig_label.config(image="", text="(none)")
        self._orig_preview = None
        self._update_count()

    def _select_all(self):
        self._listbox.select_set(0, tk.END)
        self._update_count()

    def _select_none(self):
        self._listbox.select_clear(0, tk.END)
        self._update_count()

    def _update_count(self):
        total = len(self._image_order)
        sel = len(self._listbox.curselection())
        if total == 0:
            self.count_var.set("No renders added.")
        elif sel == total:
            self.count_var.set(f"{total} render{'s' if total != 1 else ''} selected.")
        else:
            self.count_var.set(f"{sel} of {total} renders selected.")

    def _get_selected(self):
        return [self._image_order[i] for i in self._listbox.curselection()]

    # ── Preview rendering ────────────────────────────────────────────────────────
    def _show_original_preview(self, path):
        img = self._make_thumb(path)
        if img is not None:
            self._orig_preview = img
            self._orig_label.config(image=img, text="")

    def _show_result_preview_from_bytes(self, data):
        import io
        try:
            with Image.open(io.BytesIO(data)) as im:
                thumb = self._fit_thumb(im.copy())
            self._result_preview = ImageTk.PhotoImage(thumb)
            self._result_label.config(image=self._result_preview, text="")
        except Exception:
            self._result_label.config(image="", text="(could not preview)")

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
        folder = filedialog.askdirectory(title="Select Render Folder")
        if not folder:
            return
        images = self._collect_from_folder(folder)
        if images:
            self._add_images(images)
        else:
            messagebox.showwarning("No Images",
                                   "No images found in that folder.")

    def _browse_files(self):
        paths = filedialog.askopenfilenames(
            title="Select Renders",
            filetypes=[("Image files", "*.jpg *.jpeg *.png *.webp *.bmp"),
                       ("All files", "*.*")])
        if paths:
            self._add_images(list(paths))

    def _browse_output(self):
        folder = filedialog.askdirectory(title="Select Output Folder")
        if folder:
            self.output_var.set(folder)

    # ── Generation ──────────────────────────────────────────────────────────────
    def _generate(self):
        images = self._get_selected()
        api_key = self.api_var.get().strip()
        output_dir = self.output_var.get().strip()
        narrative = NARRATIVE_BY_KEY[self.narrative_var.get()]
        extra = self.extra_var.get().strip()

        if not HAS_REQUESTS:
            messagebox.showerror(
                "Missing dependency",
                "The 'requests' library is required. Install it with:\n\n"
                "pip install requests")
            return
        if not images:
            messagebox.showerror("Error", "Select at least one render to enhance.")
            return
        if not api_key:
            messagebox.showerror("Error", "Enter your Gemini API key.")
            return
        if not output_dir or not os.path.isdir(output_dir):
            messagebox.showerror("Error", "Choose a valid output folder.")
            return

        self._persist_config()
        prompt = narrative["prompt"]
        if extra:
            prompt = prompt + "\nAdditional direction: " + extra

        self.gen_btn.config(state="disabled")
        self.progress["value"] = 0
        self.status_var.set("Starting…")

        def run():
            total = len(images)
            done = 0
            saved_paths = []
            errors = []
            for path in images:
                name = os.path.basename(path)
                self.after(0, lambda n=name, d=done: self.status_var.set(
                    f"Enhancing {n} ({d + 1} of {total})…"))
                try:
                    data = enhance_image(api_key, prompt, path)
                    out_path = self._output_path(output_dir, path,
                                                 narrative["key"])
                    with open(out_path, 'wb') as f:
                        f.write(data)
                    saved_paths.append(out_path)
                    self.after(0, lambda d=data: self._show_result_preview_from_bytes(d))
                except GeminiError as e:
                    errors.append(f"{name}: {e}")
                except Exception as e:
                    errors.append(f"{name}: {e}")
                done += 1
                self.after(0, lambda d=done: self.progress.config(
                    value=d / total * 100))

            self.after(0, lambda: self._finish(saved_paths, errors, output_dir))

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

    def _finish(self, saved_paths, errors, output_dir):
        self.gen_btn.config(state="normal")
        if saved_paths:
            self.status_var.set(
                f"Done. Saved {len(saved_paths)} image(s) to {output_dir}")
            if self.open_after_var.get():
                try:
                    os.startfile(saved_paths[-1])  # noqa: Windows only
                except Exception:
                    pass
        else:
            self.status_var.set("No images were produced.")

        if errors and saved_paths:
            messagebox.showwarning(
                "Completed with some errors",
                f"Saved {len(saved_paths)} image(s).\n\n"
                "Some renders failed:\n" + "\n".join(errors[:8]))
        elif errors:
            messagebox.showerror(
                "Failed",
                "No images were produced:\n\n" + "\n".join(errors[:8]))
        else:
            messagebox.showinfo(
                "Done",
                f"Saved {len(saved_paths)} enhanced image(s) to:\n{output_dir}")


if __name__ == "__main__":
    app = App()
    app.mainloop()
