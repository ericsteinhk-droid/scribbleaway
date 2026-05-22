#!/usr/bin/env bash
# =============================================================================
# Rapports de Chantier — Script de configuration et déploiement
# =============================================================================
# Ce script vous guide pas à pas pour configurer et déployer l'application.
# Il vous sera demandé de coller vos clés API une par une.
# =============================================================================

set -e

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RED="\033[31m"
RESET="\033[0m"

header() {
  echo ""
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${CYAN}  $1${RESET}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
  echo ""
}

step() {
  echo -e "${BOLD}${GREEN}▶ $1${RESET}"
}

info() {
  echo -e "${YELLOW}  ℹ  $1${RESET}"
}

ask() {
  local prompt="$1"
  local varname="$2"
  local default="$3"
  echo -e "${BOLD}  → $prompt${RESET}"
  if [ -n "$default" ]; then
    echo -e "    (Appuyez sur Entrée pour utiliser : $default)"
  fi
  read -r value
  if [ -z "$value" ] && [ -n "$default" ]; then
    value="$default"
  fi
  eval "$varname='$value'"
}

ask_secret() {
  local prompt="$1"
  local varname="$2"
  echo -e "${BOLD}  → $prompt${RESET}"
  read -rs value
  echo ""
  eval "$varname='$value'"
}

pause() {
  echo ""
  echo -e "  Appuyez sur ${BOLD}Entrée${RESET} pour continuer…"
  read -r
}

clear

echo ""
echo -e "${BOLD}${CYAN}"
echo "  ██████╗  █████╗ ██████╗ ██████╗  ██████╗ ██████╗ ████████╗"
echo "  ██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝"
echo "  ██████╔╝███████║██████╔╝██████╔╝██║   ██║██████╔╝   ██║   "
echo "  ██╔══██╗██╔══██║██╔═══╝ ██╔═══╝ ██║   ██║██╔══██╗   ██║   "
echo "  ██║  ██║██║  ██║██║     ██║     ╚██████╔╝██║  ██║   ██║   "
echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   "
echo -e "${RESET}"
echo -e "${BOLD}  Rapports de Chantier — Configuration initiale${RESET}"
echo ""
echo "  Ce script va :"
echo "    1. Vérifier les outils nécessaires"
echo "    2. Vous guider pour créer vos clés API"
echo "    3. Configurer le fichier .env"
echo "    4. Construire et déployer l'application"
echo ""

pause

# =============================================================================
# ÉTAPE 1 — Vérification des outils
# =============================================================================
header "Étape 1 / 5 — Vérification des outils"

step "Vérification de Node.js…"
if ! command -v node &>/dev/null; then
  echo -e "${RED}  ✗ Node.js n'est pas installé.${RESET}"
  echo "    Téléchargez-le sur : https://nodejs.org (version 18 ou plus)"
  exit 1
fi
echo -e "  ${GREEN}✓ Node.js $(node --version)${RESET}"

step "Vérification de npm…"
echo -e "  ${GREEN}✓ npm $(npm --version)${RESET}"

step "Vérification de Firebase CLI…"
if ! command -v firebase &>/dev/null; then
  echo "  Firebase CLI non trouvé. Installation en cours…"
  npm install -g firebase-tools
  echo -e "  ${GREEN}✓ Firebase CLI installé${RESET}"
else
  echo -e "  ${GREEN}✓ Firebase CLI $(firebase --version | head -1)${RESET}"
fi

# =============================================================================
# ÉTAPE 2 — Firebase
# =============================================================================
header "Étape 2 / 5 — Configuration Firebase"

echo "  Firebase est la base de données et le système d'authentification"
echo "  de l'application. Vous avez besoin d'un compte Google gratuit."
echo ""
info "Ouvrez cette URL dans votre navigateur :"
echo ""
echo -e "    ${BOLD}https://console.firebase.google.com${RESET}"
echo ""
echo "  Puis suivez ces étapes :"
echo "    1. Cliquez sur 'Créer un projet' (ou 'Add project')"
echo "    2. Donnez un nom (ex: rapports-chantier-monentreprise)"
echo "    3. Désactivez Google Analytics (optionnel)"
echo "    4. Attendez la création, puis cliquez 'Continuer'"
echo ""
echo "  Une fois dans votre projet :"
echo "    5. Cliquez sur l'icône Web </> pour ajouter une app web"
echo "    6. Donnez un surnom (ex: app-web)"
echo "    7. Cochez 'Firebase Hosting'"
echo "    8. Cliquez 'Enregistrer l'application'"
echo "    9. Vous verrez une section firebaseConfig avec vos clés"
echo ""

pause

ask "Votre Firebase API Key (apiKey)" FB_API_KEY
ask "Votre Firebase Auth Domain (authDomain, ex: monprojet.firebaseapp.com)" FB_AUTH_DOMAIN
ask "Votre Firebase Project ID (projectId)" FB_PROJECT_ID
ask "Votre Firebase Storage Bucket (storageBucket, ex: monprojet.appspot.com)" FB_STORAGE_BUCKET
ask "Votre Firebase Messaging Sender ID (messagingSenderId)" FB_SENDER_ID
ask "Votre Firebase App ID (appId)" FB_APP_ID

