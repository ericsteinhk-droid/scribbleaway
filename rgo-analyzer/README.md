# Schedule Analyzer

Multi-revision Gantt schedule comparator for MS Project ZIP-PDF exports.

## Prerequisites

- [Node.js 20+](https://nodejs.org) (LTS recommended)
- [Git](https://git-scm.com)

## Build on Windows

```bat
git clone https://github.com/ericsteinhk-droid/scribbleaway.git
cd scribbleaway\rgo-analyzer
npm install
npm run build
```

The installer will be at:

```
dist\Schedule Analyzer Setup x.x.x.exe
```

Double-click it to install, then launch **Schedule Analyzer** from the Start Menu.

## Development (hot-reload)

```bat
npm run electron:dev
```

## Usage

1. Click the drop zone in the sidebar (or drag files onto it) to load two or more schedule files
2. Files must be ZIP archives exported from MS Project containing `.txt` tab-delimited task data
3. The app auto-detects revision labels from filenames — double-click any label to rename it
4. Select a comparison pair (A → B) from the dropdown
5. Use the four tabs: **Séquence**, **Tableau**, **Jalons & alertes**, **Rapport**

## Tabs

| Tab | What it shows |
|---|---|
| Séquence | D3 Gantt timeline with phase grouping, sequence inversions, critical chain |
| Tableau | Searchable/sortable table with CSV export |
| Jalons & alertes | Milestones, short-duration alerts, per-phase status summary |
| Rapport | Auto-generated bilingual (FR/EN) report — copy as Markdown or Print |

## Settings

Click **⚙ Paramètres** in the sidebar to adjust slippage thresholds, phase detection sensitivity, alert keywords, report language, and bar height. All settings persist between sessions.
