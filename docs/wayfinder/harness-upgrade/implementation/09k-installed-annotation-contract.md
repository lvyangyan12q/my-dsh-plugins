---
id: harness-rc3-installed-annotation-contract
title: 安装产物标注门禁对齐公开 InputDock
parent: harness-rc3-rich-input
status: complete
implementation_status: fixture-contract-corrected
acceptance_status: retained-installed-client-callbacks-verified
blocked_by: []
---

## 失败与根因

最终候选源码 `61d610d0b128718a006c28cdfeef29103aad6730` 的发布门禁在结构、干净安装、import、客户端工厂及锚点检查通过后，`project-navigation-installed.test.mjs:81` 因第二次标注后 draft 仍为空失败。本票只修复该安装夹具，不跳过发布门禁，不改生产桥接、包版本或冻结资产。

原夹具只记录并挂载 `shell.overlay`，从未挂载生产注册的 `conversation.input.dock`；也未提供 `sessions.binding()`，却将动作放在 rc.3 未公开的 `SessionInput.actions` 上。已批准的生产行为要求在画布覆盖层取得焦点前，通过原生公开输入槽捕获光标、Session 代和 draftRev。该夹具缺少捕获所需的全部公开输入槽条件，生产拒绝插入是正确行为；目标替换的首个失败测试掩盖了这个缺口。

## 修复及保留的验证

测试继续求值**真实安装产物**的 ModuleLoader 工厂，使用真实 WorktableSection、原生导航回调、SplitWorkspace 及标注 UI 回调；新增挂载工厂实际注册的公开 InputDock，传入稳定 Session binding 与公开 InputActions。SessionInput 只提供公开状态与 focus，不提供 actions。原有窄屏模块/原生切换、inert、焦点与草稿恢复、原生面板导航及稳定目标替换断言全部保留。

补充断言覆盖：原文选区 `[4,12]` 在开始标注时捕获，随后移动实时选区仍只在原末端插入并保留选中文字；成功才关闭标注并请求原生焦点；下一条标注使用新 revision；期间原生草稿改变则拒绝并保留要求，用户明确重新开始后才可成功；输入槽卸载及重挂不能复活旧捕获；同 Session ID 的 binding 换代也拒绝并保留要求。初始化备用通道调用次数必须为零。

## 红绿证据

在已有真实安装客户端上执行同一命令（路径参数为发布脚本干净安装产物，不是源码编译模块）：

```powershell
node plugins/worktable/04_test/project-navigation-installed.test.mjs <installed-package>/lib/client.js
```

- 原夹具重现 `expected /稳定目标/; actual ''`，退出 1。
- 仅补齐公开 InputDock/binding 后，同一安装 bundle 退出 0。
- 加强后的完整导航、目标、选区、两次标注、revision、代与卸载检查通过。
- 对安装 bundle 的四份独立本地副本分别注入选区起点、取消 revision guard、取消槽卸载 guard、取消 binding 代 guard，门禁分别退出 1；未改安装原件。随后原件再次退出 0。

安装原件 SHA-256：`7b006007b6c409ea046d25af9ca6798c984b0a777c231fc7bf67cf80090b0773`。机器可读结果见[故障注入记录](../evidence/annotation-installed-gate/observations.json)。本次没有运行包管理器、构建、重新打包、模型调用或运行实例变更；仅创建本工作树的根 node_modules 及 01_content/node_modules 依赖 junction，供只读使用现有精确工具，未写其目标。

本票关闭的是安装回调夹具缺陷。测试不模拟原生撤销栈，也不将夹具当作真实 Ctrl+Z 证明；[02b](02b-production-caret.md) 的原生独立撤销证据保持原范围。最终包完整发布流程、最终注册、物理 IME 和完整 HU03/HU07 仍由后续验收处理。
