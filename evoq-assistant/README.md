# EVOQ Assistant IA

Application de chat multi-modèles auto-hébergée pour EVOQ Architecture.  
Fournisseurs pris en charge : **Claude (Anthropic)**, **GPT (OpenAI)**, **Gemini (Google)**.

---

## Installation rapide

### Prérequis
- Node.js 20+ (ou Docker)
- Clés API : Anthropic, OpenAI, Google AI Studio

### 1. Cloner le dépôt et configurer

```bash
cd evoq-assistant
cp .env.example .env
# Éditez .env et ajoutez vos clés API
```

### 2. Télécharger les polices Open Sans (obligatoire — licence Apache 2.0)

```bash
# Créez le répertoire
mkdir -p frontend/public/fonts

# Téléchargez depuis Google Fonts (ou depuis fonts.google.com)
# Placez ces fichiers dans frontend/public/fonts/ :
#   OpenSans-Regular.woff2
#   OpenSans-Italic.woff2
#   OpenSans-SemiBold.woff2
#   OpenSans-Bold.woff2
#
# Source : https://fonts.google.com/specimen/Open+Sans
# Licence : Apache 2.0 — https://fonts.google.com/attribution
```

### 3. Démarrer avec npm

```bash
# Terminal 1 — Backend
cd backend
npm install
npm start

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

Ouvrez http://localhost:5173

### 4. Build de production

```bash
cd frontend && npm run build   # → ../backend/public/
cd ../backend && npm start
# Ouvrez http://localhost:3001
```

### 5. Docker Compose

```bash
cp .env.example .env
# Éditez .env
docker-compose up -d
# Ouvrez http://localhost (frontend) + http://localhost:3001 (API)
```

---

## Fichier .env

| Variable | Description | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic | — |
| `OPENAI_API_KEY` | Clé API OpenAI | — |
| `GOOGLE_API_KEY` | Clé Google AI Studio | — |
| `PORT` | Port du backend | `3001` |
| `HOST` | Hôte d'écoute | `localhost` |
| `APP_PASSWORD` | Mot de passe optionnel (laissez vide pour désactiver) | — |
| `DB_PATH` | Chemin de la base SQLite | `./data/evoq-assistant.db` |
| `MAX_FILE_SIZE` | Taille maximale pièces jointes en octets | `10485760` |
| `SESSION_TIMEOUT_MINUTES` | Délai inactivité en minutes (0 = désactivé) | `0` |
| `CONVERSATION_TTL_DAYS` | Expiration auto des conversations (0 = désactivé) | `0` |
| `CORS_ORIGINS` | Origines CORS autorisées | `http://localhost:5173` |

---

## Identifiants de modèles

Les identifiants par défaut sont définis dans les fichiers de configuration — ils sont modifiables dans l'interface (Paramètres → Modèles) sans redémarrer.

| Fournisseur | Défaut | Où vérifier les identifiants à jour |
|---|---|---|
| Anthropic (Claude) | `claude-opus-4-5-20251101` | https://docs.anthropic.com/fr/docs/about-claude/models |
| OpenAI (GPT) | `gpt-4o` | https://platform.openai.com/docs/models |
| Google (Gemini) | `gemini-2.5-flash-preview-05-20` | https://ai.google.dev/gemini-api/docs/models/gemini |

> **Important** : les identifiants de modèles évoluent fréquemment. Vérifiez la documentation du fournisseur lors de toute mise à jour.

---

## Section confidentialité

### Ce qui reste sur votre machine

- **Conversations** : stockées dans `./data/evoq-assistant.db` (SQLite local)
- **Clés API** : uniquement dans le fichier `.env` côté serveur, jamais transmises au navigateur
- **Journal d'audit** : enregistre uniquement horodatage, fournisseur et comptage de tokens — **jamais le contenu des messages**
- **Polices** : embarquées localement (Apache 2.0)
- **Aucune dépendance CDN** : toutes les bibliothèques sont installées via npm
- **Aucune télémétrie** : aucun appel réseau autre que les trois API des fournisseurs

### Ce qui est transmis aux fournisseurs

