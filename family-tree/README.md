# Family Tree / Arbre Généalogique

A bilingual French/English web app for building a family genealogy tree collaboratively.

## Features

- 🌳 Interactive SVG family tree (zoom, pan, click for details)
- 📝 Engaging multi-step questionnaire to submit family members
- 🌐 Bilingual (FR/EN) — auto-detects browser language, manual toggle
- 🔐 Admin approval panel — review, approve, or reject submissions
- 📱 Mobile-friendly responsive design

## Setup

```bash
cd family-tree
npm install
node server.js
```

Open [http://localhost:3000](http://localhost:3000) for the family tree.  
Open [http://localhost:3000/admin.html](http://localhost:3000/admin.html) for the admin panel.

## Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ADMIN_PASSWORD` | `famille2024` | Admin panel password |
| `JWT_SECRET` | *(built-in)* | Change in production |
| `DB_PATH` | `./family.db` | SQLite database path |

## How it works

1. **Public users** visit the URL, see the family tree, and can submit new members via the questionnaire.
2. All submissions start as **pending** and are invisible on the public tree.
3. The **administrator** logs in at `/admin.html`, reviews submissions, and approves or rejects them.
4. Approved members appear on the tree with parent/child connections drawn automatically.

## Data model

Each person has: first name, last name, approximate birth year, approximate death year, gender, father (optional link), mother (optional link), and notes.

The tree is rendered generationally — oldest known ancestors at the top, descendants below. Couples are shown side by side, connected by a dashed line.
