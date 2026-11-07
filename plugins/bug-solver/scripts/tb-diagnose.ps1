<#
只读诊断：根据缺陷（或指定容器）连测试服务器，取容器状态、运行版本与最近报错日志。

设计约束（务必保持）：
  * 只执行只读命令：docker ps / docker inspect / docker logs / date。
  * 不写、不重启、不删除任何容器或文件，不接受任意远端命令输入。
  * 不读取、不打印、不保存任何口令或私钥内容；SSH 走本机已有密钥。

用法：
  pwsh -NoProfile -File scripts\tb-diagnose.ps1 -Bug 3083
  pwsh -NoProfile -File scripts\tb-diagnose.ps1 -Container docker-dcim-web-1 -Lines 300
  pwsh -NoProfile -File scripts\tb-diagnose.ps1 -Bug 3083 -Server test -Out data\diag
#>
[CmdletBinding()]
param(
  [string]$Bug,
  [string]$Container,
  [string]$Server = 'test',
  [int]$Lines = 200,
  [string]$Out
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$Root = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $Root 'config\herdr-env.json'
$BugsDir = Join-Path $Root 'data\bugs'

function Write-Info($msg) { Write-Host "[diag] $msg" }
function Write-Warn2($msg) { Write-Host "[diag] $msg" -ForegroundColor Yellow }
function Write-Err2($msg) { Write-Host "[diag] $msg" -ForegroundColor Red }

if (-not (Test-Path $ConfigPath)) { Write-Err2 "缺少配置：$ConfigPath"; exit 1 }
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$srv = $cfg.servers | Where-Object { $_.name -eq $Server } | Select-Object -First 1
if (-not $srv) { Write-Err2 "配置里没有服务器 '$Server'（可选：$(($cfg.servers | ForEach-Object { $_.name }) -join ', ')）"; exit 1 }

# ---------- 找缺陷 ----------
$bugObj = $null
if ($Bug) {
  if (Test-Path $BugsDir) {
    foreach ($f in Get-ChildItem $BugsDir -Filter *.json) {
      try {
        $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
        $hit = $data.bugs | Where-Object { "$($_.uid)" -eq "$Bug" -or "$($_.id)" -eq "$Bug" } | Select-Object -First 1
        if ($hit) { $bugObj = $hit; break }
      } catch { }
    }
  }
  if (-not $bugObj) { Write-Warn2 "本地数据里没有编号 $Bug 的缺陷（可先点“立即拉取”再诊断）" }
}

$bugServices = @()
if ($bugObj -and $bugObj.env -and $bugObj.env.services) { $bugServices = @($bugObj.env.services) }

Write-Info ("缺陷：{0}" -f ($(if ($bugObj) { "#$($bugObj.uid) $($bugObj.t)" } else { '(未指定)' })))
if ($bugObj) {
  Write-Info ("状态：{0} / 负责人：{1} / 更新：{2}" -f $bugObj.st, $bugObj.ex, $bugObj.updated)
}
if ($bugServices.Count) { Write-Info ("缺陷报告的服务版本：{0}" -f ($bugServices -join ' | ')) }

# ---------- 服务 → 容器 ----------
$targets = @()
if ($Container) {
  $targets = @([pscustomobject]@{ container = $Container; repo = $null; services = @() })
} else {
  foreach ($svc in $bugServices) {
    foreach ($s in $cfg.services) {
      $hit = $false
      foreach ($m in @($s.match)) {
        if ($svc -and $svc.ToString().ToLower().Contains($m.ToString().ToLower())) { $hit = $true; break }
      }
      if ($hit) {
        $existing = $targets | Where-Object { $_.container -eq $s.container } | Select-Object -First 1
        if ($existing) {
          $existing.services = @($existing.services) + $svc
        } else {
          $targets += [pscustomobject]@{ container = $s.container; repo = $s.repo; services = @($svc) }
        }
        if ($s.repo) {
          $cur = $targets | Where-Object { $_.container -eq $s.container } | Select-Object -First 1
          if ($cur -and -not $cur.repo) { $cur.repo = $s.repo }
        }
        break
      }
    }
  }
}
if (-not $targets.Count) {
  Write-Warn2 '没有匹配到容器：请用 -Container 指定，或在 config\herdr-env.json 里补 services 映射。'
  if (-not $Bug) { exit 2 }
}

# ---------- SSH 执行只读命令 ----------
$keyPath = $srv.keyPath
if ($keyPath -like '~*') { $keyPath = Join-Path $env:USERPROFILE ($keyPath -replace '^[~][/\\]?', '') }
$sshBase = @(
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=8',
  '-o', 'StrictHostKeyChecking=yes',
  '-o', 'IdentitiesOnly=yes',
  '-p', "$($srv.port)"
)
if (Test-Path $keyPath) { $sshBase += @('-i', $keyPath) }
$remote = "$($srv.user)@$($srv.host)"

function Invoke-Remote([string]$Command) {
  $out = & ssh @sshBase $remote $Command 2>&1
  return [pscustomobject]@{ code = $LASTEXITCODE; text = ($out -join "`n") }
}

Write-Info ("连接 {0}（{1}）只读诊断…" -f $remote, $srv.note)
$probe = Invoke-Remote 'hostname'
if ($probe.code -ne 0) {
  Write-Err2 "SSH 连接失败（exit=$($probe.code)）：$($probe.text)"
  Write-Warn2 '检查：VPN/网络、端口、密钥授权；本脚本不重试，也不修改服务器。'
  exit 3
}
Write-Info ("远端主机：{0}" -f $probe.text.Trim())

$report = New-Object System.Collections.Generic.List[string]
$report.Add("# TB 缺陷诊断 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$report.Add("")
$report.Add("- 服务器：$remote ($($srv.note)) / 主机名 $($probe.text.Trim())")
if ($bugObj) {
  $report.Add("- 缺陷：#$($bugObj.uid) $($bugObj.t)")
  $report.Add("- 状态：$($bugObj.st) / 负责人：$($bugObj.ex)")
  $report.Add("- TB 链接：https://tb.cet-electric.com:4753/task/$($bugObj.id)")
}
if ($bugServices.Count) { $report.Add("- 缺陷报告版本：$($bugServices -join ' | ')") }
$report.Add("")

foreach ($t in $targets) {
  $c = $t.container
  Write-Host ''
  Write-Info "==== 容器 $c ===="
  $report.Add("## 容器 $c")

  $ps = Invoke-Remote "docker ps -a --filter name=^/${c}$ --format '{{.Names}}|{{.Image}}|{{.Status}}'"
  if ($ps.code -ne 0 -or -not $ps.text.Trim()) {
    Write-Warn2 "未找到容器（或 docker 不可用）：$($ps.text.Trim())"
    $report.Add("- 容器未找到：$($ps.text.Trim())")
    continue
  }
  Write-Host "  状态：$($ps.text.Trim())"
  $report.Add("- 状态：$($ps.text.Trim())")

  $runImage = ($ps.text.Trim() -split '\|')[1]
  if ($runImage) {
    # 只和“映射到这个容器的那些服务”比版本，避免拿前端的版本去比后端容器
    $reportTags = @()
    foreach ($svc in @($t.services)) {
      if ($svc -and ($svc -match ':\s*([^:\s]+)\s*$')) { $reportTags += $Matches[1] }
    }
    $runTag = ''
    if ($runImage -match ':\s*([^:\s]+)\s*$') { $runTag = $Matches[1] }
    if ($runTag) {
      $report.Add("- 运行镜像版本：$runTag")
      if ($reportTags.Count -and ($reportTags -notcontains $runTag)) {
        $msg = "缺陷报告版本 $($reportTags -join '/') ≠ 运行版本 $runTag"
        Write-Warn2 "  ⚠ $msg"
        $report.Add("- ⚠ 版本差异：$msg")
      } elseif ($reportTags.Count) {
        Write-Host "  版本一致：$runTag"
        $report.Add("- 版本一致：$runTag")
      }
    }
  }

  $meta = Invoke-Remote "docker inspect --format '{{.State.StartedAt}}|{{.RestartCount}}|{{.Config.Image}}' $c"
  if ($meta.code -eq 0 -and $meta.text.Trim()) {
    $parts = $meta.text.Trim() -split '\|'
    Write-Host ("  启动时间：{0}  重启次数：{1}" -f $parts[0], $parts[1])
    $report.Add("- 启动时间：$($parts[0]) / 重启次数：$($parts[1])")
  }

  # 只挑真正的错误行：先按关键字筛，再排除 INFO 行（避免 markTimeout 之类误命中）
  $logs = Invoke-Remote "docker logs --tail $Lines $c 2>&1 | grep -Ei 'error|exception|caused by|traceback|fatal|refused|outofmemory' | grep -v ' - INFO - ' | tail -n 40"
  $logText = ''
  if ($logs.code -eq 0 -and $logs.text.Trim()) { $logText = $logs.text.Trim() }
  if ($logText) {
    Write-Host '  最近报错（截取 40 行）：'
    $logText -split "`n" | Select-Object -First 40 | ForEach-Object { Write-Host "    $_" }
    $report.Add("")
    $report.Add("### 最近报错（tail $Lines，过滤 error/exception/failed）")
    $report.Add('```')
    $report.Add($logText)
    $report.Add('```')
  } else {
    Write-Host '  最近日志里没有匹配到报错关键字（可加大 -Lines 或直接看全量日志）'
    $report.Add('- 最近日志未匹配到报错关键字')
  }

  if ($t.repo) {
    $repo = $t.repo
    Write-Host "  本地代码库：$repo"
    $report.Add("")
    $report.Add("- 本地代码库：$repo")
    if (Test-Path (Join-Path $repo '.git')) {
      $head = & git -C $repo log -1 --format='%h %ad %s' --date=short 2>$null
      $branch = & git -C $repo rev-parse --abbrev-ref HEAD 2>$null
      $origin = & git -C $repo remote get-url origin 2>$null
      Write-Host "    分支：$branch / HEAD：$head"
      $report.Add("- 分支：$branch / HEAD：$head")
      $report.Add("- origin：$origin")
    } else {
      Write-Warn2 "    本地仓库路径不存在或不是 git 仓库"
      $report.Add('- 本地仓库路径不存在或不是 git 仓库')
    }
  } else {
    Write-Host '  代码库：未配置（在 config\herdr-env.json 的 repo 字段补充）'
    $report.Add('- 代码库：未配置')
  }
  $report.Add("")
}

Write-Info '诊断完成（只读，未修改任何远端状态）'

if ($Out) {
  $outDir = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $Root $Out }
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
  $name = if ($bugObj) { "$($bugObj.uid)" } else { ($targets | Select-Object -First 1).container }
  $file = Join-Path $outDir ("{0}-{1}.md" -f $name, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $report -join "`n" | Set-Content -Path $file -Encoding UTF8
  Write-Info "已保存：$file"
}
