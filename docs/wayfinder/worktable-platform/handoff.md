# 工作台接续交接 · 2026-10-20

当前交付是 **Worktable 派生 AI 工作台的首阶段框架**。首阶段 11 张实施工单已关闭，完整规格仍 open；完整搭建器、AI 生成追改和考公迁移尚未交付。后续新应用既可以直接开发接入，也可以在未来搭建器完成后组合生成。

代码与本页所在分支：[`codex/worktable-framework`](https://github.com/lvyangyan12q/my-dsh-plugins/tree/codex/worktable-framework)，代码与验收记录检查点为 `b99cdcd5c40a64d6036d1ac65af23a105854c53f`。本次提交仅补充文档。该分支已推送，不代表已经合入 main、发布 npm/GitHub Release 或同步正式 3080。

## 明天从这里开始

1. 先读本页与[实现技术路线及后续待办](technical-roadmap.md)，了解实现边界和建议顺序。
2. 阅读[完整框架 spec](framework-spec.md)、[首阶段 11 张工单](implementation/README.md)。旧规格和原 123 项要求继续保留。
3. 开发应用时读 [SDK v1 接入合同](implementation/10-sdk-contract.md)，参考独立的 [Project Notes](../../../plugins/project-notes/) 和 [Reading](../../../plugins/reading-statistics/)。
4. 核对通过范围时读 [11 验收](implementation/11-acceptance.md)、[逐项验收映射](implementation/11-acceptance-mapping.md)和[两轴审查](implementation/11-review.md)，不要用“11 张关闭”替代完整规格验收。

在办公室新目录取代码：

```powershell
git clone --branch codex/worktable-framework https://github.com/lvyangyan12q/my-dsh-plugins.git my-dsh
cd my-dsh
git status --short --branch
```

已有检出先检查自己的未提交改动，再 fetch 并切换对应分支；不要为更新而丢弃本地文件。源码在远程，验收机的模型配置、凭据、资料、业务数据和本地发布包不随 Git 自动迁移。

## 代码改在哪里

| 目录 | 用途 |
|---|---|
| [plugins/worktable/01_content](../../../plugins/worktable/01_content/) | 新工作台插件包根目录；`src/client` 承载 UI 与原生适配，`src/framework` 承载应用、数据授权、角色、任务和恢复 |
| [plugins/project-notes](../../../plugins/project-notes/) | 第二个独立深度应用，自己的业务数据、视图和私有能力 |
| [plugins/reading-statistics](../../../plugins/reading-statistics/) | 阅读统计应用及同实例多视图示例 |
| [plugins/personal-workbench](../../../plugins/personal-workbench/) | 旧平台实现，保留用于历史、数据和迁移参考；不是本轮派生工作台前台 |
| [plugins/kaogong](../../../plugins/kaogong/) | 考公插件保留，专项接入与资料迁移暂缓 |

本机开发仓库为 `D:/programming/workspace/my-dsh`。原生 `D:/programming/workspace/deepseek-harness` 与上游 `D:/programming/workspace/dsh-plugins/dsh-worktable` 不作为本轮修改目标。派生来源是上游 HEAD `0a9ff9d34eb2475b427bdfabe4321f53e27f9a2d` 加 2026-10-18 本地未提交改动，来源与许可见 [UPSTREAM-SNAPSHOT.json](../../../plugins/worktable/UPSTREAM-SNAPSHOT.json)及[基线工单](implementation/01-baseline.md)。

## 当前完成到哪

已实现并按各工单版本限定实测：网页接入、未归属实例及项目关联、独立深度应用、同实例多视图、跨实例隔离、显式数据共享与撤销、角色与公私能力复用、任务准备到原生 AI 执行、持久化与冷恢复、停用和兼容回退、公开 SDK v1。首阶段最终包还覆盖了原生菜单/项目导航、标注、390px 窄屏、明暗主题、焦点和滚动。

最终 Worktable **0.7.2**，Project Notes **0.1.2**；包 SHA 和最终安装组合见 [E11](implementation/evidence/11-installed.json)。真实私有/公共 Skill 模型调用来自 10 的版本限定证据；不把它写成最终 UI 小版本又重新跑过模型。用户明确授权后的 Notes 两条合成数据只读共享、撤销、冷启拒绝见 [E11S](implementation/evidence/11-authorized-notes-sharing.json)。

| 要求集合 | 首阶段已验 | 当前未验 | 后续保留 |
|---|---:|---:|---:|
| 新框架 49 项 | 41 | 6 | 2 |
| 旧要求 123 项 | 25 | 88 | 10 |
| 总计 172 项 | 66 | 94 | 12 |

数字来自[完整映射 JSON](implementation/11-acceptance-mapping.json)。其中有相互重叠的用户故事、决定和验收规则，**94 项未验不是 94 个独立缺陷或待开发功能**。完整 spec 继续 open，旧 12 张工单不随新 11 张关闭而自动关闭。

## 运行和部署状态

- 独立验收用未经工作台补丁的官方 **DSH 0.2.0-rc.2**；3091 已按用户要求停止，文档交接不重启。3080 未执行本阶段同步，不宣称正式实例已是最终包。
- 3095 是本机交互原型，展示方向经用户确认；它不执行真实 AI，也不是办公室可直接访问的部署。原型单独分支保留，按工单约束不并入产品集成分支；阅读 [02 原型记录](implementation/02-prototype.md)和 [11 中实际页面证据](implementation/11-acceptance.md)即可继续。
- 办公室需要本地配置可用模型、兼容的官方原生构建及公共依赖。不要将验收机 profile 整体覆盖到办公机，也不要把密钥提交到 Git。
- 仓库根 README 的旧 `pnpm start`、`personal-workbench` 安装命令属于旧平台，不能证明新 Worktable 派生包已安装。新包按 [SDK 合同](implementation/10-sdk-contract.md)及对应插件脚本构建；Worktable 唯一打包入口是包根目录的 `npm run pack`，随后在隔离 profile 用官方 CLI 安装并检查实际页面。
- 当前派生包与上游仍共用包名、Cordis/ModuleLoader 身份；不得在同一 profile 同时安装两者，也不要用上游 latest 下载地址替换本派生包。
- 所列宿主版本声明不等于全部实测；本轮不外推 alpha.2、macOS 或完整 Desktop 业务兼容。38 份已核验本地发布归档和 11 张任务分支保留，已授权清理的 11 个临时工作树已移除；接续不能依赖那些 `.scratch` 检出目录。

## 后续从什么开始

建议下一阶段先优化“项目选布局 → 模块内配置 → 旁边原生对话”的实际使用流程，再补完整搭建器与通用展示组件、AI 生成追改，最后补齐故障/升级与旧数据迁移验收。考公保持暂缓。该顺序是[待讨论的下一阶段路线](technical-roadmap.md#后续建议路线)，本次没有发布新工单或把建议当成用户已批准的实现范围。