Lors de chaque requête, les éléments suivants sont envoyés à l'API du fournisseur sélectionné :

- Le contenu de votre message et les messages précédents (selon la fenêtre de contexte)
- Le prompt système de la conversation
- Les pièces jointes (images, PDF, fichiers texte)
- Les paramètres de génération (température, max tokens)

### Politiques de rétention des fournisseurs

> ⚠️ **Ces informations sont données à titre indicatif** et doivent être vérifiées directement auprès des fournisseurs, car leurs politiques évoluent.

**Anthropic (Claude)**  
Les données envoyées via l'API ne sont pas utilisées pour entraîner les modèles par défaut.  
Anthropic peut conserver les données jusqu'à 30 jours à des fins de sécurité et d'amélioration des services.  
Pour les clients Enterprise, des options de rétention zéro sont disponibles.  
→ https://www.anthropic.com/legal/privacy

**OpenAI (GPT)**  
Les données API ne sont pas utilisées pour l'entraînement par défaut (depuis mars 2023).  
Les données peuvent être conservées jusqu'à 30 jours pour la détection d'abus.  
Des options de rétention zéro sont disponibles avec accord écrit.  
→ https://platform.openai.com/docs/guides/your-data

**Google (Gemini)**  
Les données API Gemini ne sont pas utilisées pour entraîner les modèles par défaut.  
La rétention varie selon le produit et la région.  
→ https://ai.google.dev/gemini-api/terms (section Data use)

### Recommandations pour minimiser l'exposition

1. **Mode éphémère** : activez-le (icône ⚡ dans la barre latérale) pour les conversations sensibles — aucune donnée n'est écrite en base
2. **Expiration automatique** : configurez `CONVERSATION_TTL_DAYS` pour une suppression automatique
3. **Purge manuelle** : bouton « Purger tout » dans la barre latérale
4. **Contexte minimal** : utilisez la stratégie « Garder N derniers messages » pour limiter ce qui est envoyé à chaque requête
5. **Rotation des clés** : mettez à jour les clés API régulièrement (Paramètres → Sécurité → Recharger .env)

### Déploiement HTTPS (réseau interne recommandé)

Pour un déploiement sur réseau interne avec HTTPS, utilisez nginx en reverse proxy :

```nginx
server {
    listen 443 ssl;
    server_name assistant.evoq.interne;

    ssl_certificate     /etc/ssl/certs/evoq.crt;
    ssl_certificate_key /etc/ssl/private/evoq.key;

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_buffering off;  # Requis pour le streaming SSE
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass http://localhost:3001;
    }
}

server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

Pour un certificat auto-signé sur réseau interne : `openssl req -x509 -newkey rsa:4096 -keyout evoq.key -out evoq.crt -days 365 -nodes`

---

## Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Entrée` | Envoyer le message |
| `Maj + Entrée` | Saut de ligne |
| `Ctrl + K` | Nouvelle conversation |
| `Échap` | Interrompre la génération / fermer un modal |

---

## Ajouter un fournisseur futur

1. Créer `backend/src/providers/nouveaufournisseur.js` en exportant `streamChat(params, onChunk, onDone, onError, signal)`
2. L'importer et l'ajouter à l'objet `PROVIDERS` dans `backend/src/routes/chat.js`
3. Ajouter les clés nécessaires dans `.env.example` et `.env`
4. Ajouter le bouton de routage dans `frontend/src/components/chat/ModelSelector.jsx`

---

## Structure du projet

```
evoq-assistant/
├── backend/          Node.js + Express + SQLite
│   ├── src/
│   │   ├── providers/    Anthropic, OpenAI, Gemini
│   │   ├── routes/       Chat, conversations, export, admin…
│   │   ├── db/           SQLite + schema
│   │   └── middleware/   Sécurité, authentification
│   └── Dockerfile
├── frontend/         React + Vite
│   ├── src/
│   │   ├── components/   Layout, chat, modals…
│   │   ├── hooks/        useChat, useConversations…
│   │   ├── store/        Zustand
│   │   └── styles/       CSS global + polices
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

EVOQ Architecture · Assistant IA · Usage interne exclusivement
