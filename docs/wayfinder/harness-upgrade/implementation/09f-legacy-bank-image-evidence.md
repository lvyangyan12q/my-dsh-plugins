---
id: harness-rc3-legacy-bank-image-evidence
title: 原题图片引用连续性与人工核验覆盖图的只读证明
parent: harness-rc3-legacy-adoption
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-rc3-legacy-inspection, harness-upgrade-kaogong-ownership]
target: 0.2.1-rc.3
---

本票只交付独立离线图片清单、精确字段/引用绑定与读取接口。题库已有 Markdown 图片引用的连续性，区别于新增人工核验覆盖图或选项修复；前者不要求后者的人工索引。正向结果不等于 PDF 正确性、答案正确性、共享授权或正式迁移确认。本票不关闭父票 09、原生安装验收或完整 HU08。

模块为 `plugins/kaogong/src/legacy-bank-image-evidence.mjs`，公开类型为同名 `.d.mts`，不改变 09d 知识来源模块。输入必须是私有完整 09a 快照及显式绝对 `questionImageRoot`；原题包含 document-image 链接时，可另行显式指定 `mineruRoot`，不发现隐式 home/配置或猜测其他资料目录。文档路径解析/包含性通过与 09g 共用的 `legacy-document-paths.mjs` 元数据接缝完成，授权仍分别由题库和私有学习所有者负责。

| 接口 | 行为 |
| --- | --- |
| `inspectLegacyBankImageEvidence({ snapshot, questionImageRoot, mineruRoot?, io? })` | 只读返回私有 `evidence` 及只有计数、状态和哈希的 `summary`。 |
| `revalidateLegacyBankImageEvidence({ snapshot, questionImageRoot, mineruRoot?, evidence, io? })` | 重新读取固定依赖并重新计算证明，变化即拒绝。调用方必须使用新生成的 09a 快照，以验证业务源 revision；旧快照自身不证明业务库未变化。 |
| `readLegacyBankImageAsset({ evidence, questionId, asset, bindingKey, io? })` | 仅读取该题目已证明、已绑定具体字段/引用的图片；先复核根身份、对应原路径别名、索引及资产哈希。 |
| `writeLegacyBankImageEvidence({ snapshot, questionImageRoot, mineruRoot?, output, io? })` | 可选回执输出，显式绝对新文件，以 `wx` 创建，拒绝源 home/图片根/MinerU 根内路径和目录别名，已有文件不覆盖。 |

`evidence.questions` 按题目 ID 固定完整 record 哈希、原始 stem/options/explanation 哈希、人工索引声明（如有）及图片列表。图片按根内精确 `asset/relativePath/sha256` 固定，并包含 `bindings`。绑定字段为 `bindingKey`、`provenance`、`field`、可选 optionIndex/referenceIndex、`reference`、`referenceSha256`、`fieldSha256`。`reference` 是 Markdown 圆括号内的原始目标字符串；不 trim、不百分号解码、不做 URL 规范化。`referenceSha256` 仅哈希该字符串的 UTF-8，不包括周围 Markdown。`bindingKey` 固定这些字段，读取时必须精确匹配。

调用方必须先授权可信来源所有者/题库资源，再从 Host 保存的清单中选择 questionId/asset/bindingKey。浏览器或模型不能选择来源根或伪造证明。路由可以精确匹配清单已保存的 asset、reference 或原路径别名，不可把任意浏览器路径规范化成可读文件。证据哈希是完整性校验，不是 MAC 或访问授权。私有证据包含记录身份和本地引用，不能公开、放入模型提示词或加入 Git。

三类证明分别保留：

