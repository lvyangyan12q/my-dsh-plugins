---
id: harness-rc3-kaogong-instances
title: 考公六领域实例隔离和受控资料库
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: rc3-kaogong-host
blocked_by: [harness-upgrade-kaogong-ownership, harness-rc3-legacy-role-contract, harness-rc3-kaogong-state-partition]
target: 0.2.1-rc.3
---

## 当前范围覆盖 · 2026-10-25

本节优先于下方保留的历史实施记录。本轮按用户最新决定采用全新部署：使用原生标准 preset，角色人格及 Skills 由考公应用私有管理；不迁移、不删除历史会话、学习记录或成绩，也不把保留旧 preset IDs 作为新部署要求。角色范围与原生执行边界见[13](13-kaogong-role-scope.md)。

原题库、讲义、图片、PDF 与 MinerU 资料保留原址。先只读清点、展示 materials-only 具体预览，经明确确认后才写入新的空资料库；不默认共享私人或来源不明资料。接入及隔离要求见[15](15-kaogong-fresh-materials.md)。历史[09](09-legacy-adoption.md)不构成本轮前置，原票与历史正文保留，历史联合迁移未执行，09未关闭；旧接管计划批准不替代本轮具体资料计划批准。

当前独立验收入口为 3101，目标为准确 Worktable `0.10.0-rc.3.4` / Kaogong `0.2.0-rc.3.2` 归档组合。新包真实安装 UI、原生 AI 与恢复的完整验收仍 pending；下方 3097 开发 link、旧版本及接管准备只证明相应历史检查点。本票未据此关闭。

## 历史要求与检查点（按上述当前范围解释）

实现 HU05/06：考公独立通过 Worktable SDK 注册，去除 personal-workbench 运行依赖。私有角色/Skills 归应用所有；新学习实例为空，同实例多视图共享状态，不同实例默认隔离。历史学习与资料库的归属按已确认决策，正式接管由09另行处理。

- [ ] notebook/progress/bank/knowledge/practice/lessons 六领域均有明确 owner；activeLesson、日期键、默认计划及浏览器草稿不跨实例串用。
- [ ] HTTP 请求验证视图/实例归属；原生工具从可信 Session 绑定确定实例，拒绝模型伪造 instanceId 或全局回退。
- [ ] 原始来源与私人笔记分开；资料库读授权显式且可撤销，新实例无默认全库访问。
- [ ] 评分、题目快照、答案、提交顺序与课堂完成规则保持，未提交练习不泄露评分答案。
- [ ] 保留原图片/讲义/MinerU 路径与引用，不自动复制或移动资料，不在只读预检启动 recover/修复/轮询。
- [ ] 用实际两个学习实例和同实例多视图复验 HTTP、工具、草稿、统计与撤销；边界测试只是辅助。


08a-state-partition为可独立实施的业务状态切片，先验证六领域所有者及课堂/练习实例化；本票仍负责HTTP、可信工具上下文、浏览器状态与实际SDK接线，不能由08a替代整体验收。


## 2026-10-24 Host / SDK 接线证据（未关闭整票）

- Host 通过公共 Worktable SDK 注册 kaogong / kaogong-library；角色与 Skill 是应用私有声明，保留旧 native preset IDs。无角色会话创建、原库迁移、recover、图片修复或 MinerU 轮询启动副作用。
- HTTP 必须使用已登记 viewId；原生工具按 rc.3 实际公共 `exec.agent.session.id` 解析所属实例。工具 when 同时拒绝未绑定和历史写入；模型参数没有选实例权限。
- 应用内部命令使用实例池与可排空命令所有者；共享原始 bank/materials 通过受控 ResourceDirectory.call 读取、可撤销。teaching 为 shareable:false 私有上下文，既不进入目录，也不能经旧授权跨实例读取。资料库视图也不会返回私人笔记。
- 新公共 prepareOwned 是纯准备；review / lesson 只在实际原生准入前认领。只有已知准入并 flush 后才确认应用发送标记。确认标记失败可恢复且不重发；未知准入保持 sending。直接 HTTP review claim/complete 已拒绝。
- 新 MinerU job 记录实例所有者；collect 不接受他人 job；图片必须属于自己的 job 或当前显式授权来源的真实 job。旧图像目录与 job 引用未移动、未读取接管，09 仍须建立可核验的旧来源所有权映射；不能把仅设置旧绝对路径视为已完成资料接管。
- `DSH_SOURCE=<official rc.3> node plugins/kaogong/scripts/check-host-types.mjs`：实际官方 lib/types 严格编译通过。`.../scripts/test-current.mjs`：19 项通过，涵盖真实 JSON 域、HTTP/工具/资料授权、原生 preset scope、课堂公开接口。
- Worktable app-owned task / private-resource 加原任务回归：12 项通过。新两组和历史会话身份测试已加入 Worktable release-prep 兼容门禁。
- 新 Kaogong 版本 0.2.0-rc.3.1，仅依赖 Worktable 0.10.0-rc.3.2 + Harness rc.3。单独 npm run pack 门禁会构建、执行当前 Host/Client 回归与文件边界检查，拒绝覆盖既有版本包。当前尚未冻结发布包、未安装到正式目录。

**剩余验收**：09 明确预览确认后的旧资料/私有历史接管、真实安装的双实例/多视图/角色原生 AI 教学与审批 Stop、刷新重启、历史图表引用与故障恢复、最终打包回退。旧 alpha 测试夹具保留供冻结包回退比对，不作为新 rc.3 课堂验收入口。不得凭上述接口回归关闭08或HU05/06/08。
