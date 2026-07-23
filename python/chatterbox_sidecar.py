#!/usr/bin/env python3
"""
KAIZEN EDITION — Chatterbox voice-cloning sidecar.

Runs as a standalone child process spawned by the Electron main process. It loads
Resemble AI's *official* Chatterbox model (MIT-licensed) and performs zero-shot
voice cloning: given a short reference clip of a voice + some text, it synthesizes
that text in the cloned voice.

Protocol: line-delimited JSON over stdio (one JSON object per line).
  stdin  (requests):
    {"id": N, "cmd": "ping"}
    {"id": N, "cmd": "load",  "model": "multilingual"|"english", "device": "auto"|"cpu"|"cuda"}
    {"id": N, "cmd": "clone", "reference": "<wav path>", "text": "...",
              "language": "es", "output": "<wav path>",
              "exaggeration": 0.5, "cfgWeight": 0.5}
    {"id": N, "cmd": "shutdown"}
  stdout (responses, also one JSON object per line):
    {"type": "hello", "pid": ..., "cuda": false}            # emitted once at startup
    {"id": N, "type": "pong"}
    {"id": N, "type": "progress", "stage": "loading"|"generating"|"saving"}
    {"id": N, "type": "ready", "model": "...", "device": "...", "sampleRate": 24000}
    {"id": N, "type": "done", "output": "...", "sampleRate": 24000,
              "durationSec": ..., "elapsedSec": ...}
    {"id": N, "type": "error", "error": "..."}

Notes:
  - The model (~1.2 GB multilingual) downloads from Hugging Face on first load; set
    HF_HOME so it caches into the app's userData dir (the Electron side passes it).
  - Chatterbox embeds a mandatory PerTh neural watermark in every output — keep it.
  - Heavy ML imports (torch) are deferred until first use so `ping` stays instant
    and startup failures are reported as clean JSON, not a stack trace on stderr.
"""
import io
import json
import os
import re
import sys
import time
import traceback

# Line-buffered, UTF-8 stdio regardless of the host console code page.
try:
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    sys.stdin.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover - older interpreters
    pass

# Supported Chatterbox multilingual language ids (ISO 639-1).
SUPPORTED_LANGS = {
    "en", "es", "pt", "fr", "de", "it", "ru", "ar", "da", "el", "fi", "he",
    "hi", "ja", "ko", "ms", "nl", "no", "pl", "sv", "sw", "tr",
}

_state = {
    "model": None,        # loaded model object
    "kind": None,         # "multilingual" | "english"
    "device": None,       # "cpu" | "cuda"
    "sr": 24000,
}


