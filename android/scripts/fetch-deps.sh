#!/usr/bin/env bash
#
# Fetches everything the native build and the app need but that we don't want to
# commit to git:
#   1. the whisper.cpp source tree (compiled by the NDK build), and
#   2. the Whisper "base" multilingual GGML model (bundled as an app asset).
#
# Run this once before building the APK, either locally or in CI.
set -euo pipefail

# Pin whisper.cpp so native builds are reproducible. Bump deliberately.
WHISPER_REPO="https://github.com/ggml-org/whisper.cpp.git"
WHISPER_COMMIT="6fc7c33b4c3a2cec83e4b65abd5e96a890480375"

# The base multilingual model — good French accuracy at a modest size (~148 MB).
MODEL_NAME="ggml-base.bin"
MODEL_URL_PRIMARY="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}"
MODEL_URL_FALLBACK="https://huggingface.co/ggml-org/whisper.cpp/resolve/main/${MODEL_NAME}"

# Resolve paths relative to this script so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
THIRD_PARTY_DIR="${PROJECT_DIR}/third_party"
WHISPER_DIR="${THIRD_PARTY_DIR}/whisper.cpp"
MODEL_DIR="${PROJECT_DIR}/app/src/main/assets/models"
MODEL_PATH="${MODEL_DIR}/${MODEL_NAME}"

echo "==> whisper.cpp -> ${WHISPER_DIR}"
if [ -d "${WHISPER_DIR}/.git" ]; then
    git -C "${WHISPER_DIR}" fetch --depth 1 origin "${WHISPER_COMMIT}"
    git -C "${WHISPER_DIR}" checkout -q "${WHISPER_COMMIT}"
else
    mkdir -p "${THIRD_PARTY_DIR}"
    rm -rf "${WHISPER_DIR}"
    git init -q "${WHISPER_DIR}"
    git -C "${WHISPER_DIR}" remote add origin "${WHISPER_REPO}"
    git -C "${WHISPER_DIR}" fetch --depth 1 origin "${WHISPER_COMMIT}"
    git -C "${WHISPER_DIR}" checkout -q FETCH_HEAD
fi

echo "==> model -> ${MODEL_PATH}"
mkdir -p "${MODEL_DIR}"
if [ -f "${MODEL_PATH}" ] && [ "$(stat -c%s "${MODEL_PATH}" 2>/dev/null || echo 0)" -gt 100000000 ]; then
    echo "    model already present ($(du -h "${MODEL_PATH}" | cut -f1)), skipping download"
else
    if ! curl -fL --retry 3 -o "${MODEL_PATH}" "${MODEL_URL_PRIMARY}"; then
        echo "    primary mirror failed, trying fallback…"
        curl -fL --retry 3 -o "${MODEL_PATH}" "${MODEL_URL_FALLBACK}"
    fi
fi

echo "==> done"
echo "    whisper.cpp @ $(git -C "${WHISPER_DIR}" rev-parse --short HEAD)"
echo "    model size  = $(du -h "${MODEL_PATH}" | cut -f1)"
