---
id: personal-learning-rebuild-map
title: 基于本地知识文件的 DSH 学习课堂重建路线
labels: [wayfinder:map]
status: open
assignee: null
kind: decision-map
---

# 基于本地知识文件的 DSH 学习课堂重建路线

## Destination

确定全新个人学习插件的首版产品边界、文件与会话归属，并形成可实施的设计规格。

[学习课堂规格](spec.md)已发布，2026-11-10 按用户选择的 B 阅读优先完成第二版及交付验收矩阵（`ready-for-agent`）。原 HTTP/jsdom 测试边界此前已确认，本轮细化的真实交付矩阵待核对。文档发布不表示新版已完成或真实验收通过。

## Notes

- 2026-11-08 用户明确选择全新重建；旧个人学习插件未投入使用，已授权删除旧实现及其专属规划材料，不再要求复用、兼容、迁移或保留作运行回退。旧设计不约束新版。
- 用户已确认 DSH 为学习主界面；知识内容放在 Obsidian 可读的本地文件库。不是开发 Obsidian 插件，不以 Claudian 为新运行时。
- 已确认课堂由课程目录、讲义/动态实验、Markdown 个人笔记、内嵌真实 DSH Session 组成；分栏可拖拽，目录/笔记/对话可收起并恢复。
- 讲义以阅读为主，复杂知识点按需生成动态 HTML；不强制所有课程使用实验或固定预测门控。
- 笔记支持 Obsidian 兼容双链和带来源的批注。插件不另做源码查看器，原始文件使用 DSH 既有文件打开能力。
- Canvas 用于查看知识脉络及进入相关内容；具体首版覆盖与 Obsidian 编辑交接仍需确认，不把格式兼容说成嵌入 Obsidian 编辑器。
- 使用 OpenDesign Cloud 或 Local Codex 制作交互原型；生成前收集设计 brief，用户评审后才能确定布局细节。原型不冒充真实宿主集成。
- 每轮咨询 grilling、domain-modeling；原型票调用 prototype；研究票调用 research。地图和子票只使用 wayfinder 标签。
- 跟踪遵循本仓库本地 frontmatter：parent/blocked_by 引用稳定 id，status 为 open/closed，assignee 为认领。细节只存相应票的 Resolution，地图仅链接摘要。
- 本轮用户明确授权旧插件退场这一执行例外，其余仍为规划，不开发新版、不启动模型生成、不重启宿主。

## Decisions so far

- [讲义笔记与课程脉络的文件及编辑边界](issues/02-file-ownership.md)：知识库根 + 每空间一文件夹；正文只在文件里，存储只存导航；写入口放 Host；Canvas 只读；详见票内 Resolution 与[规格](spec.md)。
- [课堂会话归属与学习上下文切换](issues/03-session-context.md)：一空间一 Session；retain + Provider + embedded Factory；释放引用不停回合；恢复按空间；详见票内 Resolution。
- [四区课堂与知识脉络的交互原型评审](issues/04-classroom-prototype.md)：已生成三方案交互原型，用户明确选 B 阅读优先；仅确认布局方向，真实集成仍需验收，详见本轮 Resolution。
- [文件式课堂与原生内嵌会话的宿主可行性](issues/01-host-contracts.md)：已核查当前公开内嵌路径；文件写入与独立课堂内原生文件打开仍有接入缺口，研究不等于浏览器验收，详见票内 Resolution。
- [旧个人学习插件安全退场](issues/05-legacy-retirement.md)：旧实现及专属规划已删除，当前 profile 已卸载；共享存储和 Session 未清除，具体证据见票内 Resolution。

## Not yet specified

- 在文件、会话和布局边界明确后，确定首版真实学习流程的完整验收与交付规格。
- 长期导师如何以最低成本保存可追溯的本次小结和下次学习位置，避免首版扩大为完整复习系统。

## Out of scope

- 旧插件增量改造、兼容旧实验台协议、旧数据迁移、双版本长期并行。
- 重写 DSH 聊天、工具执行、审批和 Stop 运行时；以跳转会话或模拟聊天代替内嵌会话。
- 完整复制 Obsidian、复杂 Canvas 编辑器、独立源码查看器。
- 首版自动后台复习、掌握度概率模型、多导师、多设备同步。
- 删除 Obsidian 文件库、考公/工作台数据、DSH Session 历史或共享存储库。
