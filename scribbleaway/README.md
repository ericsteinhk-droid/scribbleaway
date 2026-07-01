# ScribbleAway

Remove construction-site clutter from a single architectural photo using
Google's Gemini image editing ("Nano Banana"). Windows desktop app (PySide6).

> **Build status:** Stage 2 — full GUI with a **stubbed** Gemini call. The
> "Remove clutter" action currently returns a placeholder preview (a desaturated
> copy with a red banner) so the whole flow works without an API key. Stage 3
> wires in the real `google-genai` call.

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
