---
id: harness-rc3-annotation-undo
title: 标注撤销公开接口诊断与操作选择
parent: harness-rc3-rich-input
labels: [ready-for-agent]
status: in-progress
assignee: root
blocked_by: []
target: 0.2.1-rc.3
diagnosis_status: complete
implementation_status: awaiting-user-operation-choice
acceptance_status: pending-installed-production-flow
context_branch: codex/prototype-rc3-annotation-undo
context_commit: ee7b60e02aa8d9d63d97e35a0869e5edfff287eb
---

## 要解决的问题

[HU03](../../worktable-platform/framework-spec.md#host-upgrade-requirements) 的正确末尾追加和独立撤销不能混写为已通过。现有 [02 输入适配](02-rich-input.md) 使用公开初始化追加，保留了混合草稿，但真实 Ctrl+Z 验收未通过。本票不修改原生、私有 Lexical、未声明的 `SessionInput.actions` 或当前生产追加语义。

## 紧反馈循环与诊断

原生固定为 `0.2.1-rc.3` / `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`。父阶段 3097 已验证：初始化追加两次后 Ctrl+Z 没有可见变化，普通键入 Ctrl+Z 成功。本次新建独立 3099 空 home，没有复用模型、会话、资料或正式数据，发送消息为零。

按 diagnosing-bugs 先保留红信号，再区分假设：

1. 初始化写入合并历史，不能单独撤销标注：源实现明确使用 `HISTORY_MERGE_TAG`；混合草稿实际重现。
2. 快捷键没有送到编辑器：普通键入对照及公开动作的独立撤销均成功，排除该解释。
3. 工作台使用了第二套编辑器或错误会话：独立原生输入槽只有一个 `contenteditable`，同一公开 Session binding 上两条路径产生不同结果，不能据此将所有跨会话场景写为已验收。

可丢弃分支内 `plugins/worktable/prototype-annotation-undo/README.md` 提供一条启动命令和已执行的浏览器紧反馈循环。整段红绿对照约 1.6 秒：准备真实 command/reference/quote 与“原始正文”，执行对应公开动作，再在原生编辑器 Ctrl+Z，对比可见文本及只读 DOM。

- 初始化 append：`restoresText=false, restoresMarkup=false`。撤销同时移除了标注和之前一次粘贴边界中的“原始正文”。
- 公开光标插入：`restoresText=true, restoresMarkup=true`，只撤销本次标注，三种 chip 保留。
- 全选原文再捕获：在选区末端插入，原文未被替换，独立撤销恢复一致。
- 捕获后修改草稿：旧 draftRev 被拒绝，待插入标注保留，不走备用通道。

这是同一真实原生编辑器上的行为对照，不是模拟历史栈或断言实现字符串的回归测试。原型代码保持在上下文分支，不合并生产。

## 已确认的公开接缝与限制

rc.3 的公开 `conversation.input.dock` 槽提供 `InputActions.captureInsertion()` 和 `insertText(text, span)`；后者承诺独立撤销。接口位置是 `packages/client/ui-conversation/src/client/contract/input.ts`。InputState 给出展开文本、reference occurrences、claim 和 draftRev，未给 quote 的完整检测坐标；捕获动作也没有文档末尾选项。

因此不能根据展开文本长度或 reference 列表猜测混合草稿末尾，也不能把“在捕获的光标处插入”冒充“总是追加到文档末尾”。本轮未找到同时满足这两个要求的公开接口。

## 待用户明确的操作选择

- 保留现有末尾追加，明确原生初始化的历史合并限制；独立撤销要求继续待宿主公开接缝支持。
- 采用“在捕获的原生光标/选区末端插入，可独立撤销”。这需要明确改变生产文案和操作语义，再接入现有稳定画布目标与标注草稿保存。

第二种的最小原型已可审阅，尚未获准作为生产行为。生产接入时必须在打开标注编辑前捕获 Session 代和 draftRev，折叠原选区而不替换原文；确认时重验原代、revision 和目标；拒绝或异常保留标注，不重发、不改走初始化；成功后才清标注与请求焦点。

## 验收状态

- [x] 真实结构化草稿中的红信号、公开备选绿信号、选区保留及旧 revision 拒绝。
- [x] 原型与真实截图/observations 已提交独立上下文分支，零模型发送。
- [ ] 用户明确选择操作语义，并据此更新规格与生产实现。
- [ ] 强制跨 Session 代失效、关闭/重开、原画布目标及标注草稿保留的生产流程。
- [ ] 文件附件、物理 IME、最终归档安装及完整 HU03 原生执行验收。

当前生产 `appendHostInput`、版本和冻结包均未改变；本票不关闭 02 或 HU03。原型截图和记录不替代正式安装闭环。


## 用户选择 · 2026-10-24

用户明确选择“光标处插入，可独立撤销”。生产语义变更已获确认：开始标注时捕获原生光标/选区末端；不替换选中文字；确认插入只在同一会话代和draftRev上执行一次；过期失败保留标注，不换通道、不自动发送。末尾初始化追加不再是新版本默认操作。原型ee7b60e仅为已验证依据，生产接线、跨Session/卸载、附件和最终包仍待验。