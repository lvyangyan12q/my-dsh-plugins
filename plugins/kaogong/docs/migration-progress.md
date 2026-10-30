# 工单00归位验收与正式切换清单

当前结果（2026-10-28）：00—07均closed。下文为00及源码阶段历史清单，正式独立profile与准确包实际切换结果见[最终验收](evidence/07-final-acceptance.md)。

07逐项结果：新正式`kaogong-standalone`明确配置插件`materials/source-home`、`materials`、`materials/题目_images`、`materials/storage/mineru`及成对位置映射/原证明；真实验收库已页面确认接入3994题、40项可共享原资料与29项库内私有资料，3项笔记留旧源。原web配置不变，正式首次建档/接入仍需学习者确认。两个旧applied synthetic-v2/v3计划及原rootIdentity、proof、来源树保持不变；E3在原home原位升级，9/10和原会话/课堂/回执保留。旧有效资料、归档、两张忽略的本地图、4,016个缓存文件及91个旧依赖链接不因本次切换删除。运行时授权撤销/恢复、原图和真实判分及最终原件/副本复核通过；Native跟踪文件和用户改动保持原样。

2026-10-26。工单00完成的是目录收拢、复制证明和保留决策；独立功能、正式配置切换及真实完整学习闭环由01—07继续验收。没有用历史rc.3.7的通过记录代替本轮完成。

## 已完成与证据

- 真实旧根仍为 `D:/programming/workspace/my-dsh/materials/kaogong`；外部 `D:/programming/workspace/kaogong` 是其junction，只清点一次。共9,741个实体文件、3,808,973,989字节；91个链接全部在旧node_modules，未跟随、未清理。
- 5,308个PDF、文字、题图及MinerU资料文件复制到插件 `materials/`，3,541,427,779字节；53个历史源码/未知文件、1,160,145字节和364个旧storage运行文件/备份、5,543,010字节归 `archive/local/legacy-root/`。独立只读复验对所有5,725个有副本的文件重新核对原件与副本SHA256，全部一致。
- 初次整storage复制遗留的364个多余运行文件副本，已在主开发目录用 `reconcile-material-storage.mjs --apply` 精确移除。移除前原件/归档/多余副本三方哈希相同，资料目标nofollow清点为零链接；只逐文件unlink及空目录rmdir，未递归删除。结果为selected364、pending364、links0、sourceDeleted:false、archiveDeleted:false。旧运行文件归档保留，不作为当前学习记录接管。
- 正式home仅题库与知识两个JSON复制到 `materials/source-home/storages/`；原件/副本哈希一致。原有只读格式检查确认3,994题、72条知识。没有复制凭据、Native Session或当前运行数据库到Git。
- 新根按18个具体声明PDF路径和固定SHA256生成离线位置映射，不改原始题库、答案、来源manifest或旧proof。真实读取和完整二次复验得到与旧根相同的40条来源、1,692张图片；32条私有/不可证明记录保持原分类。没有把这些离线证据写入已applied计划，也没有重复导入或发送任务。
- 9份考公专属历史文档归 `archive/docs/`，原址留迁移指引；21个历史相对链接按原始目标精确重定位，目标全部存在。`originals/`逐字节原文以Git `-text`保护；索引同时记录原字节SHA256和规范LF文本SHA256，避免Windows检出换行误报。共享Harness/平台/课堂文档留原址。
- Git排除materials、archive/local及原题图片目录；npm明确排除上述资料、storage、scratch、环境配置、release。dry-run为29个文件，无私有目录或原题图片。此前已跟踪的两张PNG与canonical materials副本SHA256一致，已用`git rm --cached`从后续树移除；既有远程历史不重写，冻结发行包不改字节。

私有逐文件证明在主插件 `materials/manifests/`：`migration.json`、`source-home.json`、`old-root-evidence.json`、`location-map.json`、`relocated-root-evidence.json`及`ticket00-audit.json`。这些文件不进入Git/npm。公开脚本为 `audit-material-migration.mjs`、`verify-material-relocation.mjs`、`reconcile-material-storage.mjs`；前两者只读源数据，最后一个默认preview，只有显式--apply才清理经证明的额外复制件。

## 精确保留与07切换矩阵

