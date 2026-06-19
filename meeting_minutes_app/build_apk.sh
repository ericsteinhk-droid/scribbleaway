#!/usr/bin/env bash
# Quick build script for ScribbleAway APK
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== ScribbleAway APK Builder ==="

# Check Flutter
if ! command -v flutter &>/dev/null; then
  echo "ERROR: Flutter not found. Install from https://docs.flutter.dev/get-started/install"
  exit 1
fi

flutter --version

# Check local.properties
if [ ! -f android/local.properties ]; then
  echo "ERROR: android/local.properties not found."
  echo "Create it with:"
  echo "  sdk.dir=/path/to/Android/Sdk"
  echo "  flutter.sdk=/path/to/flutter"
  echo "  flutter.versionName=1.0.0"
  echo "  flutter.versionCode=1"
  exit 1
fi

# Download gradle wrapper if missing
if [ ! -f android/gradle/wrapper/gradle-wrapper.jar ]; then
  echo ">>> Downloading Gradle wrapper..."
  (cd android && gradle wrapper --gradle-version 8.3)
fi

# Get Flutter packages
echo ">>> flutter pub get..."
flutter pub get

# Build release APK
echo ">>> Building release APK..."
flutter build apk --release --target-platform android-arm64

APK="build/app/outputs/flutter-apk/app-release.apk"
if [ -f "$APK" ]; then
  SIZE=$(du -sh "$APK" | cut -f1)
  echo ""
  echo "=== SUCCESS ==="
  echo "APK: $SCRIPT_DIR/$APK"
  echo "Size: $SIZE"
  echo ""
  echo "Install with: adb install $APK"
else
  echo "ERROR: APK not found. Check build output above."
  exit 1
fi
