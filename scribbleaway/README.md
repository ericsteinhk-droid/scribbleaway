# ScribbleAway

Remove construction-site clutter from a single architectural photo using
Google's Gemini image editing ("Nano Banana"). Windows desktop app (PySide6).

> **Build status:** Complete. Real `google-genai` integration plus a GitHub
> Actions workflow that builds the Windows `.exe`. Set `USE_STUB = True` in
> `app/core/gemini_client.py` to run the UI offline against a placeholder.

## Download the Windows .exe

The exe is built on a Windows runner by GitHub Actions
(`.github/workflows/build-scribbleaway.yml`). No API keys or secrets are used
in or baked into the build — you supply your Gemini key at runtime in Settings.

**From a build run (any push):**
1. Go to the repo's **Actions** tab.
2. Click the latest **"Build ScribbleAway (Windows exe)"** run.
3. Scroll to **Artifacts** at the bottom and download **`photoclean-windows`**.
4. Unzip it — inside is `photoclean.exe`. Double-click to run.

**From a Release (tagged builds):** push a tag like `v1.0.0` and the exe is
attached to a GitHub **Release**. Then go to the repo's **Releases** page and
download `photoclean.exe` from the latest release's **Assets**.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

> Windows SmartScreen may warn on first launch because the exe is unsigned —
> choose **More info → Run anyway**.

## Model & terms (verified against Google docs, July 2026)

- **Model:** `gemini-3-pro-image` (Nano Banana Pro). Set in
  `app/core/gemini_client.py:MODEL_ID` — swap to `gemini-2.5-flash-image` for a
  faster/cheaper option; same request shape.
- **SDK:** `google-genai`.
- **Pricing (2.5 Flash):** ~$0.039 per generated image; Pro is priced higher.
- **Watermark:** every output carries an invisible Google **SynthID** watermark.
- **Commercial use:** Google grants users ownership/commercial rights to outputs.

## Run from source

```bash
cd scribbleaway
python -m pip install -r requirements.txt
python -m app.main
```

## API key

Open **Settings** in the app and paste your Gemini API key (get one from
[Google AI Studio](https://aistudio.google.com)). It is stored in the OS
credential store (Windows Credential Manager) via `keyring`, with a per-user
JSON config-file fallback. It is **never** committed or bundled into the exe.

## Layout

```
app/main.py             entry point
app/ui/main_window.py   single-window UI
app/ui/settings_dialog.py   API key paste/status/clear
app/ui/beforeafter.py   draggable before/after slider
app/core/prompts.py     editable checkbox fragments + preservation clause
app/core/gemini_client.py   model call (stubbed in Stage 2)
app/core/keystore.py    keyring + file fallback
app/core/images.py      load / downscale / save
app/workers.py          background thread for the edit
```

Windows `.exe` build via GitHub Actions arrives in Stage 4.
