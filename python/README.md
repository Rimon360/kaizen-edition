# Voice-cloning sidecar (Chatterbox)

A standalone Python process the Electron app spawns to do **offline voice cloning**
with Resemble AI's official [Chatterbox](https://github.com/resemble-ai/chatterbox)
model (MIT — code *and* weights). It clones a voice from a short reference clip and
synthesizes arbitrary text in that voice, multilingual (incl. Spanish).

It is a **sidecar** because Chatterbox needs PyTorch/Python, which don't fit the
app's Node/JS runtime. The Electron main process talks to it over **line-delimited
JSON on stdio** (see the protocol in the docstring of `chatterbox_sidecar.py`).

## Why a bundled Python (not the system one)
PyTorch wheels target CPython **3.9–3.12**. The dev machine ships 3.14 (too new),
so the sidecar bundles its **own pinned Python 3.11** via PyInstaller — the app
never depends on whatever Python the user has (or doesn't have).

## Build the sidecar exe (Windows-first)
```bash
# 1. Use Python 3.11/3.12 in a clean venv
py -3.11 -m venv .venv && .venv\Scripts\activate

# 2. Install deps (CPU torch is smaller; install it first)
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

# 3. Smoke-test a real clone before packaging
#    (downloads the ~1.2 GB model to HF cache on first run)
python smoke_clone.py path\to\reference.wav "Hola, esta es una prueba." es out.wav

# 4. Build the standalone sidecar (onedir = faster start + easier to diff than onefile)
pyinstaller --onedir --name chatterbox-sidecar chatterbox_sidecar.py
#   → dist/chatterbox-sidecar/chatterbox-sidecar.exe
```

## How the app uses it
- The built `dist/chatterbox-sidecar/` folder is shipped via electron-builder
  `asarUnpack` (it's a native exe + DLLs, can't live inside the asar).
- On first use the **model (~1.2 GB) downloads** to the app's userData dir; the
  Electron side sets `HF_HOME` so it caches there (not the user's home).
- Output is 24 kHz mono WAV. Chatterbox embeds a mandatory **PerTh watermark** in
  every clip — keep it (abuse-mitigation / app-store compliance).

## Protocol (quick reference)
Requests (stdin, one JSON per line): `ping` · `load {model,device}` ·
`clone {reference,text,language,output}` · `shutdown`.
Responses (stdout): `hello` · `pong` · `progress {stage}` · `ready` ·
`done {output,sampleRate,durationSec,elapsedSec}` · `error`.
Full spec: top of `chatterbox_sidecar.py`.
