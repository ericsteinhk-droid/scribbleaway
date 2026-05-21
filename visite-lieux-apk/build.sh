#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ANDROID_SDK=/usr/lib/android-sdk
ANDROID_JAR=$ANDROID_SDK/platforms/android-23/android.jar
BUILD_TOOLS=$ANDROID_SDK/build-tools/debian
PLATFORM=$ANDROID_SDK/platforms/android-23

GEN=$PROJECT_DIR/gen
BIN=$PROJECT_DIR/bin
CLASSES=$BIN/classes

KEYSTORE=$PROJECT_DIR/visite-lieux.keystore
APK_UNSIGNED=$BIN/visite-lieux-unsigned.apk
APK_ALIGNED=$BIN/visite-lieux-aligned.apk
APK_SIGNED=$PROJECT_DIR/visite-lieux.apk

echo "=== Nettoyage ==="
rm -rf "$GEN" "$BIN"
mkdir -p "$GEN" "$CLASSES"

echo "=== Génération de R.java ==="
aapt package -f -m \
  -J "$GEN" \
  -M "$PROJECT_DIR/AndroidManifest.xml" \
  -S "$PROJECT_DIR/res" \
  -I "$ANDROID_JAR"

echo "=== Compilation Java ==="
find "$PROJECT_DIR/src" -name "*.java" > /tmp/java_sources.txt
echo "$GEN/com/visiteLieux/R.java" >> /tmp/java_sources.txt

javac -source 1.8 -target 1.8 \
  -classpath "$ANDROID_JAR" \
  -d "$CLASSES" \
  @/tmp/java_sources.txt 2>&1 | grep -v "obsolete\|Xlint"

echo "=== Conversion DEX ==="
$BUILD_TOOLS/dx --dex \
  --output="$CLASSES/classes.dex" \
  "$CLASSES"

echo "=== Packaging des ressources ==="
aapt package -f \
  -M "$PROJECT_DIR/AndroidManifest.xml" \
  -S "$PROJECT_DIR/res" \
  -A "$PROJECT_DIR/assets" \
  -I "$ANDROID_JAR" \
  -F "$APK_UNSIGNED"

echo "=== Ajout des classes DEX dans l'APK ==="
cd "$CLASSES" && zip -j "$APK_UNSIGNED" classes.dex
cd "$PROJECT_DIR"

echo "=== Zipalign ==="
zipalign -f 4 "$APK_UNSIGNED" "$APK_ALIGNED"

echo "=== Génération du keystore (debug) ==="
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkey -v \
    -keystore "$KEYSTORE" \
    -alias visiteLieux \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android123 -keypass android123 \
    -dname "CN=Visite Lieux, OU=Dev, O=Dev, L=Montreal, S=QC, C=CA" 2>&1 | grep -E "Generating|Storing|Warning|aliasName" || true
fi

echo "=== Signature de l'APK ==="
apksigner sign \
  --ks "$KEYSTORE" \
  --ks-key-alias visiteLieux \
  --ks-pass pass:android123 \
  --key-pass pass:android123 \
  --out "$APK_SIGNED" \
  "$APK_ALIGNED"

echo ""
echo "✅ APK généré : $APK_SIGNED"
echo "   Taille : $(du -sh "$APK_SIGNED" | cut -f1)"
