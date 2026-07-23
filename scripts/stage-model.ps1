# Stage the Chatterbox voice model into python/model so it can be BUNDLED into the
# installer (users then download nothing but the app). Copies the 6 multilingual
# weight files (~3 GB) that ChatterboxMultilingualTTS.from_local() needs.
#
# Uses the dev venv's huggingface_hub: pulls from the HF cache if the model was
# already downloaded, otherwise downloads it once. Run AFTER "npm run sidecar:dev".
#
# After this, uncomment the extraResources block in electron-builder.yml and build.
# Keep this file ASCII-only (Windows PowerShell mis-decodes BOM-less non-ASCII).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$venv = Join-Path $root 'python/.venv/Scripts/python.exe'
if (-not (Test-Path $venv)) { throw "python/.venv not found. Run 'npm run sidecar:dev' first." }

$dest = Join-Path $root 'python/model'
Write-Host "Staging Chatterbox model -> python/model (~3 GB; uses cache if present)..."
& $venv -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='ResembleAI/chatterbox', allow_patterns=['ve.pt','t3_mtl23ls_v2.safetensors','s3gen.pt','grapheme_mtl_merged_expanded_v1.json','conds.pt','Cangjie5_TC.json'], local_dir=r'$dest')"
if ($LASTEXITCODE -ne 0) { throw "Model staging FAILED." }

# Sanity: the large T3 weights file must be present, or from_local() will fail.
$t3 = Join-Path $dest 't3_mtl23ls_v2.safetensors'
if (-not (Test-Path $t3)) { throw "Staging incomplete: t3_mtl23ls_v2.safetensors missing." }

$sz = (Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("[OK] Model staged to python/model ({0:N2} GB)." -f ($sz / 1GB))
Write-Host "     Next: uncomment 'extraResources' in electron-builder.yml, then 'npm run build:win'."
