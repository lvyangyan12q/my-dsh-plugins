/**
 * 两个原生会话的 prompt 契约（窗口3 规格 / 工单 10）：
 * - 修复会话每轮先方案（只读），批准后才实现；方案与实现在同一会话。
 * - 审核会话只读，最终消息先给固定 JSON 结论块。
 * 所有进入 prompt 的用户文本都先脱敏。
 */

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')

function bugLine(run, draft) {
  const bug = draft?.bug ?? {}
  return `BUG-${run.bugUid ?? run.bugId} ${text(bug.title) || '(无标题)'}`
}

function specLine(run) {
  const spec = run.specRef ?? { kind: 'none' }
  if (spec.kind === 'none' || !spec.path) return 'spec：无（只按缺陷描述与 diff 判断）'
  return `spec（${spec.kind}）：${spec.path}${spec.feature ? `（feature: ${spec.feature}）` : ''}`
}

function artifactDir(run, round) {
  const repo = run.draft?.project?.localPath ?? run.localPath
  return `${repo}/.bug-solver/runs/${run.id}/round-${round}/`
}

/** 连服务器的固定命令形态：会话照抄即可，不用自己拼参数。 */
function sshCommandHint(connection) {
  const port = connection?.port ?? '22'
  const key = connection?.keyPath ?? '<私钥路径>'
  const user = connection?.user ?? '<user>'
  const host = connection?.host ?? '<host>'
  return `ssh -o BatchMode=yes -o ConnectTimeout=10 -p ${port} -i "${key}" ${user}@${host} "<只读命令>"`
}

