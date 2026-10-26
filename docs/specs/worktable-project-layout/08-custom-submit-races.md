---
id: worktable-layout-custom-races
parent: worktable-project-layout-spec
title: 重复提交与途中变化保护
labels: [ready-for-agent]
status: closed
assignee: preflight_increment
blocked_by: [worktable-layout-custom-validation]
---

双击同一目标只允许一个在途创建/发送；失败后显式重试重新校验，成功请求不重复发送。等待期间切项目、改目录、重排窗格或替换标签后不误绑；若已创建会话则明确说明，不能自动删除或移动会话。保留要求草稿。

通过真实提交公开入口的延迟宿主边界验证副作用次数与稳定归属。

## Resolution

已实现：CustomPane使用同步在途ref，稳定表单token传入真实提交协调器；同窗相同请求共享在途结果，成功token保留结果不重发，失败token清理后允许显式重试，变化中的另一请求明确提示等待。表单token通过WeakMap随卸载回收，不形成永久全局成功记录。

分组创建公开入口createCustomHostSession在目录、mkdir、工作区等每个await后复验稳定目标；新会话配置预设与模型之间复验。绑定和窗口提示词改为惰性准备，经过真实sendHostSession的ready/旧宿主寻址等待后，在实际发送调用前同步复验并绑定；失效目标不产生绑定/发送。创建后失败如实说明会话已创建并保留草稿，自动项目会话绑定还检查预期项目，避免慢结果绑到切换后的项目。

TDD红绿：双击测试先出现2次create/send，修复为各1；新表单加入在途请求的成功重试先重复发送，修复为只1次；宿主ready后的目标变化测试先发送或报prepare非函数，接入惰性准备后0绑定0发送；真实宿主桥文本工厂测试先缺少拒绝，修复后目标拒绝时0次原生prompt；分组await用例因公开创建入口缺失红，接入后0会话创建。

最终运行custom-task 15、session-compat 22、session-details 30、widget-mount 27，合计94/94通过；build通过。覆盖无目录、显式none/existing/new分组、项目/目录/窗格/标签变化、重试和已建会话提示。真实最终安装产物由07统一验收，不以本票自动化代替。
