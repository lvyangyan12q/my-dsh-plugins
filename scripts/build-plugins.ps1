$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$env:DSH_SOURCE = 'D:/programming/workspace/deepseek-harness'
Set-Location -LiteralPath $taskRepo
& 'D:/programming/nodejs/node.exe' scripts/build-release.mjs
exit $LASTEXITCODE
