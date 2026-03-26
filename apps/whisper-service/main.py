from __future__ import annotations

import tempfile
import os
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from faster_whisper import WhisperModel

app = FastAPI()

model: Optional[WhisperModel] = None

def get_model() -> WhisperModel:
    global model
    if model is None:
        model_size = os.environ.get("WHISPER_MODEL", "small.en")
        compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
        print(f"Loading faster-whisper model '{model_size}' (compute_type={compute_type})...")
        model = WhisperModel(model_size, device="cpu", compute_type=compute_type)
        print("Model loaded.")
    return model


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio data received")

    suffix = ".webm"
    ct = file.content_type or ""
    if "wav" in ct:
        suffix = ".wav"
    elif "mp3" in ct or "mpeg" in ct:
        suffix = ".mp3"
    elif "ogg" in ct:
        suffix = ".ogg"
    elif "mp4" in ct:
        suffix = ".mp4"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()

        m = get_model()
        segments, info = m.transcribe(tmp.name, language="en", beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments)

    return {"text": text}


@app.get("/health")
async def health():
    return {"status": "ok"}
