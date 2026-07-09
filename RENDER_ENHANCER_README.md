# EVOQ Render Enhancer

A small Windows desktop app that turns architectural renders (e.g. Enscape
output) into **hyper-photorealistic presentation images** to help get a design
approved by a client. It uses Google's Gemini **"Nano Banana"** image model
(`gemini-2.5-flash-image`) for image-to-image enhancement, keeping the original
viewpoint, geometry and proportions while re-lighting and re-texturing the scene.

## The four narrative styles

Tick **one or more** styles per run — each ticked style produces its own image
for every selected render (use **All 4** to generate the full comparison set in
one click, ideal for presenting options to a client). Each prompt enforces
strict adherence to the base render's geometry and keeps human figures small and
in the mid/background only.

1. **Golden Hour** — high-contrast low-angle morning sun, long shadows, tactile
   masonry, warm specular metal.
2. **Soft Diffuse Overcast** — even overcast light, perfect material definition,
   subtle texture, accurate colour, matte metal.
3. **Blue Hour Twilight** — deep twilight sky with warm interiors glowing from
   every window, luminous contrast and depth.
4. **Post-Rain Dramatic** — breaking storm light on wet, reflective surfaces,
   damp masonry, sharp ground reflections.

You can add free-text **Extra instructions** that are appended to the chosen
narrative for any run.

## Getting a Gemini API key

1. Go to Google AI Studio → **Get API key**.
2. Paste it into the app's *Gemini API Key* field. Tick *Remember key* to store
   it locally (in `~/.evoq_render_enhancer.json`); untick to keep it in memory
   only for the session.

## Using the app

1. Add one or more renders (drag-and-drop, **Add Files…**, or **Add Folder…**).
   Supported: JPG, PNG, WEBP, BMP.
2. Select the renders you want to enhance in the list.
3. Tick one or more narrative styles (or **All 4**).
4. Choose an output folder.
5. Click **Enhance Render(s)**. Use **Cancel** to stop a batch mid-run.

Each result is saved as `<originalname>_<style>.png` in the output folder, and
the latest result is previewed in the window. Click either preview image to open
it full-size in your default viewer. Large renders are automatically downscaled
to 2048 px on the long edge before upload.

Transient API errors (rate limits, server hiccups, network blips) are retried
automatically with exponential backoff, so a single glitch won't fail a whole
batch.

## Building the Windows .exe

Requires Python 3.11+ on Windows.

```bat
pip install -r requirements.txt
build_render_enhancer.bat
```

The single-file executable is produced at `dist\RenderEnhancer.exe`.
Equivalent explicit command (uses the committed spec):

```bat
pyinstaller render_enhancer.spec
```

### No Windows machine? Let GitHub build it

A GitHub Actions workflow (`.github/workflows/build-render-enhancer.yml`) builds
`RenderEnhancer.exe` on a Windows runner automatically on every push to the
feature branch (and via **Run workflow** on the Actions tab). Download the built
exe from the run's **Artifacts** section — no local Windows/Python setup needed.

## Running from source (any platform with a display)

```sh
pip install Pillow requests certifi tkinterdnd2
python render_enhancer.py
```

`tkinterdnd2` is optional — without it the app still works, just without
drag-and-drop.

## Notes

- The Gemini image model outputs roughly ~1K–2K resolution; the "8k" wording in
  the prompts is a stylistic cue to the model, not a literal output size.
- If a request is safety-blocked or returns text instead of an image, the app
  reports the reason per file and continues with the rest of the batch.
