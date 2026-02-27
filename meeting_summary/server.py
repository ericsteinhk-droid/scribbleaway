#!/usr/bin/env python3
"""
Meeting Summary Generator – Backend Server
==========================================
Processes MP4 recordings:
  1. Extracts audio (ffmpeg)
  2. Speaker diarization (pyannote.audio)
  3. Transcription – Canadian French + English (OpenAI Whisper)
  4. Generates French meeting summary (Anthropic Claude)
  5. Produces RTF output

Environment variables required:
  HF_TOKEN          – Hugging Face access token (accept pyannote model terms first)
  ANTHROPIC_API_KEY – Anthropic API key
"""

import os
import sys
import json
import tempfile
import threading
import uuid
import traceback
from pathlib import Path
from datetime import date

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# ── App setup ────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

HF_TOKEN         = os.environ.get("HF_TOKEN", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

UPLOAD_DIR = Path(tempfile.gettempdir()) / "meeting_summaries"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Job registry {job_id: {...}}
jobs      = {}
jobs_lock = threading.Lock()

STATUS_LABELS = {
    "queued":             "En attente de traitement…",
    "extracting_audio":   "Extraction audio (ffmpeg)…",
    "diarizing":          "Identification des locuteurs (pyannote)…",
    "transcribing":       "Transcription audio (Whisper)…",
    "merging":            "Alignement locuteurs / transcription…",
    "generating_summary": "Génération du résumé (Claude)…",
    "creating_rtf":       "Création du fichier RTF…",
    "complete":           "Traitement terminé !",
    "error":              "Une erreur s'est produite.",
}

# ── RTF utilities ─────────────────────────────────────────────────────────────

# cp1252 → RTF escape map for characters above ASCII-127
_RTF_ESC = {
    "é": "\\'e9", "è": "\\'e8", "ê": "\\'ea", "ë": "\\'eb",
    "à": "\\'e0", "â": "\\'e2", "ù": "\\'f9", "û": "\\'fb",
    "ü": "\\'fc", "ç": "\\'e7", "î": "\\'ee", "ï": "\\'ef",
    "ô": "\\'f4", "œ": "\\'9c", "æ": "\\'e6",
    "É": "\\'c9", "È": "\\'c8", "Ê": "\\'ca", "Ë": "\\'cb",
    "À": "\\'c0", "Â": "\\'c2", "Ù": "\\'d9", "Û": "\\'db",
    "Ü": "\\'dc", "Ç": "\\'c7", "Î": "\\'ce", "Ï": "\\'cf",
    "Ô": "\\'d4", "Œ": "\\'8c", "Æ": "\\'c6",
    "«": "\\'ab", "»": "\\'bb",
    "\u2018": "\\'91", "\u2019": "\\'92",   # curly apostrophes
    "\u201c": "\\'93", "\u201d": "\\'94",   # curly quotes
    "\u2013": "\\'96", "\u2014": "\\'97",   # en/em dashes
    "\u2026": "\\'85",                       # ellipsis
    "\\": "\\\\", "{": "\\{", "}": "\\}",
}


def _rtf_encode(text: str) -> str:
    """Encode a Unicode string to RTF-safe cp1252 representation."""
    buf = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "\r" and i + 1 < len(text) and text[i + 1] == "\n":
            buf.append("\\par\n")
            i += 2
            continue
        if ch == "\n":
            buf.append("\\par\n")
            i += 1
            continue
        if ch in _RTF_ESC:
            buf.append(_RTF_ESC[ch])
        elif ord(ch) > 127:
            # Unicode fallback: \\uN? (RTF 1.5+)
            buf.append(f"\\u{ord(ch)}?")
        else:
            buf.append(ch)
        i += 1
    return "".join(buf)


def _fmt_time(seconds: float) -> str:
    """Format seconds → HH:MM:SS or MM:SS."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


# ── RTF document builder ──────────────────────────────────────────────────────

def _build_rtf(title: str, participants: list, speaker_map: dict,
               merged_segments: list, summary: str, transcript_text: str) -> str:
    """Compose a full RTF 1.5 document string (cp1252 safe)."""

    lines = [
        r"{\rtf1\ansi\ansicpg1252\deff0\deflang3084",   # 3084 = fr-CA
        r"{\fonttbl"
        r"{\f0\froman\fcharset0 Times New Roman;}"
        r"{\f1\fswiss\fcharset0 Arial;}"
        r"{\f2\fmodern\fcharset0 Courier New;}"
        r"}",
        r"{\colortbl;"
        r"\red0\green0\blue0;"          # 1 black
        r"\red0\green70\blue127;"       # 2 dark blue
        r"\red80\green80\blue80;"       # 3 grey (transcript)
        r"\red180\green30\blue30;"      # 4 red (actions placeholder)
        r"}",
        r"\widowctrl\wpaper15840\wpaperh12240\margl1800\margr1800\margt1440\margb1440",
        r"\viewkind4\uc1",
        "",
    ]

    # ── helpers ──────────────────────────────────────────────────────────────

    def h1(text):
        return (r"\pard\widctlpar\sb300\sa120"
                r"\f1\fs32\b\cf2 " + _rtf_encode(text) + r"\b0\cf1\f0\par" + "\n")

    def h2(text):
        return (r"\pard\widctlpar\sb240\sa80"
                r"\f1\fs26\b\cf2 " + _rtf_encode(text) + r"\b0\cf1\f0\par" + "\n")

    def para(text):
        return (r"\pard\widctlpar\sb80\sa80"
                r"\f0\fs22 " + _rtf_encode(text) + r"\par" + "\n")

    def bullet(text):
        return (r"\pard\widctlpar\fi-360\li720\sb60\sa60"
                r"\f0\fs22 \bullet  " + _rtf_encode(text) + r"\par" + "\n")

    def hr():
        return r"\pard\widctlpar\brdrb\brdrs\brdrw10 \par" + "\n"

    def transcript_line(time_str, name, text):
        return (r"\pard\widctlpar\sb40\sa0"
                r"\f2\fs18\cf3 [" + _rtf_encode(time_str) + r"] "
                r"\b\cf1 " + _rtf_encode(name) + r":\b0  "
                r"\f0\fs20 " + _rtf_encode(text) + r"\par" + "\n")

    # ── Cover ────────────────────────────────────────────────────────────────

    lines.append(
        r"\pard\widctlpar\qc\sb0\sa120"
        r"\f1\fs44\b\cf2 " + _rtf_encode(title) + r"\b0\cf1\par" + "\n"
    )
    today_str = date.today().strftime("%d %B %Y")
    lines.append(para(f"Date : {today_str}"))
    lines.append(para("Participants : " + ", ".join(participants)))
    lines.append(para("Langue : français canadien (anglais américain utilisé à l'occasion)"))
    lines.append(hr())

    # ── Summary ──────────────────────────────────────────────────────────────

    lines.append(h1("COMPTE-RENDU DE R\\'c9UNION"))

    # Render Claude's markdown-ish summary
    for raw_line in summary.split("\n"):
        stripped = raw_line.strip()
        if not stripped:
            continue
        if stripped.startswith("### "):
            lines.append(h2(stripped[4:]))
        elif stripped.startswith("## "):
            lines.append(h2(stripped[3:]))
        elif stripped.startswith("# "):
            lines.append(h1(stripped[2:]))
        elif stripped.startswith(("- ", "* ")):
            lines.append(bullet(stripped[2:]))
        elif stripped.startswith("**") and stripped.endswith("**") and len(stripped) > 4:
            # Bold line = heading
            lines.append(h2(stripped[2:-2]))
        else:
            lines.append(para(stripped))

    lines.append(hr())

    # ── Transcript ───────────────────────────────────────────────────────────

    lines.append(h1("TRANSCRIPTION D\\'c9TAILL\\'c9E"))
    lines.append(para(
        "Note : L\\'27assignation des locuteurs est bas\\'e9e sur l\\'27ordre de premi\\'e8re "
        "prise de parole. V\\'e9rifiez et corrigez au besoin."
    ))

    # Legend
    lines.append(h2("Correspondance des locuteurs"))
    for sid, name in speaker_map.items():
        lines.append(bullet(f"{name}  \\'bb  {sid}"))

    lines.append(h2("Transcription"))
    for seg in merged_segments:
        name = speaker_map.get(seg["speaker"], seg["speaker"])
        time_str = _fmt_time(seg["start"])
        if seg.get("text"):
            lines.append(transcript_line(time_str, name, seg["text"]))

    lines.append("}")
    return "\n".join(lines)


# ── Summary generation (Claude) ───────────────────────────────────────────────

def _generate_summary(title: str, participants: list, transcript: str) -> str:
    from anthropic import Anthropic

    client = Anthropic(api_key=ANTHROPIC_API_KEY)

    # Truncate if very long (keep ~18 000 chars ≈ ~4 500 tokens)
    max_chars = 18_000
    truncated = ""
    if len(transcript) > max_chars:
        transcript = transcript[:max_chars]
        truncated = "\n[…transcription tronquée – enregistrement très long…]"

    prompt = f"""Tu es un expert en rédaction de compte-rendus de réunion en français canadien professionnel.

Réunion : « {title} »
Participants déclarés : {", ".join(participants)}

TRANSCRIPTION :
{transcript}{truncated}

---
Génère un compte-rendu structuré en français canadien. Utilise le vouvoiement dans les formulations neutres. Sois factuel et précis. Si tu ne peux pas attribuer une action à quelqu'un avec certitude, utilise « un·e participant·e ».

Structure exacte à respecter :

## Résumé exécutif
(2 à 4 phrases décrivant l'objectif et les résultats globaux)

## Points principaux discutés
(liste à puces détaillée, un sous-point par sujet important)

## Décisions prises
(liste à puces des décisions formelles)

## Actions à réaliser
(liste à puces, format : [Responsable] : description de la tâche — Échéance : date si mentionnée, sinon « À confirmer »)

## Questions en suspens
(points non résolus ou nécessitant un suivi)

## Prochaines étapes
(liste à puces)
"""

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


# ── Background processing job ─────────────────────────────────────────────────

def _update(job_id: str, **kwargs):
    with jobs_lock:
        jobs[job_id].update(kwargs)


def _process(job_id: str, mp4_path: str, title: str, participants: list):
    """Full pipeline – runs in background thread."""
    wav_path = str(UPLOAD_DIR / f"{job_id}.wav")
    rtf_path = str(UPLOAD_DIR / f"{job_id}.rtf")

    try:
        # ── 1. Extract audio ─────────────────────────────────────────────────
        _update(job_id, status="extracting_audio", progress=8,
                message=STATUS_LABELS["extracting_audio"])

        import ffmpeg as ffmpeg_mod
        (
            ffmpeg_mod
            .input(mp4_path)
            .output(wav_path, ar=16000, ac=1, acodec="pcm_s16le")
            .overwrite_output()
            .run(quiet=True)
        )

        # ── 2. Speaker diarization ───────────────────────────────────────────
        _update(job_id, status="diarizing", progress=22,
                message=STATUS_LABELS["diarizing"])

        import torch
        from pyannote.audio import Pipeline as PyAnnotePipeline

        pipeline = PyAnnotePipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=HF_TOKEN,
        )
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        pipeline = pipeline.to(device)

        diarization = pipeline(wav_path)
        diar_segs = [
            {"start": turn.start, "end": turn.end, "speaker": speaker}
            for turn, _, speaker in diarization.itertracks(yield_label=True)
        ]

        # ── 3. Transcription ─────────────────────────────────────────────────
        _update(job_id, status="transcribing", progress=45,
                message=STATUS_LABELS["transcribing"])

        import whisper

        # Use 'large' model for best French/English quality; fall back to
        # 'medium' on CPU-only machines to avoid OOM.
        model_size = "large" if torch.cuda.is_available() else "medium"
        wmodel = whisper.load_model(model_size)

        # language=None → auto-detect each segment (handles mixed fr/en)
        result = wmodel.transcribe(wav_path, language=None, task="transcribe", verbose=False)
        trans_segs = result["segments"]

        # ── 4. Merge diarization + transcription ─────────────────────────────
        _update(job_id, status="merging", progress=68,
                message=STATUS_LABELS["merging"])

        merged = []
        for seg in trans_segs:
            s0, s1 = seg["start"], seg["end"]
            speaker_time: dict = {}
            for ds in diar_segs:
                ov0 = max(s0, ds["start"])
                ov1 = min(s1, ds["end"])
                if ov1 > ov0:
                    sp = ds["speaker"]
                    speaker_time[sp] = speaker_time.get(sp, 0.0) + (ov1 - ov0)
            dominant = max(speaker_time, key=speaker_time.get) if speaker_time else "SPEAKER_00"
            text = (seg.get("text") or "").strip()
            if text:
                merged.append({"start": s0, "end": s1, "speaker": dominant, "text": text})

        # Map anonymous speaker IDs → participant names (first-appearance order)
        seen: list = []
        for seg in merged:
            if seg["speaker"] not in seen:
                seen.append(seg["speaker"])
        speaker_map = {
            sid: (participants[i] if i < len(participants) else f"Participant {i + 1}")
            for i, sid in enumerate(seen)
        }

        # Build plain-text transcript for Claude
        lines_tr = []
        prev = None
        for seg in merged:
            nm = speaker_map.get(seg["speaker"], seg["speaker"])
            if nm != prev:
                lines_tr.append(f"\n{nm} :")
                prev = nm
            lines_tr.append(f"  {seg['text']}")
        transcript_text = "\n".join(lines_tr)

        # ── 5. Generate summary ──────────────────────────────────────────────
        _update(job_id, status="generating_summary", progress=82,
                message=STATUS_LABELS["generating_summary"])

        summary = _generate_summary(title, participants, transcript_text)

        # ── 6. Build RTF ─────────────────────────────────────────────────────
        _update(job_id, status="creating_rtf", progress=95,
                message=STATUS_LABELS["creating_rtf"])

        rtf_content = _build_rtf(
            title, participants, speaker_map, merged, summary, transcript_text
        )
        with open(rtf_path, "w", encoding="cp1252", errors="replace") as fh:
            fh.write(rtf_content)

        safe_name = (
            title[:60]
            .replace(" ", "_")
            .replace("/", "-")
            .replace("\\", "-")
        )
        _update(job_id, status="complete", progress=100,
                message=STATUS_LABELS["complete"],
                rtf_path=rtf_path,
                filename=f"{safe_name}.rtf")

    except Exception as exc:
        _update(job_id, status="error", progress=0,
                message=STATUS_LABELS["error"],
                error=str(exc),
                detail=traceback.format_exc())

    finally:
        for path in (mp4_path, wav_path):
            try:
                if path and os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass


# ── Flask routes ──────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "hf_token_set":     bool(HF_TOKEN),
        "anthropic_key_set": bool(ANTHROPIC_API_KEY),
        "upload_dir":       str(UPLOAD_DIR),
    })


@app.route("/api/process", methods=["POST"])
def api_process():
    """Receive MP4 upload + metadata, start background job."""
    if "file" not in request.files:
        return jsonify({"error": "Aucun fichier fourni (champ 'file' manquant)."}), 400

    file = request.files["file"]
    if not file.filename.lower().endswith(".mp4"):
        return jsonify({"error": "Le fichier doit être au format .mp4."}), 400

    title = request.form.get("title", "Réunion sans titre").strip() or "Réunion sans titre"

    try:
        participants = json.loads(request.form.get("participants", "[]"))
    except (json.JSONDecodeError, TypeError):
        participants = []

    participants = [str(p).strip() for p in participants if str(p).strip()]
    if not participants:
        return jsonify({"error": "Veuillez fournir au moins un participant."}), 400

    if not HF_TOKEN:
        return jsonify({
            "error": "Variable d'environnement HF_TOKEN non définie.\n"
                     "Obtenez un token sur https://huggingface.co/settings/tokens "
                     "et acceptez les conditions du modèle pyannote/speaker-diarization-3.1."
        }), 500

    if not ANTHROPIC_API_KEY:
        return jsonify({
            "error": "Variable d'environnement ANTHROPIC_API_KEY non définie."
        }), 500

    job_id   = str(uuid.uuid4())
    mp4_path = str(UPLOAD_DIR / f"{job_id}.mp4")
    file.save(mp4_path)

    with jobs_lock:
        jobs[job_id] = {
            "status":       "queued",
            "progress":     0,
            "message":      STATUS_LABELS["queued"],
            "title":        title,
            "participants": participants,
        }

    t = threading.Thread(target=_process,
                         args=(job_id, mp4_path, title, participants),
                         daemon=True)
    t.start()

    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>", methods=["GET"])
def api_status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Tâche introuvable."}), 404

    return jsonify({
        "status":   job.get("status"),
        "progress": job.get("progress", 0),
        "message":  job.get("message", ""),
        "error":    job.get("error"),
    })


@app.route("/api/download/<job_id>", methods=["GET"])
def api_download(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Tâche introuvable."}), 404
    if job.get("status") != "complete":
        return jsonify({"error": "Le fichier n'est pas encore prêt."}), 400

    rtf_path = job.get("rtf_path", "")
    filename = job.get("filename", "resume_reunion.rtf")

    if not rtf_path or not os.path.exists(rtf_path):
        return jsonify({"error": "Fichier RTF introuvable sur le serveur."}), 404

    return send_file(
        rtf_path,
        as_attachment=True,
        download_name=filename,
        mimetype="application/rtf",
    )


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  Générateur de Résumé de Réunion – Serveur")
    print("=" * 60)
    print(f"  HF_TOKEN         : {'✓ configuré' if HF_TOKEN else '✗ MANQUANT'}")
    print(f"  ANTHROPIC_API_KEY: {'✓ configuré' if ANTHROPIC_API_KEY else '✗ MANQUANT'}")
    print(f"  Dossier temp     : {UPLOAD_DIR}")
    print(f"  Interface HTML   : ouvrez index.html dans votre navigateur")
    print(f"  Serveur          : http://localhost:5050")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
