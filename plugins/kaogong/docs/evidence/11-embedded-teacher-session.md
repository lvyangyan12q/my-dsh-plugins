# 票 01 证据：课堂内嵌真实老师会话

- 票：[`01-embedded-teacher-session.md`](../../../../.scratch/kaogong-task-centered-learning/issues/01-embedded-teacher-session.md)
- 分支：`ticket-01-embedded-session`，基于 `feat/kaogong-task-classroom`；提交前已把该分支最新提交 `05e37e5`（票 02：从今日直接进入任务课堂）合入本分支，冲突仅 `src/sdk-classroom.tsx`，按票 02 的「课堂页隐藏角色设置 + `taskCentered`」保留其改动并接上本票的答疑区。
- 结论：公开扩展点足以支撑本票的行为，**已交付真实内嵌**，没有使用能力缺口收尾；本文如实列出本工作树无法完成的真实模型验收，以及一处非阻断的公开观察能力缺口。
- 交付日期：2026-11-09

## 交付内容

| 文件 | 作用 |
| --- | --- |
| `src/embedded-session.tsx`（新增） | 根作用域 slot 用 `ctx.sessions.retain` 保留指定 sessionId，公开 `SessionProvider` 建立会话作用域；会话作用域 slot 复用公开 `conversation.content` Factory，`views` 固定到原生 `conversation.session {view:'chat'}` |
| `src/client.tsx` | 注入 `sessions`；主面板声明 `kaogong.teacher.session`；注册宿主与内容两个 slot；把 `renderSlot('kaogong.teacher.session',…)` 作为 `renderTeacherSession` 交给课堂 |
| `src/sdk-classroom.tsx` | 课堂页按当前老师角色绑定（`roles.ensure`）取得唯一 sessionId，挂载答疑区；离开课堂、切科或绑定失败即卸载/如实报错 |
| `src/study-client-contracts.ts` | `StudyViewProps.renderTeacherSession`：内嵌位置缺席时课堂不挂任何对话 |
| `package.json` | `dsh.client.inject` 增加会话控制器；`@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-session` 仅作为类型依赖 |
| `scripts/test-current.mjs` | 把三个新测试加入客户端回归组 |

## 用到的公开接口（只读核对结论）

1. `ISessions.retain(target, {source, signal})` → `SessionReference`（`ready`/`binding`/`release`），释放即结束本地作用域；`ready` 的拒绝由引用自身吞掉，不会产生未处理拒绝。来源 `packages/api/session-controller/src/client/contract/sessions.ts`、`.../sessions/service.ts`（`ClientSessionReference`）。
2. `SessionProvider session={reference}`：会话作用域 seat；`SlotScopeTargetMap.session` 的类型就是 `SessionReference`（`packages/client/ui-session/src/client/index.ts`）。绑定源在引用失效时抛错，因此切会话时先渲染“正在打开”而不会使用已发布的旧引用。
3. `renderFactorySlot('conversation.content', {variant:'embedded', phase:'active', hero:false}, {slots:{views}})`：Factory 是公开注册点（`packages/client/ui-conversation/src/client/apply.ts` 注册，`.../contract/slots.ts` 声明），嵌入式出现不是私有路径。
4. `conversation.session {view:'chat'}`：与原生会话页同一条 `conversation.session` → `conversation.view` 渲染链，消息、流式增量、工具过程来自同一个 `useConversation` 快照，不复制缓存。
5. 审批与追问同属 Factory 的子 slot：`ui-approval` 与 `ui-user-questions` 都注册到 `conversation.composer` 链（`packages/client/ui-approval/src/client/index.ts:97`、`packages/client/ui-user-questions/src/client/index.ts:382`），而该链在 `ConversationContent` 内渲染（`ConversationContent.tsx:173-177`）。Stop、排队与草稿都在同一个 `conversation.composer.bar` / `conversation.input.dock` 里，因此随内嵌出现，无需插件自造控件。
6. 输入所有权：布局的 `main` 是 keyed slot，`AppFrame` 只分派当前 `entryKey`（`packages/client/ui-layout/src/client/AppFrame.tsx:49`），所以同一时刻只有一个主面板在渲染；插件只在主面板课堂里挂载一次答疑，右栏 `kaogong-learning` 标签（与原生会话页并存）**不**声明答疑 slot。

## 验收对照

