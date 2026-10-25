---
id: harness-rc3-deep-resource-panel
title: 深度应用的显式只读资料连接入口
parent: harness-rc3-kaogong-instances
labels: [ready-for-agent]
status: in-progress
implementation_status: source-verified
acceptance_status: pending-new-archives-and-installed-user-flow
assignee: worktable-deep-resource-panel
blocked_by: []
target: 0.2.1-rc.3
---

# 深度应用资料连接 · 2026-10-25

## 验收发现与归属

3101 的最终候选实页发现：通用 DeepApplicationView 只有角色、任务和迁移入口。只读授权控件仅存在于组合应用数据模块和合作网页模块，普通深度应用（包括考公资料库/学习）无法通过界面选择来源、授权给已有实例并撤销。这是08实例共享、15资料接入和10真实闭环验收的必要缺口，不扩展应用数据协议。

## 最小实现

- 平台在已登记的深度应用视图提供默认折叠的“资料连接”。折叠不发请求；打开仅读取公开资源目录、授权元数据和应用目录，不读取业务记录。
- 用户选择公开资料来源和已有、启用的深度使用实例，核对具体来源/实例后点击“授权只读引用”。资料库视图可以为既有学习实例授权，学习视图也可以选择资料库。自有资料无需共享。
- 当前实例收到或提供的连接显示状态；撤销使用精确连接 ID 与 revision。已有同类有效连接时禁止静默覆盖，先撤销原连接。失败保留原状态并显示错误；应用停用、来源失效和私有资料的最终拒绝仍由现有 Host 执行。
- 只调用现有 authenticated resources catalog/snapshot/share/revoke 和 applications GET。客户端不贡献资源、不修改权限为写入、不调用资源 call、不读取 Native Session。
- 同实例其他已展开视图在连接变更事件后刷新元数据，面板也有“刷新资料连接”。授权完成提示在应用自身点击刷新资料；不强制重挂应用，不清理已有草稿。撤销不删除原资料或已发送的 AI 历史。

## 源码验证与交付边界

新增4项真实 React 面板回归：显式授权和精确撤销；来源冲突/私有目录；实例切换时迟到目录和旧操作拒绝隔离；同实例双视图撤销刷新。发布脚本已纳入该测试文件。

当前发布源码回归355项：353通过、0失败、2项既有旧环境检查跳过；独立构建通过。数据Host/HTTP/private现有回归仍通过。所有操作在独立工作树，未改变 Native、3101、正式profile或冻结W.4/K.2归档。

仍待：与角色修复集成；生成新版本 W.5/K.3（不得覆盖旧候选）；官方CLI安装最终归档；真实用户在资料库界面授权bank/materials给已有学习实例、刷新读取、撤销后拒绝、重启后状态保持。源码回归不替代这组安装验收，不关闭08/15/10。
## 集成回归 · 2026-10-25

源码 `793183b` 及方向标签补充 `0c04173` 已合入集成分支。合并后直接按 release-prep 的显式 compatTests 清单运行：355项、353通过、0失败、2项既有旧环境检查跳过；新 resource-panel.test.mjs 确已纳入门禁。面板区分“本实例提供”与“本实例引用”。仅此源码集成不证明真实资料授权/撤销UI通过，仍等待角色修复与全新归档后的3101实际用户验收，本票保持in-progress。

## Worktable rc.3.5 候选归档 · 2026-10-25

源码 `5f8827d96758632778f19e15ddab0bc8b3db8d9f` 已经唯一规定 pack 入口生成 `.5` 双资产，各580817 bytes，SHA256 `8720e8bbf7417f8b020985903d199501f96dbc6004fbd172502ba773b6b9a456`。归档及[公开来源回执](../../../../plugins/worktable/01_content/dist/v0.10.0-rc.3.5/release-receipt.json)已保存。官方合同9/9，源码355项（353通过、0失败、2项既有旧环境跳过），9文件边界、独立离线安装/导入、安装后客户端及各发布门禁通过。

仅独立3101通过官方CLI安装W.5，尚等待修复角色的Kaogong新候选配套安装和真实授权/撤销/恢复验收。本票保持in-progress；未修改旧W.4/W.3/K.1/K.2归档，未正式部署或推送。
