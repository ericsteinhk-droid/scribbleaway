#!/bin/bash
# run.sh — NMS/DDN Translator launcher for Linux
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check Python 3.11+
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. Install Python 3.11+ and retry."
    exit 1
fi

PY_VER=$(python3 -c "import sys; print(sys.version_info >= (3,11))")
if [ "$PY_VER" != "True" ]; then
    echo "WARNING: Python 3.11+ recommended. Current version may work but is untested."
fi

# Check tkinter
python3 -c "import tkinter" 2>/dev/null || {
    echo "ERROR: tkinter not found. Install it with:"
    echo "  Ubuntu/Debian : sudo apt install python3-tk"
    echo "  Fedora/RHEL   : sudo dnf install python3-tkinter"
    exit 1
}

# Install Python dependencies if needed
echo "Checking dependencies..."
python3 -c "import anthropic, lxml" 2>/dev/null || {
    echo "Installing dependencies..."
    pip3 install anthropic lxml
}

echo "Launching NMS/DDN Translator..."
python3 gui.py
