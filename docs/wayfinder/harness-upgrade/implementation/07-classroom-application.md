---
id: harness-rc3-classroom-application
title: 课堂经公开工作台接入同一原生对话
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-upgrade-classroom-prototype]
acceptance_status: passed-current-explicit-source-entry-installed-scope
target: 0.2.1-rc.3
---

## 最终当前范围 Resolution · 2026-10-25 · W.7 / K.6

准确最终包在官方CLI移除/重装和source冷恢复后，真实Native问题卡选项提交及模型确认、长生成Stop明确停止、独立合成文件的原生审批拒绝/允许一次均通过：拒绝文件不存在，允许文件精确内容一致，访问模式仍是工作区内修改。完成后计划页仍90%/10题；同课堂、练习关联、反思、显式完成、总结、原资料及Native历史保持。当前无待处理原生操作。本票按该独立安装与全新部署范围关闭；早前失败/待验段落仅作历史，以下边界持续有效。

实际source启动带显式 `TSX_TSCONFIG_PATH`，不能据此声称未设置它的裸 `pnpm start:web` 已通过；该官方入口兼容只读核对仍待。正式注册/推送/清理由11继续处理。09历史会话/学习迁移排除并保留open；正式旧资料仅只读清点、未导入，写新空库仍须单独具体预览确认。IME仅使用已记录的同Native人工证据，不新增人工测试声明。

[当前脱敏验收记录](../../../evidence/2026-10-25/rc3-fresh-installed-current.json)持有准确版本、SHA与证据边界。

## 当前 Resolution · 2026-10-25 · W.7 / K.6

同一课堂的学习目标、总结、练习关联与反思跨视图及冷重启/同包重装保持；学习者显式确认后完成课堂，未练习的其他实例继续未完成。Native唯一会话区、角色工具和精确轮次读取已有真实证据。最终准确包的问题/Stop/审批矩阵由10最后复验，故本票本检查点保留开放。

精确版本、SHA、入口及证据边界见[当前脱敏验收记录](../../../evidence/2026-10-25/rc3-fresh-installed-current.json)。以下为历史检查点；其中待验/失败不代表本节当前结果。


## 当前范围覆盖 · 2026-10-25

本节优先于下方保留的历史实施记录。本轮按用户最新决定采用全新部署：使用原生标准 preset，角色人格及 Skills 由考公应用私有管理；不迁移、不删除历史会话、学习记录或成绩，也不把保留旧 preset IDs 作为新部署要求。角色范围与原生执行边界见[13](13-kaogong-role-scope.md)。

原题库、讲义、图片、PDF 与 MinerU 资料保留原址。先只读清点、展示 materials-only 具体预览，经明确确认后才写入新的空资料库；不默认共享私人或来源不明资料。接入及隔离要求见[15](15-kaogong-fresh-materials.md)。历史[09](09-legacy-adoption.md)不构成本轮前置，原票与历史正文保留，历史联合迁移未执行，09未关闭；旧接管计划批准不替代本轮具体资料计划批准。

当前独立验收入口为 3101，目标为准确 Worktable `0.10.0-rc.3.4` / Kaogong `0.2.0-rc.3.2` 归档组合。新包真实安装 UI、原生 AI 与恢复的完整验收仍 pending；下方 3097 开发 link、旧版本及接管准备只证明相应历史检查点。本票未据此关闭。

## 历史要求与检查点（按上述当前范围解释）

按课堂原型已验证的最小公开接缝接入考公课堂，沿用既定工作台布局、原生菜单及唯一输入区。应用保留讲义、练习及课堂业务界面；同一角色继续使用同一 Session。不能用仅跳转后丢失课堂界面冒充嵌入。

- [ ] 原型分支及已验证结论留在决策票，原型代码不合并生产。
- [ ] 角色切换、同实例多视图、关闭重开和焦点/滚动释放正确。
- [ ] 原生对话、轨迹、问题/审批与 Stop 指向绑定的 Session，隐藏视图不误停。
- [ ] 通过公开 SDK/Host 接缝，不向应用暴露任意原生全局上下文，不修改原生源码或私有编辑器。
- [ ] 真实安装记录与可复现回归分别留证，不以模拟 AI 原型关闭实际执行验收。

## 生产代码切片（2026-10-24）

实现位于 `plugins/kaogong/src/client.tsx` 与 `sdk-classroom.tsx`，通过 `worktableApplicationViews` 注册学习和只读资料库视图。采用已确认原型的内容左侧、工作台现有原生会话右侧布局；原型代码没有合并。旧独立入口保留冻结提示，旧源码另存为 `legacy-client.tsx` / `legacy-knowledge-reader.tsx`，新客户端产物不包含 personal-workbench 或第二套原生会话容器。

状态由插件生命周期持有：实例共享课堂、练习、答案与请求竞争保护；视图分别持有页面、筛选、资料选择、角色选择及公开服务。草稿与讲评标记按实例存储，显示偏好按实例和视图存储，不导入旧 default 浏览器状态。请求和图片引用均在渲染/发送时携带不可变 `viewId`，Host 决定实例归属，业务请求不能另选实例。

角色仅通过公开 ensure/open，保留精确 Session 和 revision，失败不重复发送。普通教学使用公开 prepare；已保存课堂和讲评仅传 lessonId/roundId 给公开 prepareOwned，生命周期由 Host 管理，不执行旧浏览器 beforeSend/afterSend。

验证：五个公开接缝/真实组件渲染测试通过；当前公开 SDK 客户端 TypeScript 检查通过；tsdown 客户端构建通过，产物扫描未发现旧 workbench 或 role-conversation 引入。测试并非真实模型执行证据。

代码切片已实现，整票仍保持 open：待 Host 接入后真实安装、多视图关闭重开、轨迹/审批/Stop、刷新重启及真实模型验收，随后才可关闭。
