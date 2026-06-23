# Transcripteur de Réunion

Application Android haute précision pour l'enregistrement, la transcription en temps réel et la génération de comptes rendus de réunions en **français canadien**.

## Fonctionnalités

| Fonctionnalité | Détails |
|---|---|
| **Enregistrement audio** | Service de premier plan, AAC 128 kbps / 44.1 kHz, jusqu'à 3 heures |
| **Transcription en temps réel** | Android SpeechRecognizer, locale `fr-CA`, redémarrage continu automatique |
| **Pause / Reprise** | Suspend l'enregistrement et la transcription, reprend sans perte |
| **Compte rendu IA** | Génération via Claude (claude-sonnet-4-6), structuré en Markdown |
| **Contexte de réunion** | Importation d'un fichier `.txt` (ordre du jour, contexte) |
| **Sauvegarde & partage** | Transcription `.txt` + compte rendu `.md` via FileProvider |
| **Historique** | Stockage local Room, liste de toutes les réunions passées |

## Cas d'usage cible

- **Durée** : 45 minutes à 2 heures
- **Participants** : 6 à 12 personnes
- **Langue** : Français canadien (`fr-CA`)

## Configuration

1. Copiez `local.properties.example` → `local.properties` et renseignez `sdk.dir`
2. Ouvrez dans Android Studio (Hedgehog ou plus récent) ou compilez avec `./gradlew assembleDebug`
3. Lancez l'app et allez dans **Paramètres** pour saisir votre clé API Claude

### Clé API Claude — deux options

| Option | Quand l'utiliser |
|---|---|
| **In-app** (onglet Paramètres) | Recommandé — stockée dans DataStore chiffré sur l'appareil, aucune recompilation nécessaire |
| **Compile-time** (`local.properties`) | CI/CD ou builds de distribution — `CLAUDE_API_KEY=sk-ant-...` |

La clé saisie dans l'app a la priorité sur celle de `local.properties`.
Sans clé, l'enregistrement et la transcription fonctionnent ; seule la génération de comptes rendus est désactivée.

Créez votre clé sur [console.anthropic.com](https://console.anthropic.com/).

## Architecture

```
app/src/main/java/com/scribbleaway/meetingrecorder/
├── MainActivity.kt                     # Navigation Compose, gestion permissions
├── MeetingRecorderApp.kt               # Application, canaux notification
├── data/
│   └── MeetingDatabase.kt              # Room DB — entités + DAO
├── service/
│   └── RecordingService.kt             # Service premier plan, MediaRecorder
├── transcription/
│   └── TranscriptionManager.kt         # SpeechRecognizer continu fr-CA
├── minutes/
│   └── MinutesGenerator.kt             # Appel API Claude pour compte rendu
├── viewmodel/
│   └── MeetingViewModel.kt             # État UI, orchestration
└── ui/
    ├── theme/Theme.kt                  # Material3, couleurs rouge enregistrement
    └── screens/
        ├── HomeScreen.kt               # Config participants, import contexte
        ├── RecordingScreen.kt          # Transcription en direct, chronomètre
        ├── CompletionScreen.kt         # Sauvegarde + génération compte rendu
        ├── MinutesScreen.kt            # Rendu Markdown du compte rendu
        └── HistoryScreen.kt            # Liste des réunions passées
```

## Permissions requises

| Permission | Raison |
|---|---|
| `RECORD_AUDIO` | Enregistrement et transcription |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MICROPHONE` | Service actif en arrière-plan |
| `WAKE_LOCK` | Empêche la mise en veille durant l'enregistrement |
| `POST_NOTIFICATIONS` | Notification de service (Android 13+) |
| `INTERNET` | API Claude pour compte rendu |

## Flux utilisateur

```
Accueil → (config participants, import contexte) → Enregistrement
    → Transcription en temps réel → Fin de réunion
    → [Sauvegarder transcription .txt] [Générer compte rendu IA]
    → Compte rendu Markdown (voir / partager / sauvegarder)
```
