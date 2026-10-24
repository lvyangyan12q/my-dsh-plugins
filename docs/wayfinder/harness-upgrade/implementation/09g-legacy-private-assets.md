---
id: harness-rc3-legacy-private-assets
title: 原始私有知识内嵌图片的精确只读连续性
parent: harness-rc3-legacy-adoption
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-rc3-legacy-material-evidence]
implementation_status: implemented
acceptance_status: pending-installed-native
target: 0.2.1-rc.3
---

本票仅实现父票 09/HU08 的原始私有图片连续性模块、公开类型与受控回归，起点 cb6e96a；不关闭父票，不执行正式迁移，不更改共享分类、题目、答案、评分、原始材料或消息。09d 的 40 条正向资料候选与 32 条私有记录保持不变；私有图像可读不等于原 PDF 来源或语义得到证明。

接口在 `plugins/kaogong/src/legacy-private-assets.mjs` 与同名 `.d.mts`：

| 接口 | 输入和约束 |
| --- | --- |
| inspectLegacyPrivateAssets | 完整可信 09a snapshot、显式绝对 materialRoot、可信计划/09d 选择的 privateEntryIds。返回私有 evidence 和仅计数/哈希 summary；不发现全局目录，不读取配置或原生会话。 |
| revalidateLegacyPrivateAssets | 重新计算证据并比对 evidenceHash；必须由调用方传入重新检查所得的 snapshot，旧快照本身不能证明业务源仍未变化。 |
| readLegacyPrivateAsset | 可信 Host 先确认 own private historical instance，再传固定回执、entryId、jobId、asset、当前完整 currentRecord 与 access。access.kind 必须为 private-history 且 instanceId === ownerInstanceId；不接受共享资料 grant。多种原始 src 指向同一 asset 时必须选精确 bindingKey。 |

证据格式独立为 kaogong-legacy-private-assets / legacy-private-reference，不被 09d 共享资料读取器接收，也不能由共享证明替代。Host 必须从可信检查端获取并在自己的计划/回执中固定 evidenceHash；该 SHA-256 是完整性校验，不是 MAC、身份凭据或授权。access 是可信 Host 已完成归属检查后的事实，不能由页面或模型自述；本模块不替代平台实例/资源准入。

只为所选 snapshot 原始知识 ID 和完整记录/内容哈希建立绑定。后续新增 ID、复制到别的 ID、编辑内容或元数据均不能借用旧证明。每个 binding 固定原始 src、Markdown/HTML 类型、同一 jobId 下的精确 asset、canonical relativePath、字节哈希与 bindingKey。只支持严格本地 document-image URL 与 HTML/Markdown 的 images/ 相对引用；HTML 真正的 src 属性与 data-* 字符串区分，重复 src/srcset 或不支持形式不产生该属性证明。额外查询键、重复键、控制字符、编码穿越、外部 URL、任意根目录均不回退读取。

本切片要求原始唯一 mineru-job tag、唯一已完成 version1 rebuild 清单 job、对应原始 mineru ID，以及 job.json 的 id/source/pages 一致。任务根来自已识别清单；原 PDF 声明别名仅解析路径元数据并固定映射，真实目标必须位于显式材料根内，不读取 PDF 字节，也不比较 PDF 内容或声称来源语义成立。未知/编辑后知识仍保持私有，未获任务根证明的记录不产生资产读取许可。

新共享路径接缝 `legacy-document-paths.mjs` 仅解析精确 document-image 目标及解析元数据路径，供 09f 与 09g 各自的证明模块使用；它不读字节、不建立 grant。根必须显式给定，任务 JSON 限同一 job，图片真实路径必须留在同一 job/assets 内；即使跨 job 的 junction 仍在材料总根内也拒绝。全局材料根身份、原 PDF 别名、清单、任务和精确图片字节在读取时重新核对。材料/业务源不会被锁住，最后核对后的外部变化仍须由后续调用重验。

预先确认的 TDD 接缝是 inspect/revalidate/read 的公开接口和真实临时文件系统适配。红灯分别为模块缺失、同总根的跨 job junction 曾通过、URL 尾随控制字符曾被 URL 正规化接受、HTML data 属性内的 src 文本曾误认；最小修复后转绿。Windows 文件 symlink 权限不可用的夹具改用本仓库已有的目录 junction 方法，没有跳过测试。

```powershell
node --test plugins/kaogong/tests/legacy-private-assets.test.mjs plugins/kaogong/tests/legacy-material-evidence.test.mjs plugins/kaogong/tests/legacy-inspection.test.mjs
```

2026-10-24：73/73 通过，0 跳过，其中新私有连续性 30 项。覆盖自身私有实例/精确旧 ID、当前记录变化、跨实例与共享 grant 拒绝、私有/共享格式隔离、binding 歧义、穿越和编码、根/别名/任务/清单/图片变化、并发变更、外部和跨 job junction、元数据只读解析及原 PDF 字节变化不被误当作来源证明。没有改动 source index、SDK、版本、Host 运行时路由或其他工单模块；接入由可信 Host 实施票完成。

授权的私有 09a 快照与显式材料根已只读实跑同一模块：32 条私有候选中 3 条得到旧内嵌引用连续性，29 条无支持的图片证明；共 1514 个精确引用/资产，其中 Markdown 1405、HTML 相对 src 109。完整 revalidate 通过；从最终已保存私有回执读取三条记录各一张 HTML 图后，字节哈希均一致。模块 PDF 字节读取数为 0；实跑前后以及最终解析器重验后的七份源 SHA-256 均与 09a 相同。证据哈希为 f629761c0aa2382c9127b40be8a9c3d9d3d3453a1dfd9c692539c2ce1120e9fc。完整回执只保存在本地 Git 外私有文件，不提交身份、路径、标题、内容、答案或图片。此统计不增加共享候选，不表示正式 apply、安装后 UI 或完整 HU08 已验收。
