---
id: worktable-framework-19-directory-refresh
title: 已挂载应用目录响应实例归属变化
parent: worktable-framework-19
status: closed
---

# 19: 应用目录刷新补修

0.9.4真实UI曾发现：未归属实例显式关联项目后，保留挂载的目录仍显示“新建实例”，需重开才显示继续。0.9.5订阅既有变更事件，取消旧读取并隔离迟到响应；主入口操作前复核latest，明确“新建独立实例”继续独立创建。无轮询或原生修改。

[源码记录](evidence/19-directory-refresh-source.json)保留两次RED→GREEN与277源码/10factory门禁。它们不替代安装验收。[最终0.9.5实页记录](evidence/19-directory-refresh-installed095.json)证明同一保留目录在另一入口关联实例后无需重挂即显示继续，并打开原实例/原视图；公开读回只有一个实例和一个视图。12份选定非空数据路径保留，0模型请求。

本补修限定范围通过并关闭；父工单19和完整spec仍OPEN。明确独立新建竞态仅源码覆盖，登记后实时传播未验；Notes/Reading021安装与新宿主AI、正式3080交付仍待验。原094冻结包与历史172映射不改写。
