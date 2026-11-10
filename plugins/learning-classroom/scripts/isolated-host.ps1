# 学习课堂：隔离 DSH 环境（工单 01 真实宿主最小课堂）
#
# 目的：在**独立 DSH_HOME 与独立端口**上安装本分支的准确包，打开课堂、读写真实
# 知识库、并在课堂内使用真实标准 Session。正式 profile（$env:USERPROFILE\.dsh）
# 与正式宿主端口 3080 永远不被本脚本读写。
#
# 用法：
#   pwsh -File scripts/isolated-host.ps1 -Action setup     # 建隔离 home + profile
#   pwsh -File scripts/isolated-host.ps1 -Action provider  # 可选：复刻正式 profile 的模型路由（无密钥）
#   pwsh -File scripts/isolated-host.ps1 -Action pack      # 打出准确包并记录 SHA-256
#   pwsh -File scripts/isolated-host.ps1 -Action install   # 安装本目录的准确包
#   pwsh -File scripts/isolated-host.ps1 -Action seed      # 建隔离知识库样例（拒绝覆盖已有文件）
#   pwsh -File scripts/isolated-host.ps1 -Action start     # 前台启动隔离宿主（存在 provider 覆盖时自动 --patch）
#   pwsh -File scripts/isolated-host.ps1 -Action status    # 只读状态/哈希
#
# 模型凭据不由本脚本处理：本脚本不读取、不复制、不写入任何凭据。
# 需要模型时，由用户在隔离宿主的模型设置里自行配置；正式 profile 的凭据不得被自动搬运。
#
# 每个 Action 都打印它执行的**确切命令**，便于把同一条命令交给有写权限的执行者。

[CmdletBinding()]
param(
  [ValidateSet('setup', 'provider', 'pack', 'install', 'seed', 'start', 'status')]
  [string]$Action = 'status',
  [string]$Root = 'D:\programming\workspace\dsh-plugins\.research\lc-b2-01-runtime',
  [string]$Cli = 'D:\programming\workspace\deepseek-harness\apps\cli\lib\bin.js',
  [ValidateRange(1024, 65535)]
  [int]$Port = 3091,
  [string]$ProfileName = 'lc-b2-01'
)

$ErrorActionPreference = 'Stop'
$plugin = Split-Path -Parent $PSScriptRoot
$home_ = Join-Path $Root 'home'
$vault = Join-Path $Root 'vault'

# 隔离守卫：绝不落进正式 profile，绝不占用正式宿主端口。
$official = Join-Path $env:USERPROFILE '.dsh'
if ((Resolve-Path -LiteralPath $Root -ErrorAction SilentlyContinue) -eq (Resolve-Path -LiteralPath $official -ErrorAction SilentlyContinue)) {
  throw "拒绝在正式 DSH profile（$official）里运行隔离测试。"
}
if ([IO.Path]::GetFullPath($home_).StartsWith([IO.Path]::GetFullPath($official), [StringComparison]::OrdinalIgnoreCase)) {
  throw "拒绝把 DSH_HOME 放在正式 profile 内：$home_"
}
if ($Port -eq 3080) {
  throw '拒绝使用正式宿主端口 3080；隔离宿主请用 3091 等其它端口。'
}

function Show-Plan([string]$name, [string[]]$lines) {
  Write-Host ""
  Write-Host "== $name ==" -ForegroundColor Cyan
  $lines | ForEach-Object { Write-Host "  $_" }
}

function Invoke-Host([string[]]$arguments) {
  $env:DSH_HOME = $home_
  & node $Cli @arguments
  if ($LASTEXITCODE -ne 0) { throw "dsh 退出码 $LASTEXITCODE：$($arguments -join ' ')" }
}

