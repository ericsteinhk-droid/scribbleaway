#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Meeting Summary Generator – Launch script
# Usage:  ./run.sh
# ─────────────────────────────────────────────────────────────────

set -e

# ── Colour helpers ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERR]${NC}   $*"; }

echo
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Générateur de Résumé de Réunion                     ${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo

# ── Check env vars ────────────────────────────────────────────────
if [[ -z "${HF_TOKEN}" ]]; then
    error "HF_TOKEN n'est pas défini."
    echo
    echo "  Obtenez un token sur https://huggingface.co/settings/tokens"
    echo "  Acceptez les conditions :"
    echo "    • https://huggingface.co/pyannote/speaker-diarization-3.1"
    echo "    • https://huggingface.co/pyannote/segmentation-3.0"
    echo
    echo "  Puis : export HF_TOKEN=hf_xxxxxxxxxxxxxxxx"
    echo
    exit 1
fi

if [[ -z "${ANTHROPIC_API_KEY}" ]]; then
    error "ANTHROPIC_API_KEY n'est pas défini."
    echo
    echo "  Obtenez une clé sur https://console.anthropic.com"
    echo "  Puis : export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx"
    echo
    exit 1
fi

ok "Variables d'environnement détectées."

# ── Check ffmpeg ──────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
    error "ffmpeg n'est pas installé ou introuvable dans PATH."
    echo
    echo "  Ubuntu/Debian : sudo apt install ffmpeg"
    echo "  macOS (Brew)  : brew install ffmpeg"
    echo
    exit 1
fi
ok "ffmpeg trouvé : $(ffmpeg -version 2>&1 | head -1)"

# ── Install Python deps (if needed) ──────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! python3 -c "import flask" &>/dev/null; then
    info "Installation des dépendances Python…"
    pip3 install -r requirements.txt
else
    ok "Dépendances Python déjà installées."
fi

# ── Open browser ──────────────────────────────────────────────────
PORT=5050
HTML_FILE="$SCRIPT_DIR/index.html"

info "Ouverture de l'interface dans le navigateur…"
if command -v xdg-open &>/dev/null; then
    xdg-open "$HTML_FILE" &
elif command -v open &>/dev/null; then
    open "$HTML_FILE" &
else
    warn "Impossible d'ouvrir le navigateur automatiquement."
    echo "  Ouvrez manuellement : $HTML_FILE"
fi

# ── Start Flask server ────────────────────────────────────────────
echo
info "Démarrage du serveur Flask sur le port ${PORT}…"
echo -e "  Interface : ${CYAN}file://${HTML_FILE}${NC}"
echo -e "  API       : ${CYAN}http://localhost:${PORT}${NC}"
echo
python3 server.py
