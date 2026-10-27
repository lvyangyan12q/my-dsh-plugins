# 考公学习插件

独立版本 `0.3.0-rc.3.1`，运行于官方 DSH Web `0.2.1-rc.3`，不需要安装或启用 Worktable。实现状态及准确包验收记录见仓库中的[工单索引](docs/tickets/README.md)和[最终验收](docs/evidence/07-final-acceptance.md)。历史 rc.3.7 仅为旧适配基线。

原生侧栏的“考公学习”提供学习总览、学习计划、练习训练、错题与复习、学习进度、资料库。课堂使用完整 Native 对话及原生右侧学习面板，保留模型、轨迹、提问、审批和 Stop，只有一个聊天输入框。班主任、科目老师与辅导员使用标准 preset 和私有 Persona/kaogong-teach Skill；普通会话不能访问档案数据。

## 学习与确认

备考档案由学习者明确创建或继续，首次打开不自动建档。日期未知不显示默认倒计时；可阅读、自由练习或保存目标草稿。目标、日程调整和复习纳入计划都先预览，确认后生效。既有进行中、完成和逾期任务保留，容量不足的追加任务明确列为未排入。

练习由Host保存发题快照并判分，提交前隐藏答案。相同提交幂等，冲突重提拒绝，题库后续变更不改旧轮成绩。累计统计区分提交、作答、未答及去重，正确率使用全部提交题量（含未答）为分母。任务完成率与题目正确率分开；外部模考仅为单列用户自报。

历史错题按轮次和题ID保留，后来答对不擦除过去错误。明确入队后按1/3/7天复习，重新作答、反思并确认才推进；错误回待订正，三阶段通过标为“已巩固”。提前复习须主动选择。关联计划任务只认开始后新作答与确认依据。

AI只能读取获准资料或提出待确认建议。计划和完成建议持久保存到页面，完成建议绑定稳定任务及版本；页面核对实际总结、轮次和反思后，由学习者独立确认。模型携带 confirmed 字段不能代替确认，也不能改原题答案、成绩或自动打卡。Native结束、空闲或Stop不代表任务完成。无模型时手动计划、阅读、练习、判分、反思和统计仍可用。

## 本地资料与保留

题库、PDF、图像、MinerU结果、学习数据、凭据和私有备份不随包发布。本包不含两张旧插件路径原题图，也不依靠它们作为独立资料来源。资料库导入、共享和撤销由页面明确操作；视图使用Host登记的viewId，模型按实际Agent Session归属档案，不接受模型指定其他档案。

插件启用时不自动接管旧全局计划、错题或会话，不移动凭据或Native Session。当前隔离学习档案的承接只能在同一Native home内明确预览确认。既有角色Session保持原ID和cwd，不用新会话替换。

在Native profile的kaogong配置中按需明确以下绝对路径，未配置的来源不会从安装目录或cwd猜测：

```yaml
config:
  roleCwd: C:/study/workspace
  materialSourceHome: C:/study/source-home
  legacyMaterialRoot: C:/study/materials
  questionImageRoot: C:/study/materials/question-images
  mineru:
    outputDir: C:/study/mineru-jobs
```

以上为示例，不是默认目录。roleCwd须先在原生Workspace Registry登记，再创建新角色。legacyMaterialRoot为资料集合根，与MinerU作业outputDir分开。currentSourceProfile可显式指向同一home内保留的旧profile，仅用于当前档案预览承接。

搬迁资料先复制、哈希核对、位置映射和实际引用验证，再切换。新预览可成对配置materialLocationMap/materialLocationEvidence指向固定位置回执及未改原证明；保留原rootIdentity和已applied计划，不做全局路径替换。原资料、旧有效绑定和回退包继续保留。来源授权撤销后新读取/发题拒绝，自身已保存成绩和统计不删除。详细切换矩阵见[迁移进度](docs/migration-progress.md)。

MinerU只在明确选择授权PDF及持久输出根后调用配置的外部服务；密钥留在Host，不进入客户端或发行包。发布检查不上传PDF或调用模型。

## 构建与候选包检查

在本插件目录维护源码与物理隔离依赖。构建工具必须真实位于本目录node_modules，不通过共享junction安装或修改Native源码。DSH_SOURCE指向已构建、未补丁的官方rc.3目录。

