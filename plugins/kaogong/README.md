# Kaogong

DSH Web `0.2.1-rc.3` + Worktable `0.10.0-rc.3.2` learning application: notebook, plan/progress, question bank, knowledge reader, durable practice and lessons. Install the prebuilt bundle through the [official release instructions](../../README.md#prebuilt-installation).

## rc.3 Application Boundary

The Host and client register through the public Worktable SDK. Learning instances start empty; the separate source-library instance exposes original bank/material rows through explicit read-only grants. Notes, scores, lessons and role Sessions remain instance-private. Each HTTP/asset request requires the registered `viewId`; native tools use the actual execution Agent Session, never a model-supplied instance selector. Subject teacher presets retain their original IDs.

Owned review/lesson preparation has no send side effect. Actual native admission claims the business record; only a known accepted and flushed receipt finalizes its sent marker. Unknown admission is retained for inspection. Recovering an accepted task's marker never resends the native message.

Legacy absolute paths below are preserved configuration references, not automatic data access grants. The rc.3 candidate does not open, repair, import, collect or move old data on activation. Historical image/job access remains unavailable until the explicit migration preview and ownership mapping in ticket09; the two verified bundled images remain available. New parser jobs are scoped to the creating instance. Do not remove old data or rollback packages.

For source builds set `DSH_SOURCE` to a built, unpatched official rc.3 checkout. Run `npm run typecheck:host`, `npm run test:platform`, then `npm run pack`. The pack entry checks current Host/Client contracts and package contents and creates an immutable versioned archive in `releases/`; it refuses an existing filename. Legacy alpha-specific view fixtures are retained for their frozen artifact, and are not the current SDK classroom gate.

## Configuration And Preservation

Edit the native profile's `kaogong` entry:

```yaml
config:
  roleCwd: /absolute/existing/work-directory
  questionImageRoot: /absolute/existing/question-images
  mineru:
    outputDir: /absolute/durable/mineru-results
```

Use absolute native paths on your platform. These are examples, not defaults. `roleCwd` is required before creating new native role Sessions; persisted Sessions keep their original identity/cwd. `topN` defaults to 8.

`questionImageRoot` reads historical image assets without copying or changing them. Only safe relative image paths beneath its real directory are served; traversal, unsupported extensions and escaping symlinks are rejected. The two reviewed bundled material images remain available when the historical root is absent.

`mineru.outputDir` is explicitly required for document reads and new parser work. There is no package-relative, current-directory or home-directory write fallback. Preserve the exact old absolute result path when upgrading. Missing or relative optional roots leave bank, practice, notebook, plan and lessons usable; affected image/document operations report local unavailability. Startup skips parser migration/import until an absolute result root is configured. A configured missing image returns not-found, never fabricated content.

MinerU token/model/output settings and the historical image root use rc.2's native live configuration references. Token fields are secret-redacted; an update that omits the token preserves it. A live root change affects later reads without remounting the business-domain owner. Do not change output roots while parse jobs are outstanding. Existing results are not moved.

The optional parser calls an external service only when explicitly invoked with an authorized PDF and configured durable output root. Token fallback remains `MINERU_TOKEN`; keep secrets on the Host, outside archives and client data. No PDF parsing, upload or network request is performed by the release checks.

Image GET/HEAD routes use the official same-origin/platform and browser-cookie guards. A normal same-origin image request needs no Origin header; absent cookies and cross-site/foreign/null origins remain denied.

For transition from a manual source/junction entry, follow the [preservation steps](../../README.md#existing-manual-installation). Keep the same business storage and credential references; disable the old entry through official configuration instead of activating both or deleting old material.

## Learning Contracts

Practice issues real rounds of ten approved questions (or the explicit available remainder), cycling by original question IDs. Answers/analysis are concealed before submission. Host-issued membership and full answers determine the trusted score; model prose and Client values do not. Durable identical submissions return the same result; conflicting retries are explicit. Notebook projection recovery preserves newer attempts and reflections.

Lessons capture objectives, material links, authoritative submitted rounds and explicit completion. Summary prose cannot complete tasks. Review hands off to native counselor key `kaogong/default/counselor` without a subject; teaching uses a subject-explicit teacher key. Native Sessions and assignments remain workbench-owned. The Client consumes the Workbench public display runtime. If its role/task services are unavailable, business records and standalone learning remain usable; teaching preparation reports unavailable.

Host and Client have separate real declaration entries. `Config` describes resolved runtime values: `questionImageRoot` and `mineru` are native `Volatile` references, read with `.get()`; raw profile YAML remains plain data. Client `KaogongView` can be hosted by the workbench or standalone shell, with one owner for the default instance.

## Verification

The package declares dev-only UI/test tools; production archives contain neither fixtures nor test dependencies. Build/test scripts are in `package.json`. Set `KAOGONG_TEST_RUNTIME` to the built official checkout, and optionally `KAOGONG_TEST_TOOLS` to an explicit compatible development tool anchor. The root combined build compiles workbench first and Kaogong against its newly emitted declarations.

See [ticket11 evidence](../../docs/ticket11-release-evidence.md) for archive, installed consumer, data preservation and runtime checks. Native completed turns, interactive controls, desktop/narrow screenshots and rendered image pixels remain pending; passing synthetic DOM or PNG-byte checks is not visual acceptance.

## Application Platform Integration

The application registers its own `kaogong/knowledge` display source. Knowledge search, subject/type filters, material counts, lists and selected details use the same public `DisplayStore`/`DisplayModule` components as reading statistics. Full document bodies, tags and original image routes remain available; Kaogong owns the `DocumentMarkdown` detail renderer and all learning storage.

Lecture, committed-round review and classroom continuation prepare visible tasks for the existing `kaogong/default` teacher or counselor. Preparation neither ensures a Session nor sends a native command. Users can edit the task and each evidence chunk, remove evidence, or cancel. Explicit send keeps the declared `kaogong-teach` provider/body preflight and targets the original native role scope. Classroom continuation rechecks the saved binding before sending instead of creating a replacement during preparation.

Review reserves the durable round only when explicitly sent, so competing windows cannot both send it. An admission failure keeps the original prepared task retryable; a refreshed uncertain reservation requires inspecting the counselor conversation. Actual admission clears the prepared task before completion bookkeeping. A local delivery marker suppresses repeat sends if completion storage fails; the recovery button retries only the Host completion operation. Lecture and review do not automatically complete lessons or check off the plan.

### 核验过的练习图示补充

可在持久 `questionImageRoot` 的 `verified/associations.json` 保存版本 1 的本地核验索引。每条 `associations` 记录包含 `questionId`、原题 `stemSha256`、`verified/` 内的图片 `asset` 与 `assetSha256`、核验来源 `sourcePdfSha256` 和从 1 开始的 `sourcePage`。图片文件名只允许字母、数字、下划线和连字符；不支持路径穿越、外部链接或 SVG。

插件启动时核对索引、图片哈希与实际路径；展示时再核对题目身份和原文哈希。来源信息由本地核验者登记，并非自动 PDF 内容认证。索引缺失时保持原题；索引错误时保留原题并记录固定错误说明。图片或索引更新后需重新加载插件。

补充图片只进入练习和复盘展示，不改原题文本、选项、答案、既有练习快照或成绩。修改资料根目录后，不再沿用旧根目录的关联。私有索引和图示保留在资料目录，不进入插件发行包或公共仓库。

### 学习窗口刷新恢复

独立学习窗口保存打开状态、课堂/讲义/练习/错题页面、窄屏内容/对话页签及角色/教师科目的展示选择。浏览器刷新后，显式重开工作台或独立考公入口时恢复这些选择；不会自动新建角色会话或发送任务。分栏比例继续使用已有展示缓存。

版本 1 的偏好缓存在浏览器本地，限定默认考公实例和已知页面、角色与科目。损坏记录、未知版本或额外字段被忽略；禁用存储或容量不足时仍能在当前页面学习。缓存不保存会话 ID、消息、未发送草稿、题目或学习成绩，角色会话仍由 DSH 的持久关联提供。

### 客户端产物加载检查

三插件构建后，`scripts/check-client-module-artifacts.mjs` 使用当前官方 DSH 的平台种子与 ClientModuleSystem 加载实际客户端产物，并覆盖无工作台的独立考公工厂。客户端的 require 不向 Node 依赖目录兜底，因此仅 Host 安装的依赖不能掩盖浏览器启动失败。发行验收在官方 CLI 精确归档安装后，用同一检查从隔离 profile 解析三插件的实际安装路径，再次核对客户端工厂。

检查不激活 Cordis 入口、不执行模型调用，也不验证页面渲染；仅为 Node 中导入平台种子提供空 CSS 模块绑定。正式图文、输入、对话和生命周期仍需实际安装后的浏览器验收。


### 已核验选项页脚投影

可在同一持久图片目录的 `verified/option-repairs.json` 保存本地版本 1 索引。`associations` 每条包含 `questionId`、原题 `stemSha256`、`optionsSha256`（原选项数组 `JSON.stringify` 的 SHA-256）、`optionIndices`（从 0 开始）、`sourcePdfSha256` 和从 1 开始的 `sourcePage`。

维护者必须先唯一定位并视检原 PDF 的对应选项，再创建关联。当前仅支持排除指定选项末端的明确广告 `公考最新资料、更新进度微信 SKA674`，不支持任意替换选项、截掉未知后文或写入答案。题干和全部选项都必须与核验时的内容哈希一致。来源哈希和页码提供人工核验记录，不表示程序已经核实 PDF 内容。

修复仅影响公开练习题面和提交后结果显示；题库、发题快照、答案与原解析保持。无索引、内容改变或无可确认末端广告时保留原选项；索引超界、无效或重复时记录加载失败并保留原内容。索引与资料应留在本地私有资料目录，不能随发布包上传。


完整原题显示恢复仍采用私有内容固定关联。`verified/associations.json` 单行可选 `displayMode: "source-image"`，仅在源题本已完整裁出材料、指定题面与全部选项，并视检排除答案、批注、相邻题后使用；未设置时仍追加图示。`verified/option-repairs.json` 单行可选 `sourceOptions`（完整显示选项数组），用于原PDF确认的页码残留或图选项恢复；须选项数量、原字母键和全部 `optionIndices` 一致，原题干与原选项数组哈希一致。不得猜写选项或答案。原始题库、已发快照与评分不改，pending题必须继续显式审查，认证索引不会自动批准。未知或哈希改变的污染记录暂缓练习并提示修复。

源选项使用原 PDF 图形时，`sourceOptions` 可写 `A. ![原题 A 选项](题目_images/verified/option-A.png)`，并在同一关联 `sourceAssets` 提供 `{ asset: "verified/option-A.png", assetSha256: "<SHA256>" }`。所有图片引用须逐项裁剪、人工来源核验并固定字节；外部 URL、未关联图片或变更字节将拒绝加载。该显示投影不改变待审状态，不能替代人工题库审核。


### rc.3 接管根目录

legacyMaterialRoot 是仅在明确旧数据预览时读取的材料集合绝对根；它与解析器实际作业根 mineru.outputDir 独立。例如集合根为 materials/kaogong 时，既有作业根可能为 materials/kaogong/storage/mineru。不得把解析器 outputDir 改为集合根，也不从 outputDir 猜测父目录。题图根 questionImageRoot 另行明确配置。留空的集合根不自动接管材料，普通新实例不会读取旧库。离线预览分别传 --material-root、--question-image-root、--mineru-root；它始终不执行原生接管。
