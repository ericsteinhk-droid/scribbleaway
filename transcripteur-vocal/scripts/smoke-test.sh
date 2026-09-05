#!/usr/bin/env bash
# Test de démarrage sur émulateur : installe l'APK, lance l'activité et échoue
# si le processus est mort ou si logcat contient une exception fatale.
#
# Ce test vit dans un fichier et non dans le champ « script » du workflow :
# android-emulator-runner exécute chaque ligne de ce champ dans un shell
# distinct, ce qui coupe tout bloc if/then/fi et toute variable partagée.
set -u

# Chemin de l'APK en argument : debug ou release selon la présence du keystore.
APK=${1:-transcripteur-vocal/android/app/build/outputs/apk/debug/app-debug.apk}
PKG=com.evoq.transcripteur

adb install -r "$APK"
adb logcat -c
adb shell am start -n "$PKG/.MainActivity"
sleep 15

fatal=$(adb logcat -d | grep -c "FATAL EXCEPTION" || true)
pid=$(adb shell pidof "$PKG" 2>/dev/null | tr -d '\r\n')

if [ -z "$pid" ] || [ "$fatal" -ne 0 ]; then
  echo "ÉCHEC : l'application n'a pas démarré (PID « $pid », exceptions fatales : $fatal)."
  echo "──────── logcat ────────"
  adb logcat -d | grep -iE "AndroidRuntime|FATAL|$PKG|Capacitor|chromium" | head -80 || true
  exit 1
fi

echo "OK : $PKG tourne (PID $pid), aucune exception fatale."

# Diagnostic non bloquant : une erreur console signalerait un écran blanc
# (bundle non chargé) même si le processus natif, lui, tourne.
console=$(adb logcat -d | grep -iE "Capacitor/Console|Uncaught|net::ERR_" | head -20 || true)
if [ -n "$console" ]; then
  echo "Avertissement — messages console du WebView :"
  echo "$console"
fi

exit 0
