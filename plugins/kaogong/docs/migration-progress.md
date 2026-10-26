# 工单00现场记录

2026-10-25，执行分支 `codex/kaogong-standalone-closed-loop`。根仓库原有未提交文件保持原样。未启动、停止或修改任何 Native 实例。

## 已执行

- 增加 Git 排除 `materials/`、`archive/local/`，npm 明确排除资料、归档、scratch、storage、环境配置和发行包目录；现有发行 files 白名单保留。
- `scripts/migrate-materials.mjs` 使用 lstat 清点，不跟随链接，不删除原件，不修改运行配置或来源证明。完整私有清单位于 `materials/manifests/migration.json`。
- 旧真实根共 9,741 个实体文件，3,808,973,989 字节，91 个链接；外部 `workspace/kaogong` 为指向该根的 junction，未重复搬运、未移除。
- 5,672 个资料及旧 storage 文件复制至 materials，3,546,970,789 字节，每文件核验原件与新件 SHA256。storage 中的历史运行文件仅离线保留，尚待细分归档，不接管为当前学习记录。
- 53 个历史源码/配置/未知文件复制到 `archive/local/legacy-root`，1,160,145 字节，逐文件哈希一致。
- 4,016 个依赖/工具缓存实体文件及所有链接留原址，待引用/占用与可重建性核验；没有清理。
- 正式 home 仅复制 `kaogong_bank.json`、`kaogong_knowledge.json` 至 `materials/source-home/storages`，原件/新件哈希核验一致。现有 `inspectMaterials` 检查通过：3,994题、72条知识，其中3条笔记仍只作为源记录保留；没有导入业务域。独立哈希清单在 `materials/manifests/source-home.json`。

## 尚未完成，不得关闭工单

storage 内容细分、正式配置与已 apply proof 清点、位置映射接入正式读取链路、真实评分读取验证、清理与零链接复扫。

## 后续验证

- 9份考公专属历史文档已逐字节归档，原址留指引，21个历史相对引用的原始目标均存在，详见 `archive/docs/index.json`。共享平台、课堂/Harness文档留原址。
- Git check-ignore 已核验本次资料与私有归档被忽略。npm dry-run 暴露旧白名单仍含两张原题图片，已移除这两个条目并明确排除题目图片目录；尚未生成新发行包。
- 只读原始证据检查：旧根40条来源、32条私有/不可证明条目、1,692张关联图片；直接指定新根会因原始绝对路径触发安全拒绝。
- 新增独立离线位置映射适配器，逐个固定18个声明PDF路径对应的新位置与SHA256，不改原始元数据/manifest/既有proof。新根真实读取与二次完整复验恢复同样40条来源和1,692张图片；32条私有/不可证明记录仍保持原分类。完整新证据与映射只写入被忽略的 manifests。该适配器尚未接入正式运行配置，不能声称已完成切换。
- 位置映射测试通过：限定别名、原件不变、重复映射和越界拒绝、文件字节变化后拒绝。

目前旧资料根和 junction 完整保留，所有有效运行引用仍可使用旧位置；新复制目录尚未切为正式来源。原生凭据、会话、当前学习记录与老师 cwd 未变。旧 rc.3.7 验收不计作本轮独立版验收。
