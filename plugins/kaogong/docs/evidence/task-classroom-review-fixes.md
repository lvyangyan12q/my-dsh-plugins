# 任务课堂双轴评审修复

日期：2026-11-13。工作树 review-fixes，分支 ticket-review-fixes；基线及提交前集成 tip 为 `859d1b9`。仅修改 plugins/kaogong，不安装、不访问或调整3080、不重置或暂存他人数据。

## 修复

1. 显式教学/补讲一次准备并提交，传递本次用户文本意图；服务端仍从课堂/轮次记录生成可信证据。检测补讲增加 questionId/section/choice，Host核验属于该课堂已保存错题，拒绝伪造引用；意图文本明确不作为评分依据。动作ID持久于草稿，客户端在未确认结果期间保留同动作ID，成功后下次主动动作可生成新ID；同动作查原记录，unknown/submitting不自动重发。
2. 准备/提交不再调用客户端 tasks.open/roles.open。班主任讨论同样保留插件内并复用原生会话渲染能力；无能力时真实报错，不伪造聊天。只有“查看完整对话”显式导航。Host发送前仍保留绑定、授权与快照校验（Host open是身份校验，不是客户端导航）。
3. taskCentered恢复按lesson身份保留当前dirty总结或读取该课持久草稿，服务端start笔记不覆盖刷新后的同课未保存总结。原有过期请求与切课保护保留。
4. historicalHandoff prepared保留只读但不再被新准备复用，新准备重新执行owner/授权/任务会话核验；accepted/submitting/unknown仍受保护。
5. 窄屏内容/答疑tab支持ARIA关联、方向键/Home/End和焦点；CSS隐藏非当前pane而不卸载原生宿主，草稿与唯一输入所有者不重建。宽屏原主辅并排及控高规则保留。

## TDD与正式门禁

- 加载tdd skill，沿既有服务公开prepare/submit/recover与页面集成seam补回归。
- 历史prepared：RED 8/9（复用旧稿），GREEN 9/9。
- fresh owner dirty恢复：RED 5/6（总结变空），GREEN 6/6，原迟到任务响应用例保留。
- 显式动作：RED错误navigate-role而非submit；GREEN一次submit且unknown不重发，并断言意图/actionId传递。
- 窄屏tab与班主任内嵌：RED 0/2，GREEN 6/6（既有课堂测试合并）。
- 结构化quiz补讲引用：RED不支持结构；GREEN合法保存引用可准备、foreign/fake引用拒绝，课堂快照变动拒绝。
- 新测试注册正式test-current.mjs，并纳入此前遗漏的task-classroom页面测试。
- 最终命令：`DSH_SOURCE=D:/programming/workspace/deepseek-harness node scripts/test-current.mjs`：Host69/69、Client86/86、Integration5/5，总160项通过，0失败。
- `node scripts/check-client-types.mjs`、`node scripts/check-host-types.mjs`：均通过官方公开声明检查。
- 首轮全量69/69 Host、81/84 Client；3项旧自动导航断言按已确认新规格改为“不导航并内嵌”，未放宽业务/评分断言。正式runner曾因此失败，后续全量通过。
- 运行中存在既有LearningRoutePanel act警告，不视为浏览器验收通过。
- 提交前执行 `git merge --no-edit feat/kaogong-task-classroom`，结果Already up to date（859d1b9）。

## 合并后键盘切换补修

- 先合并最新集成tip `9b046e1`（fast-forward）。
- 复核发现：收起答疑后，鼠标选择答疑会展开，但Arrow/End仅切pane而不展开。
- 新增页面行为回归：收起答疑→内容→ArrowRight/End选择答疑，断言body展开、同一textarea节点及未发送草稿保留。RED明确失败于 `ArrowRight must expand the native body`（hidden仍true）。
- 鼠标和键盘统一通过selectPane选择helper，选择conversation同时展开，其他布局/会话生命周期不变。
- GREEN相关回归：classroom-teacher-session、sdk-classroom、task-session-binding共14/14通过；client官方公开声明typecheck通过。本补修未重跑全量，不把此前160项结果改记为本补修后的全量结果。
- 不安装、不操作3080或浏览器；真实验收限制仍如下。

## 仍待真实验收

本次仅源码自动化，不安装、不运行真实模型、不操作3080或浏览器。真实模型流式、审批/问题/Stop、中文输入、真实窄屏尺寸/容器布局与键盘、准确发行包安装、冷启动/多视图仍待做；jsdom与类型检查不替代这些门槛。不宣称规格全部验收或已发布。
