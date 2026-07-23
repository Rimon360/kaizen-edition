# Build the Chatterbox voice-cloning sidecar into a standalone exe.
# RUN THIS ON A MACHINE WITH PYTHON 3.11 OR 3.12 (PyTorch has no 3.13/3.14 wheels).
# Output: python/dist/chatterbox-sidecar/chatterbox-sidecar.exe
#
# After it succeeds: uncomment the "extraResources" block in electron-builder.yml,
# then run "npm run build:win" to bundle it into the installer.
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 mis-decodes BOM-less
# non-ASCII as ANSI and breaks parsing).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Pick a compatible interpreter (prefer 3.11, then 3.12).
$py = $null
foreach ($v in '3.11', '3.12') {
  try { & py "-$v" --version *> $null; if ($LASTEXITCODE -eq 0) { $py = "py -$v"; break } } catch {}
}
if (-not $py) { throw "Python 3.11 or 3.12 is required (found none). Install from python.org, then re-run." }
Write-Host "Using $py"

# Clean venv
if (Test-Path python/.venv) { Remove-Item -Recurse -Force python/.venv }
Invoke-Expression "$py -m venv python/.venv"
$pyexe = "python/.venv/Scripts/python.exe"

& $pyexe -m pip install --upgrade pip wheel
# Pin the exact CPU torch chatterbox-tts requires (==2.6.0) so it isn't downloaded
# then downgraded. CPU index keeps the (already large) bundle from pulling CUDA.
& $pyexe -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw "Failed to install torch 2.6.0 (CPU)." }
& $pyexe -m pip install -r python/requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Failed to install python/requirements.txt." }

# Verify the env is complete before the (slow) PyInstaller step. A half-resolved
# install passes name checks but breaks at runtime.
& $pyexe -c "import torch, numpy, librosa, soundfile, torchaudio; import importlib.util as u; assert u.find_spec('chatterbox'), 'chatterbox not importable'; print('verify OK - torch', torch.__version__)"
if ($LASTEXITCODE -ne 0) { throw "Env verification FAILED - install is incomplete. Re-run." }

# PyInstaller: torch + transformers + chatterbox don't bundle cleanly with defaults
# (the exe builds but crashes on import from missing submodules, data files, or the
# package metadata transformers reads at runtime). These flags collect all of it.
# torch itself is handled by PyInstaller's built-in hook, so we only copy its metadata.
& $pyexe -m PyInstaller `
  --onedir --noconfirm --clean `
  --name chatterbox-sidecar `
  --distpath python/dist `
  --workpath python/build `
  --specpath python `
  --collect-all chatterbox `
  --collect-all s3tokenizer `
  --collect-all perth `
  --collect-all conformer `
  --collect-all pykakasi `
  --collect-all omegaconf `
  --collect-data librosa `
  --collect-data transformers `
  --collect-data diffusers `
  --copy-metadata torch `
  --copy-metadata torchaudio `
  --copy-metadata transformers `
  --copy-metadata diffusers `
  --copy-metadata tokenizers `
  --copy-metadata safetensors `
  --copy-metadata huggingface-hub `
  --copy-metadata numpy `
  --copy-metadata tqdm `
  --copy-metadata regex `
  --copy-metadata requests `
  --copy-metadata packaging `
  --copy-metadata filelock `
  --copy-metadata pyyaml `
  python/chatterbox_sidecar.py
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed." }

$exe = Join-Path $root 'python/dist/chatterbox-sidecar/chatterbox-sidecar.exe'
if (-not (Test-Path $exe)) { throw "Build produced no exe at $exe" }

# Prove the bundled exe actually WORKS, not just that it built. Run it via
# Start-Process with file redirection: the model prints harmless deprecation
# warnings to stderr, and PowerShell (ErrorActionPreference=Stop) would otherwise
# turn ANY native stderr into a fatal NativeCommandError. This is informational,
# so never let it abort the build.
$ErrorActionPreference = 'Continue'
$inF = Join-Path $env:TEMP 'kz_verify_in.txt'
$outF = Join-Path $env:TEMP 'kz_verify_out.txt'
$errF = Join-Path $env:TEMP 'kz_verify_err.txt'
$model = Join-Path $root 'python/model'
$haveModel = Test-Path (Join-Path $model 't3_mtl23ls_v2.safetensors')
if ($haveModel) {
  Write-Host "Verifying the exe can load the model (this exercises all bundled imports)..."
  $env:KAIZEN_MODEL_DIR = $model
  $env:HF_HUB_OFFLINE = '1'; $env:TRANSFORMERS_OFFLINE = '1'
  '{"id":1,"cmd":"load"}' | Out-File $inF -Encoding ascii
} else {
  Write-Host "Pinging the bundled exe (stage the model with 'npm run model:stage' for a full test)..."
  '{"id":1,"cmd":"ping"}' | Out-File $inF -Encoding ascii
}
Start-Process -FilePath $exe -NoNewWindow -Wait `
  -RedirectStandardInput $inF -RedirectStandardOutput $outF -RedirectStandardError $errF
$verifyOut = if (Test-Path $outF) { Get-Content $outF -Raw } else { '' }
if ($verifyOut -match '"type":\s*"(ready|pong|hello)"') {
  Write-Host "[OK] Bundled exe works ($(if ($haveModel) { 'loaded the model' } else { 'answered ping' }))."
} else {
  Write-Host "[WARN] exe did not respond as expected. stdout / stderr tails:"
  if (Test-Path $outF) { Get-Content $outF -Tail 6 }
  if (Test-Path $errF) { Get-Content $errF -Tail 6 }
  Write-Host "       If a module is missing, add it as --collect-all / --hidden-import and re-run."
}

Write-Host ""
Write-Host "[OK] Sidecar built -> python/dist/chatterbox-sidecar/chatterbox-sidecar.exe"
Write-Host "     Next: 'npm run model:stage' (if not done), uncomment 'extraResources'"
Write-Host "     in electron-builder.yml, then 'npm run build:win'."