| 对象 | 当前具体位置/字段 | 本票处理与仍保留原因 | 07需完成的验证 |
|---|---|---|---|
| 正式资料元数据 | 正式web/cordis.patch.yml中的`materialSourceHome: C:/Users/pc-zzy/.dsh` | 原配置保留；新的source-home快照已核验，改变sourceHome会改变sourceRevision，不能套用旧计划fingerprint | 新独立发行包中预览明确新source-home及差异，页面确认后才接入 |
| 正式PDF/讲义证明 | 同配置`legacyMaterialRoot: D:/programming/workspace/my-dsh/materials/kaogong` | 旧根和外部junction保留。新根证据已通过离线映射，但运行读取仍校验原rootIdentity、sourceAliases和每文件receipt | 使用具体位置回执并保留旧proof；实际授权读取、撤销和恢复通过后才切换 |
| 正式题图 | 同配置`questionImageRoot`指向旧根的`题目_images` | 新根图像字节一致；旧授权及题图证明仍绑定旧真实路径 | 新图索引与题干/选项/答案快照匹配，已提交轮次不被重写 |
| 正式解析作业 | 同配置`mineru.outputDir`指向旧根`storage/mineru` | job.json及rebuild-manifest含原始绝对PDF路径，完整复制且原文不替换 | 新作业与旧作业分清归属；PDF、表格、图片读取及评分实测 |
| 已接入的新实例资料 | fresh-acceptance/home的`kaogong_material_import_rc3.json`与`kaogong_material_plans_rc3.json` | 只读核对2个applied回执，fingerprint与计划对应；来源分别为synthetic-materials-only-3101-v2和v3下source-home、original-synthetic-materials、question-images及其storage/mineru。与真实旧资料根不同，不能把它们改成真实题库路径；精确ID/指纹/域文件哈希仅在私有audit中 | 保留这两个来源树及绑定，先验证当前学习/成绩/草稿/共享/角色承接，再做任何正式配置变更；不能自动重发任务 |
| 正式home的资料导入回执 | C:/Users/pc-zzy/.dsh/storages | 未发现上述资料回执两个域文件；这仅表示指定正式home未有这类回执，不代表其他home无数据 | 启动前重新核对在用home、Native会话和草稿 |
| 两张旧插件路径题图 | 插件`题目_images/verified`中两张资料600 PNG | 代码旧fallback仍引用，物理本地副本保留且Git忽略；canonical副本在materials内。合并本票若Git删除checkout副本，须立即从已核验canonical位置恢复这两张本地忽略副本 | 独立发行去掉随包原题的隐含依赖，真实图全部经资料权限读取 |
| 历史源码/运行记录/备份 | archive/local/legacy-root | 417个归档文件保留，未自动迁到当前业务域 | 无需自动接管；只有用户页面明确操作才能改变学习状态 |
| 依赖/工具缓存 | 旧根node_modules、.pdftool、.tmp，共4,016个实体文件及91个依赖链接 | 未证明全部可重建/无占用/无独有产物，保持原址；不因名称像缓存就删 | 只有明确无剩余引用后按nofollow、非递归断链接、零链接复扫流程处理 |
| Native状态与老师工作目录 | .dsh凭据/会话/运行域；roleCwd为my-dsh/workspaces/kaogong | 留原home及cwd，无修改Native源码或共享依赖，无停用未知进程 | 准确包安装和正式切换前核对在用状态、备份与具体影响，回退不覆盖新增学习 |

## 验证边界

2026-10-27源码增量：新资料预览可通过成对的 `materialLocationMap` / `materialLocationEvidence` 显式配置固定00的位置映射与未改原证明；运行时应用、图文读取和练习验证使用同一回执。原rootIdentity与新rootIdentity分别保存，旧applied计划不重写。公开Host合成资料/授权撤销/冷恢复及页面确认的证据见 [07资料位置源码证据](evidence/07-material-location.md)。尚未完成准确包真实资料/正式配置切换，以上切换矩阵仍须逐项实测。

已有迁移安全测试通过：只重定位固定别名、原件保留、字节变更拒绝、重复别名和越界拒绝。资料新位置的图文/PDF真实读取与哈希已验证；本票未运行模型、未改评分记录，也未声称无Worktable的Native学习闭环已完成。独立轮次评分、两档案权限、刷新/重启/准确包卸载重装和最终切换均由[07](tickets/07-acceptance-delivery.md)承担。
