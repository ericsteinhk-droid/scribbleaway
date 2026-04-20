#!/usr/bin/env bash
# Build ODC Creator as a standalone Linux executable.
# Requires: Python 3.8+, pip3
# System deps (run once): sudo apt-get install -y gir1.2-webkit2-4.1 python3-gi python3-gi-cairo
set -euo pipefail

echo "==> Installing Python dependencies..."
pip3 install --quiet -r requirements.txt

echo "==> Building executable..."
pyinstaller \
    --onefile \
    --noconsole \
    --name "odc-creator" \
    --add-data "odc_creator.html:." \
    app.py

echo ""
echo "Done. Run with:"
echo "  ./dist/odc-creator"
