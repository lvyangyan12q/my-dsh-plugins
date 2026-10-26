---
id: worktable-layout-custom-validation
parent: worktable-project-layout-spec
title: 自定义提交前校验
labels: [ready-for-agent]
status: closed
assignee: preflight_increment
blocked_by: []
---

无效项目、目录、缺失/重复窗格在创建分组、目录、会话等副作用前拒绝；创建与发送次数均为0。捕获稳定项目/窗格/标签身份，发送和绑定前复验。保留 begin 守卫，中文可读错误且要求草稿不丢。

编号共享已经完成，不重做。沿用实际自定义提交公开入口及宿主边界计数接缝；先红后绿。

## Resolution

已实现：真实 CustomPane 从 PaneTabBody 传递稳定 projectId/paneId/tabId；新建与发送已有会话均通过公开 submitCustomTask，先校验目录/项目/唯一窗格/当前标签和浏览器存储，再进入宿主副作用。目录还经受认证 fs 只读检查；无目录项目继续可用。发送和绑定前复验同一目标，保留原 begin 守卫。失败保留要求草稿，中文提示通过 Error.cause 保留诊断；若会话已创建则明确报告该会话，不能伪报未创建。

TDD：首个缺失/重复窗格测试因 customTask 模块缺失红；实现后绿。增加相对路径验证时观察到“Missing expected rejection”红，补绝对路径守卫后绿。目录不可用测试先红（仍创建），接入只读检查后绿。最终公开协调器7项、原会话详情30项与挂载27项合计64/64通过；npm run build通过。已有一条创建自定义会话源码切片测试已替换为公开协调器及真实createHostSession接缝，未新增源码切片测试。

本票完成生产接线与自动化；最终安装包/真实宿主由07单独验收，08继续处理双击及更细在途保护。
