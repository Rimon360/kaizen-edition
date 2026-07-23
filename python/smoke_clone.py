#!/usr/bin/env python3
"""
Quick manual clone test (bypasses the JSON sidecar protocol) — used to validate
the model end-to-end before packaging. Downloads the ~1.2 GB model on first run.

Usage:
  python smoke_clone.py <reference.wav> "<text>" [lang=es] [out.wav]

Requires a Python 3.11/3.12 env with `chatterbox-tts` installed (see README.md).
"""
import sys
import time


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    ref = sys.argv[1]
    text = sys.argv[2]
    lang = sys.argv[3] if len(sys.argv) > 3 else "es"
    out = sys.argv[4] if len(sys.argv) > 4 else "clone_out.wav"

    import torch
    import torchaudio as ta

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[smoke] device={dev}  loading multilingual Chatterbox (first run downloads ~1.2 GB)…")
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    t0 = time.time()
    model = ChatterboxMultilingualTTS.from_pretrained(device=dev)
    print(f"[smoke] model loaded in {time.time() - t0:.1f}s; synthesizing…")

    t1 = time.time()
    wav = model.generate(text, language_id=lang, audio_prompt_path=ref)
    if wav.dim() == 1:
        wav = wav.unsqueeze(0)
    sr = int(getattr(model, "sr", 24000))
    ta.save(out, wav.cpu(), sr)
    dur = wav.shape[-1] / sr
    rtf = (time.time() - t1) / dur if dur else 0
    print(f"[smoke] wrote {out}  ({dur:.2f}s audio @ {sr} Hz)  in {time.time() - t1:.1f}s  (RTF={rtf:.2f})")


if __name__ == "__main__":
    main()
