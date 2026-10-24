---
id: harness-rc3-legacy-material-evidence
title: 旧知识与图片的精确只读来源证明
parent: harness-rc3-legacy-adoption
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-rc3-legacy-inspection, harness-upgrade-kaogong-ownership]
target: 0.2.1-rc.3
---

本票仅关闭独立离线证据模块及夹具回归切片。依据 [09a](09a-legacy-inspection.md) 与[归属决策](../issues/04-kaogong-ownership.md)，正向来源证据只产生可供具体计划选择的资料库候选，不执行迁移、不建立共享授权、不关闭父票 09 或完整 HU08。正式 apply 仍须对具体影响预览确认。

接口位于 `plugins/kaogong/src/legacy-material-evidence.mjs`，类型在同名 `.d.mts`。输入必须是完整私有 09a 快照和显式绝对 `materialRoot`，不发现全局 home、配置、凭据或其他材料根。

| 接口 | 行为 |
| --- | --- |
| `inspectLegacyMaterialEvidence({ snapshot, materialRoot, io? })` | 返回私有 `evidence` 和仅计数/哈希的 `summary`。 |
| `revalidateLegacyMaterialEvidence({ snapshot, materialRoot, evidence, io? })` | 重新计算完整来源证明，任何证据哈希变化均拒绝。调用方须提交重新只读检查所得的新 09a 快照；仅传旧快照不能证明业务库仍未变化。 |
| `readLegacyMaterialAsset({ evidence, entryId, asset, io? })` | 读取精确 allowlist 资产；先复核证据完整性、材料根身份、全部原路径别名、清单、选中条目的 PDF/任务/知识内容及该图片哈希。调用方必须先按可信实例/资源授权访问。 |
| `writeLegacyMaterialEvidence({ snapshot, materialRoot, output, io? })` | 可选私有回执输出，只以 `wx` 新建显式绝对文件，拒绝材料根和源 home 内输出（含目录别名），不覆盖已有文件。 |

证据以稳定 SHA-256 固定 snapshotHash/sourceRevision、清单、规范材料根及目录身份、原始绝对 PDF 路径与规范目标、逐条来源内容/PDF 哈希和精确图片相对路径/哈希。`entries` 仅含正向证明条目；`privateEntries` 标明固定原因代码；`files` 固定本次读取的依赖。它们属于私有 Host 回执，含记录身份与路径，不应公开、进入模型提示词或加入 Git。`evidenceHash` 是完整性校验，不是 MAC 或访问授权；Host 必须从可信检查端取得证据并在具体计划/回执中固定该哈希，不能信任调用者或模型自制的证据对象。

当前只支持 `knowledge-import.ts` 的严格子集：`mineru_<PDF SHA-256>_<pages>` 唯一对应 version 1 rebuild 清单中的已完成任务；知识的 title、subject、kind、knowledgePoint、source、三项 tags 均与导入规则一致，完整内容逐字节等于该任务 `knowledge.md` 的有效 UTF-8。未知业务字段不作为来源资料接收。`createdAt/updatedAt` 只检查原格式字段存在，原值留在快照，不用时间戳推测出处。任务 `job.json` 的 id、source、subject、title、pages 必须一致，原 PDF 当前字节哈希必须等于清单 fingerprint；若清单包含 characters/images，则须与解析内容一致。不解析 PDF 内容以声称语义等价，也不重新评分。

原始绝对 PDF 路径可以是已有目录别名，但只先解析其元数据；规范路径必须位于显式材料根内，之后才读取规范根内文件。原路径与规范目标均固定，重定向或根身份变化会拒绝旧证据。父目录穿越、双重编码穿越、外部 symlink/junction 和根外文件均不读取。只访问清单、候选原 PDF、匹配任务的 job/knowledge 文件及 Markdown 明确引用的图片；不扫描整库，不调用 MinerU collect、repair、recover、导入、网络或原生会话。

图片只支持现有 MinerU 重写的内联形式 `/api/kaogong/document-image?id=<same job>&asset=<encoded relative path>`。精确解码并校验路径后，固定 `storage/mineru/<job>/assets/<asset>` 和文件哈希；不允许额外 query、外部 URL、其他 job、HTML/reference 图片或任意路径回退。不支持的引用使整条知识继续私有。证据不推导题库记录的来源；题库和其他资源的共享仍由其自己的具体预览及授权决定。笔记始终私有，未知/编辑后/重复匹配条目也私有，不能凭 kind 或存在图片判断共享。

调用示例（只输出脱敏摘要，私有路径由调用方明确填写）：

```javascript
import { readFile } from 'node:fs/promises'
import { writeLegacyMaterialEvidence } from './plugins/kaogong/src/legacy-material-evidence.mjs'
const snapshot = JSON.parse(await readFile(explicitPrivateSnapshotPath, 'utf8'))
console.log(JSON.stringify(await writeLegacyMaterialEvidence({
  snapshot, materialRoot: explicitAbsoluteMaterialRoot,
  output: explicitNewPrivateReceiptPath,
})))
```

2026-10-24：`node --test plugins/kaogong/tests/legacy-material-evidence.test.mjs` 的 32/32 控制夹具通过，覆盖匹配成功、源 PDF/任务/知识/字段变化、私有笔记、未知字段、重复映射、路径及编码穿越、junction 越界、原 PDF 别名重定向、根身份变化、证据和资产篡改、并发修改与新文件输出约束。Windows junction 夹具需允许创建临时 junction 的执行权限；无第三方依赖、无保留链接。此为公共检查/读取接缝回归，不是原生安装验收。

同一公开接口已对授权私有快照和显式材料根只读实跑：40 条知识获正向证据、32 条继续私有（3 条笔记、26 条不支持的来源记录、3 条不支持的图片引用），1692 个精确图片引用；固定 1797 个实际读取依赖与 18 个原 PDF 路径映射。完整再次 revalidate 通过，七份旧业务源文件哈希仍与 09a 相同。结果仅保存在本地私有回执，不提交记录内容、身份、路径、标题或答案。这里的候选数不是共享授权数，也不是正式 apply 已获批准。

证据检查不锁定宿主或材料目录，不能阻止最后一次核对后的外部修改。具体 apply 前必须同时重新检查业务快照/revision 和完整材料证据；读取已授权图片时重新验证对应依赖，失败则拒绝读取。配置升级、业务迁移及回退机制仍由父票和 Host 实施票分别负责。