| 票内验收项 | 状态 | 证据 |
| --- | --- | --- |
| 课堂内显示与指定 sessionId 一致的真实会话，消息与宿主一致 | **成立（接线，jsdom 实测）** | `tests/embedded-teacher-session.test.tsx`：断言 retain 的 id/source、`SessionProvider` 收到的引用即该 sessionId、内容来自 `conversation.content` 且视图为 `chat`；`classroom-teacher-session.test.tsx` 另断言答疑跟随当前教师科目绑定（`teacher.data-analysis`），不猜全局当前会话；真实渲染同一条原生链路由上面第 4 条静态证据给出 |
| 能发送问题并看到流式回答与工具过程 | **接线成立；真实流式未实测** | 输入框与消息流是原生 Factory 的组成部分；本工作树未跑真实 Agent（见“未实测”） |
| 审批与追问浮层在课堂内可操作，不跳到原生会话页 | **接线成立；真实浮层未实测** | 两者是 `conversation.composer` 链的 takeover，位于 Factory 内部；未真实触发审批 |
| 停止只取消当前回答，界面与输入状态可继续使用 | **交给原生 Stop，未实测** | Stop 是 `conversation.composer.bar` 注入的 `stop`（`contract/slots.ts:562`），插件没有替换或包一层 |
| 同一会话不会出现两个争用输入的输入框 | **结构上成立（实测插件侧）** | 课堂页最多挂载一个答疑区（`classroom-teacher-session.test.tsx` 断言恰好一个）；右栏面板不挂载（同文件第二个测试）；主面板 keyed 分派由布局保证 |
| 退出课堂后释放会话引用，不遗留占位或后台占用 | **成立（jsdom 实测，按引用计数）** | `embedded-teacher-session.test.tsx` 断言卸载后 `release` 恰好一次；`classroom-teacher-session.test.tsx` 断言离开课堂后 DOM 中无内嵌会话，回到课堂重新取同一绑定 |
| 若判定能力不足：给出缺口清单与拟申请接口 | 不适用（未走缺口收尾）；残留观察缺口见下文 | — |

## 实测命令与结果

```powershell
cd D:\programming\workspace\my-dsh-wt\t01\plugins\kaogong
$env:TSX_TSCONFIG_PATH='D:\programming\workspace\my-dsh-wt\t01\plugins\kaogong\tsconfig.test-client.json'
node --import tsx/esm --test tests/embedded-teacher-session.test.tsx tests/classroom-teacher-session.test.tsx tests/teacher-session-wiring.test.ts
# 8 passed / 0 failed

node --import tsx/esm --test tests/sdk-classroom.test.ts tests/classroom-layout.test.tsx tests/second-lesson.test.tsx tests/quiz-persist.test.tsx tests/task-classroom.test.tsx
# 27 passed / 0 failed（含合入的票 02 课堂测试）

$env:DSH_SOURCE='D:\programming\workspace\deepseek-harness'
node scripts/test-current.mjs --client
# 52 passed / 1 failed
# 失败项 tests/standalone-client.test.tsx «first opening is read-only…» 期望四级导航，
# 基线分支缺少「课堂」一项；已用 git stash 在 5bbd77f 干净树复跑，同样失败，属基线既有问题，
# 与本票改动无关，未在本票内顺手修改。

node scripts/check-client-types.mjs   # Kaogong Client: official public declarations passed
node scripts/check-host-types.mjs     # Kaogong Host: official public declarations passed
```

## 未实测（本工作树无法完成，留给切片 F 的门禁）

运行中的 3080 实例安装的是主仓 `plugins/kaogong` 打出的 tgz，不是本工作树；本工作树内插件没有自己的 `node_modules`，`scripts/build.mjs` 要求物理构建工具在插件目录内（`PLUGIN_PHYSICAL_BUILD_TOOLS_REQUIRED`），因此**没有**构建并安装本票版本。以下行为只有静态链路与 jsdom 接线证据，没有真实模型验收：

- 真实 Agent 的流式增量、工具调用展示；
- 真实审批/提问浮层在课堂内的可见性、键盘焦点与提交；
- 点击原生 Stop 后的界面与输入状态；
- 双视图/窄屏/中文输入法/冷启动恢复；
- 内嵌对话在真实浏览器中的高度与滚动布局（`.kg-teacher-session-embed` 依赖两级 flex 传递，需实测）。

## 残留观察缺口（非阻断，不要求本票返工）

公开接口没有“当前主视图显示哪个会话 / 哪个输入框拥有该会话输入”的直接信号。`ctx.sessions.retainInfo(id).retainedBy.mainView` 能间接说明主视图是否仍持有该会话（UI 会话层自己也只依赖这个来源，见 `ui-session/src/client/index.ts:460-484`），但它不是输入所有权契约，也不覆盖未来的其它会话显示面。

因此本票的“单输入框”是**结构保证**（插件只在唯一主面板里挂载一次、右栏不挂载），不是运行时断言。若后续出现第二种同会话显示面，宜申请一个公开的输入/显示所有者观察接口（例如在 `retainInfo` 之外暴露按 source 的“显示中”投影，或由会话层公开 `composer owner`），再让插件在冲突时禁用其中一处。当前没有该需求，故未申请。

## 明确未做的事

- 没有导入 Harness 私有源码，没有自造聊天框，没有复制消息缓存；
- 没有修改右栏学习面板的既有流程（仍在原生会话页旁提供学习侧栏）；
- 没有改动角色配置 UI（属切片 C）；
- 没有因为本票去修基线里那条过期断言。
