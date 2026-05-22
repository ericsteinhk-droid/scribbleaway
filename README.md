# Rapports de Chantier

Progressive Web App (PWA) for architects to write and manage field reports ("rapports de chantier"), optimized for Android and iOS tablets and phones.

## Features

- **Authentication** — Firebase Auth (email + password)
- **Projects** — Create and manage multiple projects with shared team access
- **Reports** — Numbered, chronological site visit reports per project
- **Entries** — Four types: Observation, Avancement des travaux, Discussion, Directive
- **Voice input** — Web Speech API (primary) + OpenAI Whisper (fallback)
- **AI reformatting** — Claude claude-sonnet-4-20250514 reformats transcribed or typed text into professional architectural French
- **Photos** — Camera/gallery capture, auto-compressed, inline per entry with captions
- **PDF export** — Letter format via @react-pdf/renderer
- **Word export** — .docx via docx.js
- **Share** — Web Share API (iOS Share Sheet / Android Sharesheet) with download fallback
- **Offline-first** — Firestore offline persistence + Service Worker (Workbox)
- **Sync indicator** — Live status: Synchronisé / En cours / Hors ligne
- **Dark/light mode** — Automatic + manual toggle

## Tech Stack

- React + Vite 8
- Tailwind CSS 3
- Firebase (Auth, Firestore, Storage)
- Workbox (via vite-plugin-pwa)
- @react-pdf/renderer
- docx.js
- Anthropic Claude API
- OpenAI Whisper API

## Setup

### 1. Firebase Project

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → Email/Password
3. Enable **Firestore Database** (start in production mode)
4. Enable **Storage**
5. Copy your web app configuration

### 2. API Keys

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ANTHROPIC_API_KEY=...   # https://console.anthropic.com
VITE_OPENAI_API_KEY=...      # Only needed if Web Speech API unavailable
```

### 3. Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /projects/{projectId} {
      allow read, write: if request.auth != null
        && request.auth.uid in resource.data.members;
      allow create: if request.auth != null;
    }
    match /projects/{projectId}/reports/{reportId} {
      allow read, write: if request.auth != null
        && request.auth.uid in get(/databases/$(database)/documents/projects/$(projectId)).data.members;
    }
  }
}
```

### 4. Storage Security Rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /photos/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 5. Run locally

```bash
npm install
npm run dev
```

### 6. Build & deploy

```bash
npm run build
# Deploy dist/ to Firebase Hosting, Vercel, Netlify, etc.
```

## PWA Installation

On mobile: open in browser → "Add to Home Screen" (iOS) or install banner (Android).

## Notes

- API keys are exposed to the browser (Anthropic, OpenAI). For production, proxy these through a backend function to avoid key leakage.
- The `VITE_ANTHROPIC_API_KEY` call uses `anthropic-dangerous-direct-browser-access: true` header — acceptable for internal/enterprise tools; use a proxy for public apps.