function contextBlock(run, redactor) {
  const draft = run.draft ?? {}
  const bug = draft.bug ?? {}
  const connection = draft.connection ?? {}
  const repoPath = run.repoPath ?? run.localPath
  const worktreePath = run.worktree?.path ?? null
  const hasWorktree = Boolean(worktreePath) && worktreePath !== repoPath
  return [
    `runId：${run.id}`,
    bugLine(run, draft),
    `缺陷描述：${redactor.redact(text(bug.description) || '(空)')}`,
    specLine(run),
    hasWorktree
      ? `代码工作区（就在这里改，绝对路径）：${worktreePath}（base: ${run.baseBranch ?? '仓库当前分支'}，分支: ${run.branch}）`
      : `代码仓库（只读，绝对路径）：${repoPath}`,
    hasWorktree
      ? `原始仓库（只读参考，不要在里面改/提交）：${repoPath}`
      : `分支 ${run.branch} 与独立工作区会在用户批准方案后创建；本阶段不要改代码、不要提交。`,
    run.sessionCwd && run.sessionCwd !== (hasWorktree ? worktreePath : repoPath)
      ? `会话目录：${run.sessionCwd}（DSH 会话在 bug-solver 工作区里；改代码请显式 cd 到上面那个目录）`
      : '',
    `环境：${connection.host ?? '?'}:${connection.port ?? '22'}（user: ${connection.user ?? '?'}${connection.keyPath ? `，私钥: ${connection.keyPath}` : '，未配置私钥路径'}）`,
    '连服务器前先用 skill 工具加载 `ssh-connect`；私钥只用于认证，不要读取、打印或复制其内容。',
    `容器：${text(draft.container) || '未指定（先用只读 docker ps 按项目名/服务名匹配）'}`,
    `日志时间窗：${text(draft.timeWindow?.from) || '最近 3 天'} ~ ${text(draft.timeWindow?.to) || '现在'}`,
    '分析阶段只读：不要提交、不要改动原始仓库；实现阶段的动作等用户批准方案后再做。',
    text(draft.notes) ? `用户补充：${redactor.redact(text(draft.notes))}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildPlanPrompt({ run, round, feedback, redactor }) {
  const dir = artifactDir(run, round)
  const connection = run.draft?.connection ?? {}
  const previous = run.rounds.find((item) => item.round === round - 1)
  const previousReview =
    previous?.verdict
      ? [
          `上一轮（第 ${previous.round} 轮）审核结论：${previous.verdict}`,
          previous.reviewSummary ? `摘要：${redactor.redact(previous.reviewSummary)}` : '',
          previous.reviewBlocking?.length
            ? `必改项：${previous.reviewBlocking.map((item) => redactor.redact(item)).join('；')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : ''
  const parts = [
    '你是 bug-solver 窗口3 的「分析修复」会话，现在是第 ' + round + ' 轮 **方案阶段**。',
    '',
    '上下文：',
    contextBlock(run, redactor),
    previousReview,
    '',
    '本阶段要求：',
    '1. 阅读 spec、缺陷信息和上一轮审核结论（如有），只读分析服务器与本地代码。',
    '2. 写 `round-' + round + '/plan.md`（相对产物目录），必须包含：诊断、改什么、怎么改、怎么测、风险。',
    '3. 本阶段**只读**：不要修改代码、不要创建/修改/删除仓库文件（plan.md 除外），不要 git add/commit，不要改服务器。',
    '4. **连服务器必须用 ssh-connect 技能**：先调用 skill 工具加载 `ssh-connect`，再执行只读命令；不要凭记忆拼参数，也不要用别的通道绕过。',
    `   命令形态：${sshCommandHint(connection)}`,
    '   只允许只读命令：docker ps / docker logs --since … --tail N / docker inspect / docker stats --no-stream / systemctl status / cat / tail / head / grep / ls / df / free / uptime / ps。',
    '   禁止：restart/stop/kill/rm/rmi/prune/exec 等写操作、docker cp、改配置文件、安装卸载、改权限、清空或轮转日志。',
    '   需要变更服务器时，只在 plan.md 的「建议」里写清楚，交给用户执行。',
    '4b. 容器名未指定时，先运行只读 `docker ps` 按项目名/服务名匹配容器，再做日志定位；不要猜容器。',
    '5. 先把 `.bug-solver/` 加入本仓库 `.git/info/exclude`（不改 tracked .gitignore），避免产物污染工作区。',
    '6. 写完 plan.md 后结束本轮，等待窗口3 批准；未批准前不会进入实现。',
    '',
    `产物目录：${dir}`,
  ]
  if (feedback) parts.push('', `用户退回了上一版方案，意见：${redactor.redact(feedback)}`, '请据此修订方案。')
  return parts.join('\n')
}

export function buildImplementPrompt({ run, round, redactor }) {
  const dir = artifactDir(run, round)
  const connection = run.draft?.connection ?? {}
  const entry = run.rounds.find((item) => item.round === round)
  return [
    `用户已批准第 ${round} 轮方案。现在进入**实现阶段**（同一会话）。`,
    '',
    '上下文：',
    contextBlock(run, redactor),
    '',
    '要求：',
    `1. 按 ${entry?.planPath ?? `round-${round}/plan.md`} 执行；偏离方案时先说明原因。`,
    `2. 桥已经为本次 run 建好独立工作区：\`${(run.worktree && run.worktree.path) || run.localPath}\`（分支 \`${run.branch}\`，基于 \`${run.baseBranch || '仓库当前分支'}\`）。`,
    '   直接在这个工作区里改代码、跑测试、commit；不要动原始仓库，也不要另建 worktree。',
    `3. 分支必须保持 \`${run.branch}\`；不合入、不推送、不碰受保护分支。`,
    '4. 服务器操作同样先加载 `ssh-connect` 技能，再用固定命令形态，且保持只读：',
    `   ${sshCommandHint(connection)}`,
    '   允许：docker ps / docker logs / docker inspect / systemctl status / cat / tail / grep / ls / df 等只读命令。',
    '   禁止：重启、停止、删除容器/镜像/卷、改配置或权限、安装卸载、清空日志；需要变更时写进产物说明，交给用户执行。',
    `5. 写产物：${dir} 下的 diagnosis.md、result.json、diff.patch。`,
    '   result.json 至少包含：branch、commit、diffPath、tests、risk，以及 worktreePath（填 `${run.localPath}`）。',
    '6. `.bug-solver/` 只加入 .git/info/exclude，不改 tracked .gitignore；diff 用 worktree 的 `git diff <base>...<branch>` 生成。',
    '7. 完成后结束本轮；桥会自动启动审核，不要自行调用审核或合入。',
    '',
    `产物目录：${dir}`,
  ].join('\n')
}

export function buildReviewPrompt({ run, round, redactor }) {
  const dir = artifactDir(run, round)
  return [
    '你是 bug-solver 窗口3 的「审核」会话，只读沙箱。',
    '',
    '上下文：',
    contextBlock(run, redactor),
    `当前轮次：第 ${round} 轮`,
    `本轮产物目录：${dir}`,
    '',
    '任务：',
    `1. 用只读 \`git -C ${(run.worktree && run.worktree.path) || run.localPath} diff ${run.baseBranch || 'HEAD~1'}...${run.branch}\` 核对实现；该目录就是本次 run 的工作区。`,
    '2. 读 spec、plan.md、diagnosis.md、result.json、diff.patch，并用只读 git diff 核对分支与 base。',
    '2. 检查是否按方案实现、是否有越界改动/凭据泄露/服务器写操作、测试是否覆盖风险。',
    '3. **不要修改任何文件、不要提交、不要合入、不要写服务器。**',
    '   本会话是只读沙箱，不要尝试写 `review.md`；桥会从你的最终消息提取并写入本轮产物目录。',
    '',
    '最终消息要求：先输出一个 ```json 代码块，字段固定：',
    '{"verdict":"approve|request_changes|needs_info","summary":"...","blocking":["..."],"tests":["..."]}',
    '其中 request_changes 的 blocking 写清必改项；needs_info 写清需要用户补充什么。',
    'JSON 块之后再写人类可读说明。',
  ].join('\n')
}
