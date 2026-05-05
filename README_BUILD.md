# Word Search — .docx File Scanner

A standalone Windows GUI application that searches for keywords across all `.docx` Word files in a selected folder.

---

## Features

| Feature | Details |
|---|---|
| Folder picker | Browse button + manual path entry |
| Recursive scan | Checkbox to include all subfolders |
| Keywords | Comma-separated list of terms |
| Match mode | AND (all keywords) or OR (any keyword) |
| Case sensitivity | Toggle on/off |
| Results table | Filename · Full path · Matched keyword · Excerpt |
| Progress bar | Live scan progress with current filename |
| Skipped files | Password-protected / unreadable files logged in a separate popup |
| CSV export | One-click export of all results |
| Responsive UI | Search runs in a background thread |

---

## Running from source (development)

### Prerequisites

- Python 3.10 or later (64-bit recommended)
- pip

### Setup

```cmd
# 1. Create and activate a virtual environment (recommended)
python -m venv .venv
.venv\Scripts\activate

# 2. Install runtime + build dependencies
pip install -r requirements.txt
```

### Launch

```cmd
python word_search.py
```

---

## Building a standalone .exe with PyInstaller

The resulting `.exe` bundles Python and all dependencies — no Python installation is required on the target machine.

### Step-by-step

```cmd
# 1. Activate your virtual environment (if you created one)
.venv\Scripts\activate

# 2. Install dependencies (skip if already done)
pip install -r requirements.txt

# 3. Build using the provided spec file
pyinstaller word_search.spec
```

After a successful build you will find:

```
dist/
  WordSearch.exe   ← the standalone executable
```

Copy `WordSearch.exe` to any Windows PC and run it directly.

### Alternative: one-liner build (no spec file)

```cmd
pyinstaller --onefile --windowed --name WordSearch ^
    --hidden-import docx ^
    --hidden-import docx.opc.exceptions ^
    --hidden-import lxml ^
    --hidden-import lxml.etree ^
    --hidden-import lxml._elementpath ^
    word_search.py
```

### Adding a custom icon

1. Prepare a `.ico` file (e.g. `icon.ico`).
2. Open `word_search.spec` and set `icon='icon.ico'` in the `EXE(...)` block.
3. Re-run `pyinstaller word_search.spec`.

Or with the one-liner: append `--icon icon.ico`.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: docx` at runtime | Add `--hidden-import docx` (already in the spec) |
| Antivirus flags the .exe | Sign the executable with a code-signing certificate, or add an AV exclusion |
| App window flashes then closes | Remove `--windowed` / set `console=True` temporarily to see the error |
| Large .exe size | Install `upx` and ensure `upx=True` in the spec (enabled by default) |

---

## Project structure

```
word_search.py        Main application (all-in-one source)
word_search.spec      PyInstaller build spec
requirements.txt      Python dependencies
README_BUILD.md       This file
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `python-docx` | Read `.docx` files (text, tables) |
| `tkinter` | GUI framework (bundled with Python) |
| `pyinstaller` | Package to standalone .exe (build-time only) |
