# ScribbleAway — Canadian French audio transcriber

An offline Android app that transcribes audio files to text with **OpenAI Whisper
(base multilingual)** running fully **on-device** via [whisper.cpp](https://github.com/ggml-org/whisper.cpp).
Tuned for **Canadian French**: the decoder is forced to French (`language = "fr"`,
no translation) and uses **beam search** for higher accuracy.

Everything runs locally — no internet, no accounts, nothing leaves the phone.

## Features

- Pick any audio file (mp3, m4a/aac, wav, ogg/opus, flac…) or *Share to ScribbleAway* from another app.
- On-device transcription with the Whisper **base** model, forced to French.
- Optional per-segment timestamps.
- Copy / share the transcript.
- ARM (`arm64-v8a`, `armeabi-v7a`) with fp16 acceleration on capable CPUs.

## How it works

| Layer | Where |
|-------|-------|
| UI (View-based, Material 3) | `app/src/main/java/ca/scribbleaway/transcriber/MainActivity.kt` |
| State machine | `TranscriberViewModel.kt` |
| Audio decode → 16 kHz mono float PCM | `AudioDecoder.kt` (platform `MediaExtractor`/`MediaCodec`) |
| Kotlin ↔ native bridge | `lib/src/main/java/com/whispercpp/whisper/LibWhisper.kt` |
| JNI + Whisper params (French, beam search) | `lib/src/main/jni/whisper/jni.c` |
| Native build | `lib/src/main/jni/whisper/CMakeLists.txt` (compiles `whisper.cpp`) |

The Whisper model and the `whisper.cpp` sources are **not committed** — they are
pulled in by `scripts/fetch-deps.sh` and bundled at build time.

## Build locally

Requirements: Android SDK, **NDK 26.1.10909125**, **CMake 3.22.1**, JDK 17.

```bash
cd android
bash scripts/fetch-deps.sh          # clones whisper.cpp + downloads ggml-base.bin
./gradlew :app:assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

The release APK is signed with the debug key so it installs directly when
sideloaded. Swap in a real keystore for Play Store distribution.

## Build in CI / get the APK

Pushing to the feature branch (or running the workflow manually) triggers
[`.github/workflows/build-scribbleaway-apk.yml`](../.github/workflows/build-scribbleaway-apk.yml),
which builds the APK on a GitHub runner and publishes it both as a workflow
**artifact** and as a **GitHub Release** you can download and install.

## Accuracy notes

- `base` is the best size/accuracy trade-off that stays comfortably on-device.
  To go higher, change `MODEL_NAME` in `scripts/fetch-deps.sh` to `ggml-small.bin`
  (bigger, slower, more accurate) — no code changes needed.
- Beam search (width 5) plus temperature fallback is enabled in `jni.c` to
  reduce word errors and suppress repetition/hallucination on silence or noise.
