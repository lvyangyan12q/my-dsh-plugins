param([ValidateRange(1024,65535)][int]$Port = 3080)
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$env:DSH_SOURCE = 'D:/programming/workspace/deepseek-harness'
Set-Location -LiteralPath $taskRepo
& 'D:/programming/nodejs/node.exe' 'D:/programming/workspace/deepseek-harness/apps/cli/lib/bin.js' --profile web --no-open --host 127.0.0.1 --port $Port
exit $LASTEXITCODE