```powershell
$env:DSH_SOURCE = 'C:/runtime/deepseek-harness'
node scripts/build.mjs
node scripts/test-current.mjs
node scripts/test-current.mjs --domain
node --test tests/package.test.mjs
```

完整构建包含官方Host/Client声明门禁。npm run pack执行上述检查及官方CLI准确归档安装身份检查；还须设置KAOGONG_INSTALL_GATE_ROOT为本机自有隔离验收目录，祖先不得含开发node_modules。不需要Worktable归档参数。成功后在releases生成不可覆盖的版本归档；既有同名包不会被替换。

包白名单、源码测试和DOM检查不能代替准确包实际浏览器验收。发行验收覆盖无Worktable的DSH中的真实学习路径、私有Skill/提问/审批拒绝及允许一次/Stop、来源撤销、两个档案、刷新重启与准确包卸载重装。具体范围、结果和限制见[文档入口](docs/README.md)及[最终验收](docs/evidence/07-final-acceptance.md)。回退只处理插件和配置，不整库覆盖新学习记录。

### 核验过的练习图示补充

可在持久 `questionImageRoot` 的 `verified/associations.json` 保存版本 1 的本地核验索引。每条 `associations` 记录包含 `questionId`、原题 `stemSha256`、`verified/` 内的图片 `asset` 与 `assetSha256`、核验来源 `sourcePdfSha256` 和从 1 开始的 `sourcePage`。图片文件名只允许字母、数字、下划线和连字符；不支持路径穿越、外部链接或 SVG。

获准来源用于练习展示时核对索引、图片哈希与实际路径，并核对题目身份和原文哈希。来源信息由本地核验者登记，并非自动 PDF 内容认证。索引缺失时保持原题；索引错误时保留原题并记录固定错误说明。图片或索引更新后需重新加载插件。

补充图片只进入练习和复盘展示，不改原题文本、选项、答案、既有练习快照或成绩。修改资料根目录后，不再沿用旧根目录的关联。私有索引和图示保留在资料目录，不进入插件发行包或公共仓库。


### 已核验选项页脚投影

可在同一持久图片目录的 `verified/option-repairs.json` 保存本地版本 1 索引。`associations` 每条包含 `questionId`、原题 `stemSha256`、`optionsSha256`（原选项数组 `JSON.stringify` 的 SHA-256）、`optionIndices`（从 0 开始）、`sourcePdfSha256` 和从 1 开始的 `sourcePage`。

维护者必须先唯一定位并视检原 PDF 的对应选项，再创建关联。当前仅支持排除指定选项末端的明确广告 `公考最新资料、更新进度微信 SKA674`，不支持任意替换选项、截掉未知后文或写入答案。题干和全部选项都必须与核验时的内容哈希一致。来源哈希和页码提供人工核验记录，不表示程序已经核实 PDF 内容。

修复仅影响公开练习题面和提交后结果显示；题库、发题快照、答案与原解析保持。无索引、内容改变或无可确认末端广告时保留原选项；索引超界、无效或重复时记录加载失败并保留原内容。索引与资料应留在本地私有资料目录，不能随发布包上传。


完整原题显示恢复仍采用私有内容固定关联。`verified/associations.json` 单行可选 `displayMode: "source-image"`，仅在源题本已完整裁出材料、指定题面与全部选项，并视检排除答案、批注、相邻题后使用；未设置时仍追加图示。`verified/option-repairs.json` 单行可选 `sourceOptions`（完整显示选项数组），用于原PDF确认的页码残留或图选项恢复；须选项数量、原字母键和全部 `optionIndices` 一致，原题干与原选项数组哈希一致。不得猜写选项或答案。原始题库、已发快照与评分不改，pending题必须继续显式审查，认证索引不会自动批准。未知或哈希改变的污染记录暂缓练习并提示修复。

源选项使用原 PDF 图形时，`sourceOptions` 可写 `A. ![原题 A 选项](题目_images/verified/option-A.png)`，并在同一关联 `sourceAssets` 提供 `{ asset: "verified/option-A.png", assetSha256: "<SHA256>" }`。所有图片引用须逐项裁剪、人工来源核验并固定字节；外部 URL、未关联图片或变更字节将拒绝加载。该显示投影不改变待审状态，不能替代人工题库审核。