switch ($Action) {
  'provider' {
    # 可选：复刻正式 profile 的模型路由（opencode-go / deepseek-v4.1-flash）。
    # 只抽取与模型路由有关的顶层 patch 条目，逐字保留（不重写、不猜测字段），
    # 并拒绝任何看起来携带密钥字面量的条目。凭据不由本脚本处理。
    $idAllow = @('llm-deepseek', 'agent-default-model', 'llm-pi-ai')
    $sourcePatch = Join-Path $official 'profiles\web\cordis.patch.yml'
    if (-not (Test-Path $sourcePatch)) { throw "找不到正式 profile 配置：$sourcePatch" }
    $target = Join-Path $Root 'provider.patch.yml'
    New-Item -ItemType Directory -Force -Path $Root | Out-Null

    $blocks = @()
    $current = $null
    foreach ($line in Get-Content -LiteralPath $sourcePatch) {
      if ($line -match '^- ') {
        if ($null -ne $current) { $blocks += , $current }
        $current = @($line)
      } elseif ($null -ne $current) {
        $current += $line
      }
    }
    if ($null -ne $current) { $blocks += , $current }

    $selected = @($blocks | Where-Object {
      $first = $_[0]
      $first -match '^- id:\s*(\S+)\s*$' -and ($idAllow -contains $matches[1])
    })
    $ids = @($selected | ForEach-Object { ([regex]::Match($_[0], '^- id:\s*(\S+)\s*$')).Groups[1].Value })
    $missing = @($idAllow | Where-Object { $ids -notcontains $_ })
    if ($missing.Count -gt 0) {
      throw "正式 profile 配置里缺少这些条目，无法安全复刻：$($missing -join ', ')。若正式环境没有自定义模型路由，直接跳过本 Action 使用模板默认（deepseek-official / deepseek-flash）。"
    }

    $joined = ($selected | ForEach-Object { $_ -join "`n" }) -join "`n"
    if ($joined -match '(?im)^\s*(apiKey|token|secret|password)\s*:\s*\S') {
      throw '抽出的条目里出现疑似密钥字面量，拒绝写入隔离配置；请人工核对正式 profile 配置。'
    }
    [IO.File]::WriteAllText($target, ($joined + "`n"), (New-Object Text.UTF8Encoding($false)))

    $declared = @(Select-String -Path $target -Pattern '^\s*(apiKeyEnv|provider|model|baseURL)\s*:\s*\S' |
      ForEach-Object { $_.Line.Trim() })
    Show-Plan '已写入隔离 provider 覆盖（逐字抽取，无密钥字面量）' @(
      "来源 = $sourcePatch",
      "目标 = $target",
      "条目 = $($ids -join ', ')",
      "字段 = $($declared -join ' | ')"
    )
    Write-Host 'start 会自动带上 --patch 这个文件；模型由用户在隔离宿主里自行配置，该路由期望的凭据名见上面的 apiKeyEnv。' -ForegroundColor Yellow
  }

  'setup' {
    New-Item -ItemType Directory -Force -Path $home_, $vault | Out-Null
    Show-Plan '隔离环境' @(
      "DSH_HOME = $home_",
      "知识库   = $vault",
      "宿主 CLI = $Cli",
      "profile  = $ProfileName（来自出厂 web 模板，不复制正式 profile 的定制/凭据）"
    )
    Show-Plan '确切命令' @(
      "`$env:DSH_HOME = '$home_'",
      "node '$Cli' --profile $ProfileName --from-default-profile web --dump-config"
    )
    Invoke-Host @('--profile', $ProfileName, '--from-default-profile', 'web', '--dump-config') |
      Out-File -Encoding utf8 (Join-Path $Root 'dump-config.txt')
    Write-Host "已写入 $(Join-Path $Root 'dump-config.txt')" -ForegroundColor Green
  }

  'pack' {
    $archiveDir = Join-Path $Root 'archives'
    New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null
    Show-Plan '确切命令' @(
      "cd '$plugin'",
      "pnpm pack --pack-destination '$archiveDir'"
    )
    Push-Location $plugin
    try { & pnpm pack --pack-destination $archiveDir } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "打包失败（退出码 $LASTEXITCODE）" }
    $archive = Get-ChildItem $archiveDir -Filter '*.tgz' | Sort-Object LastWriteTime | Select-Object -Last 1
    $hash = (Get-FileHash $archive.FullName -Algorithm SHA256).Hash.ToLower()
    $receipt = [pscustomobject]@{
      archive = $archive.FullName
      bytes = $archive.Length
      sha256 = $hash
      hostVersion = (& node $Cli --version)
      built = @(Get-ChildItem (Join-Path $plugin 'lib') -ErrorAction SilentlyContinue |
        ForEach-Object { [pscustomobject]@{ file = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower() } })
    }
    $receipt | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 (Join-Path $Root 'package.json.receipt.json')
    $receipt | ConvertTo-Json -Depth 5
  }

  'install' {
    $lib = Join-Path $plugin 'lib\index.js'
    $client = Join-Path $plugin 'lib\client.js'
    if (-not (Test-Path $lib) -or -not (Test-Path $client)) {
      throw "先构建插件：在 $plugin 运行 pnpm build（需要 lib/index.js 与 lib/client.js）。"
    }
    # Prefer the recorded archive so the installed bytes have a hash receipt;
    # fall back to the directory (pnpm writes a link:) when nothing was packed.
    $target = Get-ChildItem (Join-Path $Root 'archives') -Filter '*.tgz' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime | Select-Object -Last 1
    $source = if ($target) { $target.FullName } else { $plugin }
    $kind = if ($target) { '准确包' } else { '目录链接（未打包含，无包哈希）' }
    Show-Plan "安装来源：$kind" @(
      "`$env:DSH_HOME = '$home_'",
      "node '$Cli' plugin --profile $ProfileName add '$source' --ignore-scripts --config.auto-install-peers=false"
    )
    Invoke-Host @('plugin', '--profile', $ProfileName, 'add', $source, '--ignore-scripts', '--config.auto-install-peers=false')
    $manifest = Join-Path $home_ "profiles\$ProfileName\package.json"
    Write-Host "已写入 profile 清单：$manifest" -ForegroundColor Green
  }

  'seed' {
    Show-Plan '隔离知识库样例' @(
      "$vault\概率论\讲义\01-样本空间.md（含公式、代码、表格）",
      "$vault\概率论\笔记\我的笔记.md",
      "$vault\概率论\脉络.canvas（JSON Canvas 1.0）"
    )
    & node (Join-Path $PSScriptRoot 'seed-vault.mjs') $vault
    if ($LASTEXITCODE -ne 0) { throw "知识库样例生成失败（退出码 $LASTEXITCODE）" }
  }

  'start' {
    $overlay = Join-Path $Root 'provider.patch.yml'
    $patchArgs = if (Test-Path -LiteralPath $overlay) { @('--patch', $overlay) } else { @() }
    $plan = @(
      "`$env:DSH_HOME = '$home_'",
      "node '$Cli' --profile $ProfileName $($patchArgs -join ' ') --no-open --host 127.0.0.1 --port $Port"
    )
    if ($patchArgs.Count -eq 0) {
      $plan += '（未发现 provider.patch.yml：使用模板默认 deepseek-official / deepseek-flash）'
    }
    Show-Plan '确切命令（前台；DevTools 用 host.log 里的一次性认证 URL）' $plan
    Write-Host "3080 不受影响；本隔离宿主监听 127.0.0.1:$Port" -ForegroundColor Yellow
    Invoke-Host (@('--profile', $ProfileName) + $patchArgs + @('--no-open', '--host', '127.0.0.1', '--port', $Port))
  }

  'status' {
    $built = Get-ChildItem (Join-Path $plugin 'lib') -ErrorAction SilentlyContinue |
      ForEach-Object { [pscustomobject]@{ file = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower() } }
    $archive = Get-ChildItem (Join-Path $Root 'archives') -Filter '*.tgz' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime | Select-Object -Last 1
    # 本脚本不检查、不读取、也不统计凭据：模型配置由用户在隔离宿主里自行完成。
    [pscustomobject]@{
      root = $Root
      home = $home_
      vault = $vault
      vaultSeeded = (Test-Path (Join-Path $vault '概率论\讲义\01-样本空间.md'))
      hostCli = $Cli
      hostVersion = (& node $Cli --version)
      pluginVersion = (Get-Content (Join-Path $plugin 'package.json') -Raw | ConvertFrom-Json).version
      enginesDsh = (Get-Content (Join-Path $plugin 'package.json') -Raw | ConvertFrom-Json).engines.dsh
      profile = $ProfileName
      port = $Port
      profileReady = (Test-Path (Join-Path $home_ "profiles\$ProfileName"))
      built = @($built)
      archive = if ($archive) {
        [pscustomobject]@{ path = $archive.FullName; bytes = $archive.Length; sha256 = (Get-FileHash $archive.FullName -Algorithm SHA256).Hash.ToLower() }
      } else { $null }
    } | ConvertTo-Json -Depth 5
  }
}
