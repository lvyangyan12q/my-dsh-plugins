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

function contextBlock(run, redactor) {
  const draft = run.draft ?? {}
  const bug = draft.bug ?? {}
  const connection = draft.connection ?? {}
  return [
    `runId：${run.id}`,
    bugLine(run, draft),
    `缺陷描述：${redactor.redact(text(bug.description) || '(空)')}`,
    specLine(run),
    `仓库：${run.localPath}（base: ${run.baseBranch}，分支: ${run.branch}）`,
    `环境：${connection.host ?? '?'}:${connection.port ?? '22'}（user: ${connection.user ?? '?'}）`,
    `容器：${text(draft.container) || '未指定（先用只读 docker ps 按项目名/服务名匹配）'}`,
    `日志时间窗：${text(draft.timeWindow?.from) || '最近 3 天'} ~ ${text(draft.timeWindow?.to) || '现在'}`,
    '工作区：可能有未提交改动；分析阶段只读，不要清理/覆盖/提交这些改动。',
    text(draft.notes) ? `用户补充：${redactor.redact(text(draft.notes))}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildPlanPrompt({ run, round, feedback, redactor }) {
  const dir = artifactDir(run, round)
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
    '4. 只读服务器检查走 ssh-connect + 只读白名单包装，禁止重启/删除/写入。',
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
  const entry = run.rounds.find((item) => item.round === round)
  return [
    `用户已批准第 ${round} 轮方案。现在进入**实现阶段**（同一会话）。`,
    '',
    '上下文：',
    contextBlock(run, redactor),
    '',
    '要求：',
    `1. 按 ${entry?.planPath ?? `round-${round}/plan.md`} 执行；偏离方案时先说明原因。`,
    `2. 原工作区可能有未提交改动，**不要在原工作区直接改代码/提交**。先基于 ${run.baseBranch} 新建 worktree：`,
    `   \`git worktree add .bug-solver/worktrees/${run.id} -b ${run.branch} ${run.baseBranch}\`；`,
    '   所有实现、测试和 commit 都在这个 worktree 内完成；原工作区只读。',
    `3. worktree 分支必须是 \`${run.branch}\`；不合入、不推送、不碰受保护分支。`,
    '4. 服务器操作保持只读（ssh-connect + 只读白名单包装），禁止重启/删除/写服务器。',
    `5. 写产物：${dir} 下的 diagnosis.md、result.json、diff.patch。`,
    '   result.json 至少包含：branch、commit、diffPath、tests、risk，以及 worktreePath（如 `.bug-solver/worktrees/<runId>`）。',
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
    '1. 先读 result.json 的 worktreePath；在该 worktree 里用只读 `git -C <worktreePath> diff <base>...<branch>` 核对实现。',
    '   原工作区可能有未提交改动，不要在原工作区执行 diff/修改/提交。',
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
