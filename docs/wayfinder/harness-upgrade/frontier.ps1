param([switch]$All)
$ErrorActionPreference = 'Stop'
$taskRows = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'issues') -Filter '*.md' | Sort-Object Name | ForEach-Object {
    $taskRaw = [IO.File]::ReadAllText($_.FullName)
    $taskHeader = [regex]::Match($taskRaw, '\A---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)')
    if (-not $taskHeader.Success) { throw "Missing frontmatter: $($_.Name)" }
    $taskMeta = @{}
    foreach ($taskLine in ($taskHeader.Groups[1].Value -split '\r?\n')) {
        if ($taskLine -match '^([a-z_]+):\s*(.*)$') { $taskMeta[$Matches[1]] = $Matches[2].Trim() }
    }
    if ($taskMeta.parent -eq 'harness-upgrade-map') {
        $taskBlockers = @($taskMeta.blocked_by.Trim('[', ']') -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        [pscustomobject]@{ Id = $taskMeta.id; Title = $taskMeta.title; Status = $taskMeta.status; Assignee = $taskMeta.assignee; Blockers = $taskBlockers }
    }
})
$taskById = @{}
foreach ($taskRow in $taskRows) {
    if (-not $taskRow.Id -or $taskById.ContainsKey($taskRow.Id)) { throw 'Missing or duplicate ticket id.' }
    $taskById[$taskRow.Id] = $taskRow
}
foreach ($taskRow in $taskRows) {
    $taskUnresolved = @($taskRow.Blockers | Where-Object {
        if (-not $taskById.ContainsKey($_)) { throw "Missing blocker: $_" }
        $taskById[$_].Status -ne 'closed'
    })
    $taskClaimed = $taskRow.Assignee -and $taskRow.Assignee -ne 'null'
    $taskReady = $taskRow.Status -eq 'open' -and -not $taskClaimed -and $taskUnresolved.Count -eq 0
    if ($All -or $taskReady) {
        [pscustomobject]@{ Title = $taskRow.Title; Status = $taskRow.Status; Assignee = $taskRow.Assignee; Takeable = $taskReady; BlockedBy = ($taskUnresolved | ForEach-Object { $taskById[$_].Title }) -join '；' }
    }
}
