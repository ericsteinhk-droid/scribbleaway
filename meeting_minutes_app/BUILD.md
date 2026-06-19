# ScribbleAway — Build Instructions

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Flutter SDK | ≥ 3.16 | https://docs.flutter.dev/get-started/install/linux |
| Android Studio | 2023+ | https://developer.android.com/studio |
| Android SDK | API 34 (compileSdk) | via Android Studio → SDK Manager |
| Java JDK | 17 or 21 | included with Android Studio |

---

## 1 — Install Flutter (Linux / macOS / Windows)

### Linux
```bash
cd ~
wget https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.24.5-stable.tar.xz
tar xf flutter_linux_3.24.5-stable.tar.xz
export PATH="$HOME/flutter/bin:$PATH"
flutter doctor
```

### macOS
```bash
brew install --cask flutter
```

---

## 2 — Set up Android SDK

1. Open Android Studio → SDK Manager
2. Install:
   - Android 14 (API 34)
   - Android SDK Build-Tools 34
   - NDK 25.1.8937393
3. Note your SDK path (shown in SDK Manager title bar)

---

## 3 — Configure local.properties

Create `meeting_minutes_app/android/local.properties`:

```properties
sdk.dir=/home/YOUR_USERNAME/Android/Sdk
flutter.sdk=/home/YOUR_USERNAME/flutter
flutter.buildMode=release
flutter.versionName=1.0.0
flutter.versionCode=1
```

---

## 4 — Get dependencies & build

```bash
cd meeting_minutes_app

# Download the gradle wrapper (required once)
cd android && gradle wrapper && cd ..

# Install Flutter packages
flutter pub get

# Build release APK
flutter build apk --release

# The APK is at:
# build/app/outputs/flutter-apk/app-release.apk
```

---

## 5 — Install on device

```bash
# Enable USB debugging on your Android device, then:
flutter install
# or
adb install build/app/outputs/flutter-apk/app-release.apk
```

---

## Quick debug build (faster, no signing required)

```bash
flutter run   # runs on connected device / emulator
# or
flutter build apk --debug
```

---

## First launch

On first launch you'll be prompted for:
1. **OpenAI API key** — for Whisper transcription  
   → https://platform.openai.com/api-keys
2. **Anthropic API key** — for Claude meeting minutes  
   → https://console.anthropic.com/settings/keys

Keys are stored encrypted on-device using Android EncryptedSharedPreferences.

---

## Supported audio formats

MP3, M4A, WAV, MP4, WebM, OGG, FLAC (max 25 MB per file — Whisper API limit)

For longer recordings, split with ffmpeg:
```bash
ffmpeg -i recording.mp3 -f segment -segment_time 300 -c copy part%03d.mp3
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `flutter: not found` | Add Flutter bin to PATH |
| `sdk.dir` missing | Create `android/local.properties` (step 3) |
| Build fails on gradle | Run `cd android && gradle wrapper` first |
| `minSdkVersion` error | Device must run Android 6+ (API 23+) |
| File too large error | Split audio into <25 MB chunks |