- `legacy-embedded-reference`：原题 stem/options/explanation 内已有的字面本地引用，固定原题/字段/引用哈希和当前图片文件哈希。支持精确 `题目_images/` 前缀（以及其 Windows 分隔形式）和已有本机绝对路径；绝对原路径只先解析元数据，规范路径必须在显式图片根内才读取字节。原路径与规范目标均记录并复核。它保留已有链接，不宣称经过人工 PDF 校对。
- `legacy-embedded-document-reference`：原题已有的字面 `/api/kaogong/document-image?id=...&asset=...`，独立按题库记录/字段/引用绑定。只在显式 MinerU 根的 version 1 清单中唯一匹配已完成任务，并核对原 job.json 的 id/source/pages/subject/title 后，读取该任务自己的 `assets/<asset>`。参数只解码一次，拒绝额外/重复参数、跨任务 symlink 和根外目标；固定根身份、清单、任务、图片哈希，不借用任何私有知识授权或推断知识 kind。此为原题引用连续性，不是重新解析 PDF 的证明。
- `verified-stem-association` / `verified-option-association`：新增展示覆盖图或来源选项图片，严格遵守现有 `verified-practice-materials.ts` 定义。version 1 人工索引须固定 questionId、原 stem 哈希及图片哈希；选项索引另需原 options 哈希、完整 optionIndices/sourceOptions 对应、选项字母及精确 sourceAssets。仅引用的 sourceAssets 可读；失败的选项证明不能部分贡献图片。原索引声明的 PDF 哈希/页码单独保留，不把它称为本模块重新解析 PDF 的证明。

外部 URL、UNC 网络路径、未知协议、父目录穿越、双重编码路径、根外 symlink/junction、未被该题目引用或覆盖索引关联的文件不会得到读取许可；不扫描图片目录，不按目录通配授权。缺失、外部或不支持引用以原因代码留在 unavailable，不猜替代图片。人工索引缺失不影响原始引用证明；存在但格式/版本错误、重复身份或索引越界则明确阻止此次检查。证明不修改题干、选项、解释、正确答案或评分，不运行修复、recover、导入、MinerU、网络或原生会话。

本地图片的 `rootKind` 为 `question-image`，asset 为精确根内相对路径。文档图片的 `rootKind` 为 `mineru-document`，asset 为可信查询键 `document/<jobId>/<documentAsset>`，实际 `relativePath` 为 `<jobId>/assets/<documentAsset>`，并单列 jobId/documentAsset，供 Host 用原查询精确查找。`documentRoot/documentFiles` 固定另一显式根及其依赖。读取接口不能用浏览器提供的根或任意路径替代这些字段。

计数 `assets` 为题目—图片关联数，`embeddedReferences/documentReferences/overlayReferences` 为各类字段/引用绑定数；不等同于磁盘上唯一图片文件数。`verifiedRecords` 仅表示拥有正向图片读取证明的题目数，不表示其业务答案或全部内容人工核验通过。记录可同时拥有可读原始图片、可读覆盖图与仍不可用的其他引用。

2026-10-24：`node --test plugins/kaogong/tests/legacy-bank-image-evidence.test.mjs` 的 43/43 受控夹具通过。覆盖原始引用独立于人工索引、精确字段/引用绑定、绝对原路径别名与重定向、未引用同目录文件拒绝、人工覆盖图/选项证明、未知版本/重复/路径越界、图片及业务快照变化、根身份变化、并发修改和新文件输出保护；另覆盖原有 document-image 的任务匹配、精确 query、清单/任务变化及跨任务目录链接拒绝。文件链接越界由文件系统适配夹具验证，目录 junction 用真实临时目录验证；Windows junction 夹具需对应执行权限。无第三方测试依赖，无保留链接。

授权实际源已只读运行同一接口并完整再次 revalidate：3994 条题库中，1659 条拥有图片读取证明，2755 个题目—图片关联，含 1756 个已有本地引用、998 个已有 document-image 引用及 1 个人工核验覆盖图，不可用引用数为 0。固定本地图片 184 个、人工索引 1 份、原路径映射 183 个；另固定显式 MinerU 根中 146 个图片、6 个任务文件和 1 份清单。未提供 option-repairs 索引。七份旧业务文件哈希仍与 09a 一致，完整私有回执保存在本地而未进入 Git。这是当前源快照内已支持 Markdown 引用的离线证明，不外推任意文件或未来新增记录。

这些结果只证明离线清单和读取接缝；真实来源图在最终授权页面中实际渲染前，不能声称原题图示显示闭环完成。Host 路由授权与准确图片显示由后续联合验收继续验证。正式 apply 仍需具体预览确认；本票不执行 apply，不修改原始来源文件。