echo ""
step "Activation des services Firebase nécessaires…"
echo ""
echo "  Dans la console Firebase, activez ces 3 services :"
echo ""
echo "  ${BOLD}Authentication :${RESET}"
echo "    Panneau gauche → Authentication → Sign-in method"
echo "    → Activer 'Email/Mot de passe'"
echo ""
echo "  ${BOLD}Firestore Database :${RESET}"
echo "    Panneau gauche → Firestore Database → Créer une base de données"
echo "    → Choisir 'Mode production' → Sélectionner une région proche"
echo ""
echo "  ${BOLD}Storage :${RESET}"
echo "    Panneau gauche → Storage → Commencer"
echo "    → Choisir 'Mode production'"
echo ""

pause

# Firestore security rules
echo "  ${BOLD}Règles de sécurité Firestore :${RESET}"
echo "    Firestore Database → Règles → Remplacez tout par :"
echo ""
cat << 'RULES'
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /users/{userId} {
          allow read, write: if request.auth != null
            && request.auth.uid == userId;
        }
        match /projects/{projectId} {
          allow read, write: if request.auth != null
            && request.auth.uid in resource.data.members;
          allow create: if request.auth != null;
        }
        match /projects/{projectId}/reports/{reportId} {
          allow read, write: if request.auth != null
            && request.auth.uid in get(
              /databases/$(database)/documents/projects/$(projectId)
            ).data.members;
        }
      }
    }
RULES
echo ""
echo "  ${BOLD}Règles de sécurité Storage :${RESET}"
echo "    Storage → Règles → Remplacez tout par :"
echo ""
cat << 'RULES'
    rules_version = '2';
    service firebase.storage {
      match /b/{bucket}/o {
        match /photos/{userId}/{allPaths=**} {
          allow read, write: if request.auth != null
            && request.auth.uid == userId;
        }
      }
    }
RULES
echo ""

pause

# =============================================================================
# ÉTAPE 3 — Clés API IA
# =============================================================================
header "Étape 3 / 5 — Clés API (IA & voix)"

echo "  ${BOLD}Clé Anthropic Claude (reformatage de texte) :${RESET}"
echo "    1. Allez sur : https://console.anthropic.com"
echo "    2. Créez un compte (ou connectez-vous)"
echo "    3. Allez dans 'API Keys' → 'Create Key'"
echo "    4. Copiez la clé (commence par 'sk-ant-…')"
echo ""
ask_secret "Clé API Anthropic (sk-ant-…)" ANTHROPIC_KEY

echo ""
echo "  ${BOLD}Clé OpenAI Whisper (transcription vocale de secours) :${RESET}"
echo "    Si la dictée vocale ne fonctionne pas sur un navigateur,"
echo "    l'app utilisera Whisper comme solution de secours."
echo "    1. Allez sur : https://platform.openai.com/api-keys"
echo "    2. Cliquez 'Create new secret key'"
echo "    3. Copiez la clé (commence par 'sk-…')"
echo ""
info "Vous pouvez laisser vide pour l'instant et remplir plus tard dans .env"
ask_secret "Clé API OpenAI (sk-… ou laisser vide)" OPENAI_KEY

# =============================================================================
# ÉTAPE 4 — Création du fichier .env
# =============================================================================
header "Étape 4 / 5 — Création du fichier de configuration"

step "Écriture du fichier .env…"

cat > .env << EOF
# Firebase Configuration
VITE_FIREBASE_API_KEY=${FB_API_KEY}
VITE_FIREBASE_AUTH_DOMAIN=${FB_AUTH_DOMAIN}
VITE_FIREBASE_PROJECT_ID=${FB_PROJECT_ID}
VITE_FIREBASE_STORAGE_BUCKET=${FB_STORAGE_BUCKET}
VITE_FIREBASE_MESSAGING_SENDER_ID=${FB_SENDER_ID}
VITE_FIREBASE_APP_ID=${FB_APP_ID}

# Anthropic Claude API
VITE_ANTHROPIC_API_KEY=${ANTHROPIC_KEY}

# OpenAI Whisper API (optionnel)
VITE_OPENAI_API_KEY=${OPENAI_KEY}
EOF

echo -e "  ${GREEN}✓ Fichier .env créé${RESET}"

# Mise à jour du .firebaserc
cat > .firebaserc << EOF
{
  "projects": {
    "default": "${FB_PROJECT_ID}"
  }
}
EOF
echo -e "  ${GREEN}✓ Fichier .firebaserc créé${RESET}"

# =============================================================================
# ÉTAPE 5 — Build et déploiement
# =============================================================================
header "Étape 5 / 5 — Construction et déploiement"

step "Installation des dépendances npm…"
npm install

step "Construction de l'application…"
npm run build

echo -e "  ${GREEN}✓ Application construite dans le dossier dist/${RESET}"

step "Connexion à Firebase…"
firebase login

step "Déploiement sur Firebase Hosting…"
firebase deploy --only hosting

echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   ✓  Déploiement réussi !                ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"
echo ""
echo -e "  ${BOLD}Votre application est accessible à :${RESET}"
echo -e "  ${CYAN}  https://${FB_PROJECT_ID}.web.app${RESET}"
echo ""
echo "  Pour mettre à jour l'application après des modifications :"
echo -e "  ${BOLD}    npm run build && firebase deploy --only hosting${RESET}"
echo ""
echo "  Pour installer l'app sur votre téléphone :"
echo "    iOS  : Ouvrir dans Safari → Partager → Sur l'écran d'accueil"
echo "    Android : Ouvrir dans Chrome → menu ⋮ → Installer l'application"
echo ""
