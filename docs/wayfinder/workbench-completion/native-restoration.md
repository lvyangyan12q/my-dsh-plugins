# 原生恢复与插件适配调整

2026-10-11用户明确要求恢复原生仓库，将改动转记Ticket，后续调整工作台。目标原生HEAD：`639ed015397290b3745d163aafe02ffee4aa3f84`。原生不再作为工作台功能补丁落点。

## 受影响工单

- [01-runtime.md](implementation/01-runtime.md)：原生菜单扩展：曾新增sidebar.sections插槽及SidebarRoot渲染、类型、测试/快照。后续工作台只使用目标DSH已有公开扩展位，不再要求修改原生菜单。没有对应插槽时选择现有公开入口并明确限制；不改原生布局、不操作内部存储。侧栏实例清理同样不得依赖新增retireTabsByKind；无公开持久清理能力时不注册无法安全卸载的原生标签，使用插件自有窗口或受支持入口。

- [05-native.md](implementation/05-native.md)：原生会话扩展：曾新增conversation.session.chrome工厂供嵌入标题栏使用；composer-surfaces及editor/root/keymap绑定解决同Session多个输入面竞争。后续只复用已有公开会话/轨迹/审批/Stop接口；优先单一原生编辑面，必要时通过公开导航打开原会话。不修改原生编辑器来适配插件，不要求新chrome工厂或内部服务。保持同Session、草稿、原生模型/权限操作；缺少公开嵌入能力时明确降级。

- [06-annotation.md](implementation/06-annotation.md)：图片暂存扩展：曾在原生ConversationController增加stageImages接口以及回滚图片附件支持。后续标注在插件内保存位置/文字/截图，追加文字走已支持公开命令；图片只用已有公开附件入口或用户显式附加。不向原生增加stageImages，不调用其私有草稿/上传实现；缺少接口时说明图片需手动附加，不能悄悄上传或发送。

- [11-release.md](implementation/11-release.md)：验收基线改为未经工作台补丁的原生HEAD639ed015397290b3745d163aafe02ffee4aa3f84。此前native2ea补丁运行时上的406回归及实页结果只保留为历史证据，不能证明无补丁兼容。取消强制sidebar.sections、conversation.session.chrome、stageImages、retireTabsByKind及composer修改的安装/构建前提。后续在干净原生上重新构建、官方安装和完整平台闭环；缺失可选能力明确说明并保持入口/数据。不能用夹具新增这些服务来冒称兼容。

- [12-delivery.md](implementation/12-delivery.md)：正式交付仅安装/更新my-dsh插件和必要插件配置；禁止对原生仓库打补丁、替换原生lib或改变其菜单/编辑器。原生恢复先做完整变更与受影响编译产物备份；25个tracked修改恢复HEAD，两个本次新增composer源/测试移到备份，本地.dsh及kaogong.cordis.yml保留。原生重新构建后验证Git差异及不再含新增接口。插件完成无补丁适配并重新验收后才同步3080和远程。

## 原生恢复文件清单

以下25个Git跟踪文件恢复HEAD；它们涵盖接口、实现、文档、测试和快照，不能仅按文件数认作25项功能：

- `docs/subsystems/slots.md`
- `docs/subsystems/slots.zh.md`
- `packages/client/ui-conversation/README.md`
- `packages/client/ui-conversation/README.zh.md`
- `packages/client/ui-conversation/src/client/apply.ts`
- `packages/client/ui-conversation/src/client/contract/slots.ts`
- `packages/client/ui-conversation/src/client/input/editor/ComposerContentEditable.tsx`
- `packages/client/ui-conversation/src/client/input/editor/DraftEditor.tsx`
- `packages/client/ui-conversation/src/client/input/editor/view-binding.ts`
- `packages/client/ui-conversation/src/client/service.ts`
- `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`
- `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx`
- `packages/client/ui-conversation/tests/apply-wiring.client.spec.tsx`
- `packages/client/ui-conversation/tests/input-bar.client.spec.tsx`
- `packages/client/ui-conversation/tests/service-orchestration.client.spec.ts`
- `packages/client/ui-sidebar/README.i18n.yaml`
- `packages/client/ui-sidebar/README.md`
- `packages/client/ui-sidebar/README.zh.md`
- `packages/client/ui-sidebar/src/client/SidebarRoot.tsx`
- `packages/client/ui-sidebar/src/client/contract/slots.ts`
- `packages/client/ui-sidebar/src/client/index.ts`
- `packages/client/ui-sidebar/tests/__snapshots__/sidebar-snapshot.client.spec.tsx.snap`
- `packages/client/ui-sidebar/tests/apply.client.spec.tsx`
- `packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx`
- `packages/client/ui-sidebar/tests/sidebar-snapshot.client.spec.tsx`

本次新增的两个composer文件归档后从原生源码树移出：

- `packages/client/ui-conversation/src/client/input/editor/composer-surfaces.ts`
- `packages/client/ui-conversation/tests/composer-root-ownership.client.spec.tsx`

`.agents`无Git差异，未改。`.dsh/`与`kaogong.cordis.yml`作为本地配置保留，不清理。既有会话、成绩、原题/资料、正式profile与凭据不回滚。恢复补丁、源文件和受影响lib的逐文件SHA备份仅保存在my-dsh/.local，不上传。隔离工作树中的retireTabsByKind提案与代码不部署到原生。

## 完成边界

源代码恢复与原生编译产物重建分别核验。旧补丁环境通过不等于新约束验收通过；后续工作台无补丁兼容仍是open工作。


恢复结果：原生25个跟踪文件已恢复至639ed015，2个新增源码/测试文件已归档。原生build:lib（host与client）通过，新增composer编译残留已归档，相关运行包不再包含新增插槽与stageImages。Git跟踪文件无差异；本地配置及链接保留。工作台无补丁适配仍待实施，本记录不代表3080应用闭环验收通过。
