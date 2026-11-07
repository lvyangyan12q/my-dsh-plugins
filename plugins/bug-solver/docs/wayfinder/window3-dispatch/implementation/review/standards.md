# Code review · Standards 轴

范围：`git diff 2560c41...HEAD`（bridge 13 lib + 15 test、window3-dispatch.html、两个 smoke、README）。
标准来源：README（唯一文档化标准）+ Fowler smell baseline；无 linter。

## 硬违规

1. README 的「文件 / 数据文件 / 自检」三段未覆盖新增子系统：`bridge/`（lib 13、test 15）、`window3-dispatch.html`、`scripts/smoke-window3-page.cjs`、`npm test`、`allowedRoots` 配置全无记录。
2. README:17-19 称 `bug-solver.dispatch.draft.v1` 是「按 bugId 幂等的真相」；`window3-dispatch.html:211` 只读 compat 单键、:570-574 只清 compat，从不读该 store → 同一契约两套真相，与文档不符。

## baseline（judgement call）

- Duplicated Code：`prompt-failed → #markUnknown + delivered-unknown` 五份（dispatch-service.js:269-276 / 407-414 / 430-437 / 578-584 / 642-645）；「建会话 + 校验 id + 改名告警」在 start:244-265 与 #startReview:599-621 同形；`warnings.push({code,message,at})` 4 处（264/615/659/726）。
- Duplicated Code：路径前缀判定两份（paths.js:16 `isInside`、host.js:49 `inside`），win32 大小写处理不一致；requestId 语法写两处——拼串 dispatch-service.js:374/396/631，正则解析 session-log.js:14。
- Duplicated 规整+脱敏三层（session-log.extractMessages → host.listMessages → dispatch-service.messages:152-167 再次 redact/白名单）。
- Speculative/死代码：index.js:119-141 `holder.error` 只写不读，routes.js:75 仍报「桥未配置」，真实原因到不了用户；host.js:37 `HOST_SERVICES`、verdict.js:50 `VERDICTS` 导出无人使用。
- Repeated Switches/散弹：状态词表三份（dispatch-service.js:21 TERMINAL_STATES、window3 PHASES:219-239、README），加一个状态要改三处。
- 两个 smoke 各自重建 jsdom 夹具（响应/等待/断言），且 jsdom 走硬编码绝对路径（两文件 :10），README「自检」只在作者机器成立。

## 最严重

README 与实现存在两套派发真相（第 2 条），且 bridge 整体未文档化——唯一标准同时失效，他人无法据此实现或验收。
