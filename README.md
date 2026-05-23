# Rapports de Chantier

Application mobile pour architectes — rédaction et gestion des rapports de chantier.
Fonctionne sur iPhone, iPad, Android, et navigateur web.

---

## Déploiement rapide (première fois)

> **Durée estimée : 20–30 minutes**
> Vous aurez besoin d'un compte Google (Gmail) et d'une carte de crédit pour Anthropic (usage à la demande, très faible coût).

### Ce dont vous avez besoin

| Outil | Pour quoi | Gratuit ? |
|-------|-----------|-----------|
| [Node.js](https://nodejs.org) (v18+) | Faire tourner le code | ✅ Oui |
| [Compte Google](https://accounts.google.com) | Firebase (base de données) | ✅ Oui |
| [Compte Anthropic](https://console.anthropic.com) | IA de reformatage de texte | 💳 Paiement à l'usage |
| [Compte OpenAI](https://platform.openai.com) *(optionnel)* | Transcription vocale de secours | 💳 Paiement à l'usage |

---

## Option A — Script automatique (recommandé)

Le script vous pose des questions et fait tout à votre place.

**1. Ouvrez un terminal** (sur Mac : `Cmd+Espace` → "Terminal" ; sur Windows : installez [Git Bash](https://gitforwindows.org))

**2. Naviguez dans le dossier du projet :**
```bash
cd chemin/vers/scribbleaway
```

**3. Lancez le script :**
```bash
bash setup.sh
```

Le script vous guidera pour :
- créer votre projet Firebase
- copier vos clés API
- construire et déployer l'application

**C'est tout.** À la fin, votre URL est affichée.

---

## Option B — Étapes manuelles

Si vous préférez faire chaque étape vous-même :

### Étape 1 — Installer Node.js

Allez sur **https://nodejs.org** → téléchargez la version **LTS** → installez-la.

Vérifiez dans un terminal :
```bash
node --version   # doit afficher v18 ou plus
```

### Étape 2 — Créer votre projet Firebase

1. Allez sur **https://console.firebase.google.com**
2. Cliquez **"Créer un projet"**
3. Donnez-lui un nom (ex: `rapports-chantier`)
4. Désactivez Google Analytics → Cliquez **"Créer le projet"**

Puis dans votre nouveau projet :

5. Cliquez l'icône **`</>`** (Web) sur la page d'accueil
6. Donnez un surnom (ex: `app`) → cochez **"Firebase Hosting"** → **"Enregistrer"**
7. Notez les valeurs dans la section `firebaseConfig` (vous en aurez besoin après)

### Étape 3 — Activer les services Firebase

Dans le panneau gauche de la console Firebase :

**Authentication :**
> Authentication → Sign-in method → Email/Mot de passe → Activer → Enregistrer

**Firestore Database :**
> Firestore Database → Créer une base de données → Mode production → Choisir une région → Activer

Ensuite, allez dans **Règles** et remplacez tout par :
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
        && request.auth.uid in get(
          /databases/$(database)/documents/projects/$(projectId)
        ).data.members;
    }
  }
}
```

**Storage :**
> Storage → Commencer → Mode production → Choisir une région → Terminer

Ensuite, allez dans **Règles** et remplacez tout par :
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

### Étape 4 — Obtenir vos clés API

**Clé Anthropic (IA) :**
1. Allez sur **https://console.anthropic.com**
2. Créez un compte → allez dans **API Keys** → **Create Key**
3. Copiez la clé (commence par `sk-ant-…`)

**Clé OpenAI (optionnel) :**
1. Allez sur **https://platform.openai.com/api-keys**
2. **Create new secret key** → copiez-la

### Étape 5 — Configurer le fichier .env

Dans le dossier du projet, copiez le fichier d'exemple :
```bash
cp .env.example .env
```

Ouvrez `.env` dans un éditeur de texte (ex: Bloc-notes) et remplissez chaque ligne avec vos valeurs :
```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=monprojet.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=monprojet
VITE_FIREBASE_STORAGE_BUCKET=monprojet.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_OPENAI_API_KEY=sk-...
```

### Étape 6 — Installer Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

Un navigateur s'ouvre — connectez-vous avec votre compte Google.

### Étape 7 — Construire et déployer

```bash
npm install
npm run build
firebase deploy --only hosting
```

À la fin, vous verrez :
```
✔  Deploy complete!
Hosting URL: https://monprojet.web.app
```

**Ouvrez cette URL sur votre téléphone.** 🎉

---

## Installer l'app sur votre téléphone

Une fois l'URL ouverte dans le navigateur :

**iPhone/iPad (Safari) :**
> Appuyez sur le bouton Partager ⬆ → "Sur l'écran d'accueil"

**Android (Chrome) :**
> Menu ⋮ → "Installer l'application" (ou une bannière apparaît automatiquement)

L'app s'installe comme une vraie application et fonctionne même sans connexion internet.

---

## Mises à jour (après la première installation)

Pour mettre à jour l'application après des modifications de code :
```bash
npm run build && firebase deploy --only hosting
```

---

## Déploiement automatique via GitHub Actions

Si votre code est sur GitHub, chaque `git push` sur `main` peut déclencher un déploiement automatique.

### Configuration une seule fois :

**1. Générez une clé de service Firebase :**
> Console Firebase → Paramètres du projet ⚙ → Comptes de service → Générer une nouvelle clé privée

Téléchargez le fichier JSON.

**2. Ajoutez vos secrets dans GitHub :**
> Dépôt GitHub → Settings → Secrets and variables → Actions → New repository secret

Ajoutez un secret pour chaque variable du fichier `.env` (mêmes noms), plus :
- `FIREBASE_SERVICE_ACCOUNT` → collez le contenu entier du fichier JSON téléchargé

**3. C'est tout.** Chaque `git push` sur `main` déploie automatiquement.

---

## Questions fréquentes

**L'app dit "Configuration Firebase manquante" ?**
→ Votre fichier `.env` n'est pas rempli correctement. Vérifiez que chaque ligne a une valeur.

**La dictée vocale ne fonctionne pas ?**
→ Sur iOS/Android, l'app utilise automatiquement le micro du système. Sur certains navigateurs de bureau, elle bascule sur Whisper (clé OpenAI nécessaire).

**Les photos ne s'envoient pas hors ligne ?**
→ Normal — elles sont mises en file d'attente et s'envoient automatiquement dès que la connexion revient.

**Comment ajouter un collègue ?**
→ Il doit créer son propre compte dans l'app. Ensuite, la fonctionnalité d'invitation de membres sera ajoutée dans une prochaine version.
