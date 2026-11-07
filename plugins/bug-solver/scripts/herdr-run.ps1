<#
herdr 一键分屏：右侧跑只读诊断，下方起一个 Claude 分析该缺陷。

必须在 herdr 会话内的 pane 里运行（HERDR_ENV=1），因为 herdr 不允许从会话外部控制它。

用法（在窗口3 的 herdr pane 里）：
  pwsh -NoProfile -File scripts\herdr-run.ps1 -Bug 3083
  pwsh -NoProfile -File scripts\herdr-run.ps1 -Bug 3083 -AgentName dcom-bug -Kind claude
  pwsh -NoProfile -File scripts\herdr-run.ps1 -Bug 3083 -NoAgent          # 只开诊断 pane
  pwsh -NoProfile -File scripts\herdr-run.ps1 -Bug 3083 -DryRun           # 只打印将执行的命令

行为：
  1) 右侧 split 一个新 pane，运行 scripts\tb-diagnose.ps1（只读 SSH 诊断）；
  2) 下方再 split 一个 pane，用 herdr 起指定 kind 的 agent；
  3) 把缺陷上下文（标题/编号/服务版本/容器/仓库）作为 prompt 发给该 agent，等它进入空闲。

任何一步失败都只打印手工步骤并停止，不重试、不关闭任何 pane、不修改远端。
#>
[CmdletBinding()]
param(
  [string]$Bug,
  [string]$Kind = 'claude',
  [string]$AgentName = 'bugfix',
  [string]$Server = 'test',
  [int]$Lines = 200,
  [switch]$NoAgent,
  [switch]$DryRun
)

$Root = Split-Path -Parent $PSScriptRoot
$steps = New-Object System.Collections.Generic.List[string]

function Say($m) { Write-Host "[herdr] $m" }
function Warn($m) { Write-Host "[herdr] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "[herdr] $m" -ForegroundColor Red }

$inHerdr = ($env:HERDR_ENV -eq '1')
if (-not $inHerdr -and -not $DryRun) {
  Warn '当前不在 herdr 会话内（HERDR_ENV != 1）。'
  Say  '请在 工作台 → 窗口3（终端）里先运行 herdr，再在 herdr 的 pane 里执行本脚本。'
  Say  '手工步骤：'
  Say  '  1) 窗口3 输入 herdr 进入 TUI'
  Say  '  2) Ctrl+Shift+右键（或 herdr 的 split）向右分一个 pane，运行：'
  Say  "     pwsh -NoProfile -File scripts\tb-diagnose.ps1 -Bug $Bug -Server $Server -Lines $Lines"
  Say  '  3) 下方再分一个 pane，运行 claude，然后把诊断结论贴给它'
  exit 0
}

# ---------- 缺陷上下文 ----------
$bugObj = $null
$bugsDir = Join-Path $Root 'data\bugs'
if ($Bug -and (Test-Path $bugsDir)) {
  foreach ($f in Get-ChildItem $bugsDir -Filter *.json) {
    try {
      $d = Get-Content $f.FullName -Raw | ConvertFrom-Json
      $hit = $d.bugs | Where-Object { "$($_.uid)" -eq "$Bug" -or "$($_.id)" -eq "$Bug" } | Select-Object -First 1
      if ($hit) { $bugObj = $hit; break }
    } catch { }
  }
}

$bugLabel = if ($bugObj) { "#$($bugObj.uid) $($bugObj.t)" } elseif ($Bug) { "#$Bug" } else { '(未指定缺陷)' }
Say "缺陷：$bugLabel"

$svcLine = if ($bugObj -and $bugObj.env -and $bugObj.env.services) { ($bugObj.env.services -join ' | ') } else { '(无)' }
$repoLine = '(未配置)'
$envCfg = Join-Path $Root 'config\herdr-env.json'
if (Test-Path $envCfg) {
  try {
    $cfg = Get-Content $envCfg -Raw | ConvertFrom-Json
    $repos = @()
    foreach ($s in $cfg.services) {
      if ($s.repo) {
        foreach ($svc in @($bugObj.env.services)) {
          foreach ($m in @($s.match)) {
            if ($svc -and $svc.ToString().ToLower().Contains($m.ToString().ToLower())) { $repos += $s.repo; break }
          }
        }
      }
    }
    $repos = $repos | Select-Object -Unique
    if ($repos.Count) { $repoLine = ($repos -join ' , ') }
  } catch { }
}

$diagCmd = "pwsh -NoProfile -File `"$Root\scripts\tb-diagnose.ps1`" -Bug $Bug -Server $Server -Lines $Lines -Out data\diag"
$prompt = @"
你在帮忙分析一个 Teambition 缺陷，只读排查，不要修改服务器。

缺陷：$bugLabel
状态：$(if ($bugObj) { $bugObj.st } else { '-' })，负责人：$(if ($bugObj) { $bugObj.ex } else { '-' })
TB 链接：https://tb.cet-electric.com:4753/task/$(if ($bugObj) { $bugObj.id } else { '' })
缺陷报告的服务版本：$svcLine
相关本地代码库：$repoLine

旁边那个 pane 里正在跑只读诊断（scripts\tb-diagnose.ps1）：它会 ssh 到测试服务器，取容器状态、运行镜像版本和最近报错日志，结果也会保存到 data\diag\。

请做这些事：
1. 读旁边 pane 的输出（或 data\diag 下最新的 md），列出：容器状态、运行版本、报错关键行；
2. 对比“缺陷报告版本”和“运行版本”，明确指出是否存在版本漂移导致问题不可复现；
3. 结合缺陷描述与日志，给出最可能的根因（按可能性排序），以及还需要哪些信息才能确认；
4. 如果本地代码库可访问，定位相关代码位置（文件/函数）并给出修复建议；不要直接改远端；
5. 结论用中文，先给 3 行摘要，再给依据。
"@

# ---------- 执行 ----------
function Invoke-Herdr([string[]]$ArgList, [string]$What) {
  if ($DryRun) {
    Say "DRY-RUN: herdr $($ArgList -join ' ')"
    return $null
  }
  $raw = & herdr @ArgList 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Fail "$What 失败（exit=$code）：$($raw -join ' ')"
    return $null
  }
  try { return ($raw -join "`n" | ConvertFrom-Json) } catch { return $null }
}

