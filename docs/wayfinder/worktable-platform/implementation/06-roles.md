---
id: worktable-framework-06
title: 角色会话隔离与能力复用
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: role_capabilities
blocked_by: [worktable-framework-04]
---

# 06: 角色会话隔离与能力复用

**What to build:** 应用实例的角色通过稳定身份关联原生会话，读取/创建/重试/替换语义分开。

**Blocked by:** [深度应用接入与同实例多视图](04-deep-views.md)。

**Status:** in-progress

- [ ] 应用实例的角色通过稳定身份关联原生会话，读取/创建/重试/替换语义分开。
- [ ] 重复和真实并发创建收敛到同一角色绑定；不同项目或实例默认隔离，替换保留旧历史并需明确操作。
- [ ] 公共Agent/Skills可供应用复用；应用私有能力保持所有权，教学专用逻辑不成为所有应用的必选接口。
- [ ] 禁用、缺失或不可调用能力明确反馈，不自动替换Agent、不新建Session掩盖失败。
- [ ] 原生会话可重新打开并查看历史；未发送文字、编辑器归属不跨实例混用。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。

## 2026-10-19 实施准备与辅助证据（不关单）

role_capabilities工作树从集成ed6ca9dda80523ea735c3e1b9260e86cfbc1005d干净起步。按已确认role lifecycle / capability provenance / rc.2 native adapter / passive role panel公开边界逐片RED→GREEN：首次缺失模块；显式retry/replace/attach尚未实现；公共管理目录尚未实现；native adapter尚未实现；React role panel尚未实现（先补齐lockfile依赖，再确认缺失目标模块的RED）；ensure错误忽略Agent更换选择的真实断言RED，修复后GREEN。

`npm run test:roles`覆盖10项行为：只读零创建与真实Promise并发收敛、实例隔离和关联项目保留Session、intent跨重开同ID retry、revision guard与replace历史、反向current/history ownership、显式Agent替换语义、真实临时文件系统导致ready提交失败仍按同intent恢复、intent写失败零native create和第二Host owner拒绝、公共管理来源/私有owner/停用、rc.2显式Workspace+预分配ID+flush、角色面板只读/同ID原生导航/卸载不Stop、resolve原生复验期间replace不得超越。测试中的native authority是受控边界，不作为真实模型或正式Host验收。

交付入口仍仅 `01_content/npm run pack`，新增role回归纳入该门禁。真实UI操作由主验收Host进行：应用目录打开Agent/Skills管理，建立reading-helper；阅读应用视图展开应用角色，首次若应用声明的cwd未登记原生Workspace明确拒绝且无Session创建；用户显式登记该工作区后创建；多视图重开同ID、跨实例不同ID、重启恢复空白Session、未发送草稿恢复及替换历史、停用拒绝逐项实页核实后才可勾选。

当前06不包含发送、上下文准备、审批或Stop；没有嵌入composer，原生导航继续使用唯一原生输入席位。未验证跨浏览器文本协作、原personal-workbench记录迁移。没有修改正式原生DSH、3080、旧Worktable及旧数据。
