# Transcripteur vocal

Application Android (APK) de **transcription vocale haute qualité en français canadien**. Elle enregistre (ou importe) un audio, le transcrit via l'API de transcription d'OpenAI (`gpt-4o-transcribe`), puis génère un fichier texte que vous pouvez corriger et enregistrer sur l'appareil.

## Architecture

- **Web** : Vite + JavaScript (aucun framework), empaqueté dans un WebView via **Capacitor**.
- **Moteur STT** : API OpenAI `POST /v1/audio/transcriptions`, `language=fr` + amorce orientée français québécois pour l'orthographe et la ponctuation.
- **Sortie** : fichier `.txt` écrit dans `Documents/` (plugin Capacitor Filesystem) avec partage; repli téléchargement navigateur en mode web.

## Fonctions

- Enregistrement avec minuterie et vumètre (mono, réduction de bruit, gain auto)
- Import d'un fichier audio existant
- Choix du modèle : `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` ou `whisper-1`
- Amorce/contexte personnalisable (noms propres, jargon, régionalismes)
- Transcription éditable, copie presse-papiers, export `.txt`
- Clé API stockée **localement** sur l'appareil (jamais commitée)

## Développement local

```bash
cd transcripteur-vocal
npm install
npm run dev      # http://localhost:5173 (nécessite HTTPS/localhost pour le micro)
npm run build    # génère dist/
```

Entrez votre clé API OpenAI dans l'écran ⚙️ Réglages.

## Compiler l'APK

L'APK se compile automatiquement via GitHub Actions : `.github/workflows/build-transcripteur-apk.yml`.

- Déclenché à chaque `push` touchant `transcripteur-vocal/**`, ou manuellement (« Run workflow »).
- L'APK debug est publié comme *artifact* et comme *release* GitHub.
- Facultatif : définir le secret `VITE_OPENAI_API_KEY` pour préconfigurer une clé (sinon chaque utilisateur saisit la sienne dans l'app).

## Notes

- Limite OpenAI : 25 Mo par fichier audio (le format Opus/WebM permet de longs enregistrements dans cette limite).
- Build **debug** (non signé pour le Play Store). Pour la production, ajoutez un keystore et utilisez `assembleRelease`.
