# Enregistreur de réunion — Meeting Recorder

Android app for recording construction site meetings in Canadian French with automatic transcription, speaker diarization, and DOCX export.

## Features

- **Chunked recording** — splits long meetings (1–2 h) into 15-minute M4A segments automatically, staying within Whisper's upload limit
- **Faint audio cues** — short tones on start, pause, and stop (via `ToneGenerator`, no audio files required)
- **Whisper transcription** — each chunk is sent to OpenAI Whisper (`whisper-1`, language: `fr`) with a construction-specific terminology prompt
- **Speaker diarization** — GPT-4o analyzes the transcript and labels speakers by role (Gérant de projet, Architecte, Surintendant, etc.) or as Intervenant A/B/…
- **Structured summary** — GPT-4o produces a French summary with: résumé exécutif, points discutés (timestamped), décisions prises, actions à entreprendre, points en suspens
- **Preview before export** — full summary and transcript shown on-screen before DOCX generation
- **DOCX export** — single file combining summary + full diarized transcript, built without third-party libraries (raw ZIP+XML), shared via Android's standard share sheet

## Setup

### Requirements

- Android Studio Hedgehog or newer
- Android device or emulator, API 26+
- OpenAI API key with access to `whisper-1` and `gpt-4o`

### Getting started

1. Clone the repo and open `MeetingRecorder/` in Android Studio
2. Android Studio will sync Gradle automatically
3. Build and run on your device
4. On first launch, tap ⚙ **Paramètres** and enter your OpenAI API key
5. Adjust chunk duration (5–20 min) and expected speaker count

### Settings

| Setting | Default | Description |
|---|---|---|
| Clé API OpenAI | — | Required: `sk-…` key |
| Titre de réunion | Réunion de chantier | Prefix for auto-generated meeting titles |
| Durée des segments | 15 min | Each recording chunk sent to Whisper |
| Nombre d'intervenants | 4 | Hint for GPT-4o speaker diarization |

## Architecture

```
audio/
  ChunkedRecorder    — MediaRecorder wrapper; auto-rotates M4A files
  BeepPlayer         — ToneGenerator beeps at start/pause/stop

service/
  RecordingService   — Foreground service; owns recorder; exposes StateFlow

repository/
  TranscriptionRepository  — Whisper API per chunk (offset timestamps)
  MeetingRepository        — Orchestrates transcription → diarization → summary

diarization/
  DiarizationService — GPT-4o speaker labeling with construction lexicon

summary/
  SummaryService     — GPT-4o structured JSON summary in French

export/
  WordXmlWriter      — Generates word/document.xml body
  DocxBuilder        — Zips XML into a valid .docx
  DocxExporter       — Writes to files/exports/, returns FileProvider Uri

ui/
  RecordFragment     — Record/pause/stop controls + live timer
  PreviewFragment    — Scrollable preview of summary + transcript
  SettingsFragment   — API key + configuration
```

## Construction Lexicon

The app embeds the full project lexicon as Whisper prompt context and GPT-4o system prompt, covering:

- **Intervenants** — Architecte, Gérant de projet, Surintendant, Ingénieur structure/mécanique/électrique, Entrepreneur général, etc.
- **Matériaux** — béton, coffrage, maçonnerie, gypse laminé, colombage, linteau, fourrure, ignifuge, terracotta, gicleur, etc.
- **Acronymes** — DDC, DIR, QRT, NDLR, UdeM, POM, CVAC, CF, T&M, ATK, BX
- **Activités** — étaiement, coulée de béton, pose de gypse, filage électrique, vérification coupe-feu, etc.

## DOCX Output Structure

1. **Titre + date**
2. **Intervenants** (speakers identified in the meeting)
3. **Résumé exécutif** (3–5 paragraphs)
4. **Points discutés** (timestamped topics)
5. **Décisions prises**
6. **Actions à entreprendre** (with responsible party and deadline)
7. **Points en suspens**
8. **Transcription complète** (full speaker-labeled, timestamped transcript)

## Permissions

- `RECORD_AUDIO` — microphone access
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MICROPHONE` — background recording
- `POST_NOTIFICATIONS` (Android 13+) — recording notification
- `INTERNET` — Whisper + GPT-4o API calls
