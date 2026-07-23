# Set up voice cloning for DEV mode ("npm run dev") - no PyInstaller needed.
# Creates python/.venv with PyTorch (CPU) + chatterbox-tts. The dev app then
# auto-uses this venv to run the cloning engine.
#
# REQUIRES Python 3.11 or 3.12 installed (torch has no 3.13/3.14 wheels).
# After it finishes, restart "npm run dev". The model (~3 GB) downloads to the
# app's userData on your first clone (Play preview / Export with a cloned voice).
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less .ps1 as
# the ANSI code page, so non-ASCII chars (em-dash, check marks) corrupt parsing.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$py = $null
foreach ($v in '3.11', '3.12') {
  try { & py "-$v" --version *> $null; if ($LASTEXITCODE -eq 0) { $py = "py -$v"; break } } catch {}
}
if (-not $py) {
  throw "Python 3.11 or 3.12 is required (none found). Install it from https://www.python.org/downloads/ and re-run."
}
Write-Host "Using $py"

if (Test-Path python/.venv) { Remove-Item -Recurse -Force python/.venv }
Invoke-Expression "$py -m venv python/.venv"
$pyexe = Join-Path $root 'python/.venv/Scripts/python.exe'

& $pyexe -m pip install --upgrade pip wheel
# Pin the exact CPU torch chatterbox-tts 0.1.7 requires (torch==2.6.0), so the
# chatterbox install finds it already satisfied instead of downloading a newer
# torch and then downgrading. The CPU index avoids pulling the multi-GB CUDA build.
& $pyexe -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw "Failed to install torch 2.6.0 (CPU)." }
& $pyexe -m pip install chatterbox-tts
if ($LASTEXITCODE -ne 0) { throw "Failed to install chatterbox-tts." }

# Verify the install is COMPLETE. A partial/half-resolved install (we hit one)
# leaves modules importable-by-name but broken at runtime, so actually import the
# heavy deps. Fail loudly here rather than at first clone.
Write-Host "Verifying the cloning env..."
& $pyexe -c "import torch, numpy, librosa, soundfile, torchaudio; import importlib.util as u; assert u.find_spec('chatterbox'), 'chatterbox not importable'; print('verify OK - torch', torch.__version__)"
if ($LASTEXITCODE -ne 0) { throw "Cloning env verification FAILED - install is incomplete. Re-run this script." }

Write-Host ""
Write-Host "[OK] Dev cloning env ready (python/.venv)."
Write-Host "     Restart 'npm run dev' - Play preview / Export with a cloned voice now works."
Write-Host "     (First clone downloads the ~3 GB model; it caches for next time.)"