# 1) 右侧诊断 pane
$argsSplitRight = @('pane', 'split', '--current', '--direction', 'right', '--cwd', "$Root", '--no-focus')
$r1 = Invoke-Herdr $argsSplitRight '创建右侧 pane'
$diagPane = if ($r1 -and $r1.result -and $r1.result.pane) { $r1.result.pane.pane_id } else { $null }
if (-not $diagPane -and -not $DryRun) {
  Warn '没拿到新 pane id，停止。可手工在右侧 pane 运行：'
  Warn "  $diagCmd"
  exit 0
}
if ($DryRun) { $diagPane = '<right-pane-id>' }

$rRun = Invoke-Herdr @('pane', 'run', $diagPane, $diagCmd) '在诊断 pane 里运行脚本'
Say "诊断 pane：$diagPane"

# 2) 下方 agent pane
if (-not $NoAgent) {
  $argsSplitDown = @('pane', 'split', '--current', '--direction', 'down', '--cwd', "$Root", '--no-focus')
  $r2 = Invoke-Herdr $argsSplitDown '创建下方 pane'
  $agentPane = if ($r2 -and $r2.result -and $r2.result.pane) { $r2.result.pane.pane_id } else { $null }
  if ($DryRun) { $agentPane = '<agent-pane-id>' }
  if (-not $agentPane) {
    Warn '没拿到下方 pane id，跳过启动 agent。'
  } else {
    $r3 = Invoke-Herdr @('agent', 'start', $AgentName, '--kind', $Kind, '--pane', $agentPane) "启动 agent($Kind)"
    if ($r3 -or $DryRun) {
      Say "agent 已启动：$AgentName (kind=$Kind, pane=$agentPane)"
      $r4 = Invoke-Herdr @('agent', 'prompt', $AgentName, $prompt, '--wait', '--timeout', '180000') '发送分析任务'
      if ($r4 -or $DryRun) { Say '已把缺陷上下文发给 agent（等待其进入空闲/阻塞状态）' }
      else {
        Warn '发送 prompt 失败：可手工执行 herdr agent prompt 或直接在 agent pane 里粘贴任务。'
      }
    } else {
      Warn "启动 agent 失败：可在那个 pane 里手工运行 $Kind，或换 -Kind 试其它已安装的 agent。"
    }
  }
}

Say '完成。提示：诊断只读，不会修改服务器；修复仍需你确认后另行执行。'
if ($DryRun) { Say '（这是 DryRun，未真正执行任何 herdr 命令）' }