def emit(obj):
    """Write one JSON response line to stdout and flush."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _pick_device(requested):
    import torch  # deferred
    if requested == "cpu":
        return "cpu"
    if requested == "cuda":
        return "cuda" if torch.cuda.is_available() else "cpu"
    # auto
    return "cuda" if torch.cuda.is_available() else "cpu"


def _local_model_dir():
    """A bundled/staged multilingual model dir (the 6 from_pretrained files),
    if one is present. Set by the Electron side via KAIZEN_MODEL_DIR. Using it
    means zero network: the model ships with the app instead of downloading."""
    d = os.environ.get("KAIZEN_MODEL_DIR")
    if d and os.path.isfile(os.path.join(d, "t3_mtl23ls_v2.safetensors")):
        return d
    return None


def cmd_load(req):
    rid = req.get("id")
    kind = req.get("model", "multilingual")
    local_dir = _local_model_dir()
    # A bundled model is multilingual and covers every supported language
    # (English included), so prefer it for any request — one model, no download.
    if local_dir is not None:
        kind = "multilingual"
    if _state["model"] is not None and _state["kind"] == kind:
        emit({"id": rid, "type": "ready", "model": kind,
              "device": _state["device"], "sampleRate": _state["sr"]})
        return
    emit({"id": rid, "type": "progress", "stage": "loading"})
    device = _pick_device(req.get("device", "auto"))
    if local_dir is not None:
        # Load the shipped weights directly off disk (no Hugging Face network).
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        model = ChatterboxMultilingualTTS.from_local(local_dir, device)
        kind = "multilingual"
    elif kind == "english":
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_pretrained(device=device)
    else:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        kind = "multilingual"
    _state.update(model=model, kind=kind, device=device,
                  sr=int(getattr(model, "sr", 24000)))
    emit({"id": rid, "type": "ready", "model": kind, "device": device,
          "sampleRate": _state["sr"]})


# Chatterbox is an autoregressive model designed for SHORT utterances: it has a
# hard ~1000-token generation cap (~40 s of audio) and its text↔audio alignment
# degrades on long inputs (skipped/garbled words). So a long script MUST be split
# into sentence-sized pieces and synthesized one at a time, then concatenated —
# otherwise everything past ~40 s is truncated and the rest comes out as babble.
_MAX_CHARS = 280
_SENT_SPLIT = re.compile(r"(?<=[.!?…。！？])\s+|\n+")
_CLAUSE_SPLIT = re.compile(r"(?<=[,;:、，])\s+")


def _split_text(text, max_chars=_MAX_CHARS):
    """Break text into <= max_chars chunks at sentence boundaries, packing whole
    sentences together for natural prosody and hard-wrapping any run-on sentence
    that exceeds the cap. Returns a list of non-empty chunk strings."""
    text = (text or "").strip()
    if not text:
        return []

    # 1) Sentence-ish units (split on sentence punctuation + newlines).
    units = []
    for sent in (s.strip() for s in _SENT_SPLIT.split(text)):
        if not sent:
            continue
        if len(sent) <= max_chars:
            units.append(sent)
            continue
        # 2) Run-on sentence → split on clause punctuation, then hard-wrap on spaces.
        for clause in (c.strip() for c in _CLAUSE_SPLIT.split(sent)):
            while len(clause) > max_chars:
                cut = clause.rfind(" ", 0, max_chars)
                if cut <= 0:
                    cut = max_chars
                units.append(clause[:cut].strip())
                clause = clause[cut:].strip()
            if clause:
                units.append(clause)

    # 3) Greedily pack adjacent units up to the cap (fewer model calls, smoother
    #    prosody) without ever exceeding it.
    chunks = []
    buf = ""
    for u in units:
        if not buf:
            buf = u
        elif len(buf) + 1 + len(u) <= max_chars:
            buf += " " + u
        else:
            chunks.append(buf)
            buf = u
    if buf:
        chunks.append(buf)
    return chunks


def cmd_clone(req):
    rid = req.get("id")
    text = (req.get("text") or "").strip()
    reference = req.get("reference")
    output = req.get("output")
    language = (req.get("language") or "es").lower()
    if not text:
        raise ValueError("empty text")
    if not reference or not os.path.exists(reference):
        raise ValueError("reference audio not found: %s" % reference)
    if not output:
        raise ValueError("no output path given")
    if _state["model"] is None or (
        language != "en" and _state["kind"] != "multilingual"
    ):
        # Lazy-load the right model for the requested language.
        cmd_load({"id": rid, "model": "english" if language == "en" else "multilingual",
                  "device": req.get("device", "auto")})

    import torch  # deferred
    import torchaudio as ta

    started = time.time()
    gen_kwargs = {"audio_prompt_path": reference}
    # Optional expressiveness controls (Chatterbox-specific); ignore if unsupported.
    for k_in, k_out in (("exaggeration", "exaggeration"), ("cfgWeight", "cfg_weight")):
        if isinstance(req.get(k_in), (int, float)):
            gen_kwargs[k_out] = float(req[k_in])
    if _state["kind"] == "multilingual":
        if language not in SUPPORTED_LANGS:
            raise ValueError("unsupported language: %s" % language)
        gen_kwargs["language_id"] = language

    sr = _state["sr"]
    chunks = _split_text(text) or [text]
    total_chars = sum(len(c) for c in chunks)
    # ~180 ms of silence between sentences so the joined audio breathes naturally.
    gap = torch.zeros(1, int(sr * 0.18), dtype=torch.float32)

    pieces = []
    for i, chunk in enumerate(chunks):
        # Per-chunk progress so the host can show a single smooth bar across the
        # whole script instead of one tqdm bar that resets every sentence.
        emit({"id": rid, "type": "progress", "stage": "generating",
              "chunk": i + 1, "chunks": len(chunks),
              "chunkChars": len(chunk), "totalChars": total_chars})
        wav = _state["model"].generate(chunk, **gen_kwargs)
        # `wav` is a torch tensor; torchaudio.save expects (channels, samples).
        if wav.dim() == 1:
            wav = wav.unsqueeze(0)
        wav = wav.detach().cpu().float()
        if pieces:
            pieces.append(gap)
        pieces.append(wav)

    emit({"id": rid, "type": "progress", "stage": "saving"})
    full = torch.cat(pieces, dim=-1) if len(pieces) > 1 else pieces[0]
    ta.save(output, full, sr)
    dur = float(full.shape[-1]) / sr
    emit({"id": rid, "type": "done", "output": output, "sampleRate": sr,
          "durationSec": round(dur, 3), "elapsedSec": round(time.time() - started, 2)})


def handle(req):
    cmd = req.get("cmd")
    rid = req.get("id")
    try:
        if cmd == "ping":
            emit({"id": rid, "type": "pong"})
        elif cmd == "load":
            cmd_load(req)
        elif cmd == "clone":
            cmd_clone(req)
        elif cmd == "shutdown":
            emit({"id": rid, "type": "bye"})
            raise SystemExit(0)
        else:
            emit({"id": rid, "type": "error", "error": "unknown cmd: %s" % cmd})
    except SystemExit:
        raise
    except Exception as e:  # report cleanly; never crash the loop
        emit({"id": rid, "type": "error", "error": str(e),
              "detail": traceback.format_exc(limit=3)})


def main():
    # Keep model downloads inside the app's cache dir if the host set HF_HOME.
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    cuda = False
    try:
        import torch  # noqa: F401 — probe only
        cuda = torch.cuda.is_available()
    except Exception:
        cuda = False
    emit({"type": "hello", "pid": os.getpid(), "cuda": bool(cuda)})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            emit({"type": "error", "error": "bad json"})
            continue
        handle(req)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        pass
    except KeyboardInterrupt:
        pass
