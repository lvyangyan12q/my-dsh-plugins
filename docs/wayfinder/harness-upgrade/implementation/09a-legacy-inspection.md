---
id: harness-rc3-legacy-inspection
title: 旧学习只读清单与私有计划输入
parent: harness-rc3-legacy-adoption
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-upgrade-kaogong-ownership]
target: 0.2.1-rc.3
---

本票只交付 HU08 的独立离线只读准备切片；父票 09 与完整 HU08 保持 open。依据 [归属决策](../issues/04-kaogong-ownership.md) 与框架规格：历史学习私有、新实例为空、原始资料需显式只读授权。正式 apply 仍须提供具体计划并获得确认。本工具没有 apply 接口，也不生成可执行迁移计划。

公开检查接口位于 `plugins/kaogong/src/legacy-inspection.mjs`：`inspectLegacy({ home, provider?, io? })` 返回私有 `snapshot` 和脱敏 `summary`；`writeLegacyInspection({ home, output, materialRoots?, io? })` 仅写一个新快照并返回脱敏摘要。默认 provider 为 `json-files`，未知 provider 阻止检查；`io` 是文件系统适配接缝，夹具可通过它模拟读取期间修改。

```powershell
node plugins/kaogong/scripts/inspect-legacy.mjs --home <explicit-absolute-old-home> --output <explicit-absolute-new-private-file> --material-root <explicit-absolute-material-root>
node --test plugins/kaogong/tests/legacy-inspection.test.mjs
```

必须显式提供 home/output；不读取 DSH_HOME 或隐式全局目录。输出父目录须已存在；输出通过真实路径校验，拒绝源 home 内路径及目录别名，拒绝指定材料根内路径；以 `wx` 新建，已有文件不覆盖。CLI 标准输出只有计数、固定状态和 SHA-256，错误只有固定代码，不输出记录身份、标题、答案、源路径、cwd 或错误堆栈。完整快照含隐私，只应保存到私有本地目录；POSIX 文件模式请求为 0600，Windows 访问控制由所选私有父目录继承，不承诺 chmod 能建立独立 Windows ACL。

七份已知 JSON 文件严格核对 unit 名称、版本、global 和表结构；缺失、格式错误、未知版本不会被当作空实例。快照保留原文件完整字节的 Base64、哈希和原始路径，因而保留原题目快照、答案、评分、顺序、ID、历史及当前绑定、preset、selectedPreset、cwd、phase 和未知结果；不修改任何业务字段。只将 `key.appId === kaogong` 的角色列为计划输入；其他应用原记录留在私有原文件快照中，不提出其迁移。

知识中的笔记固定私有；其他知识也全部保留私有并标记来源未核验。工具不遍历材料、不宣称标题或 source 字符串证明来源、不移动图片/讲义/MinerU 目录。后续来源证明需比较显式材料根下原始文件与已核验清单/解析任务内容。本切片不读取配置、凭据或原生消息，不加载插件，不打开 storageDomain，不触发 recover、修复、导入或轮询。原生当前/历史身份仍为 `pending-public-platform-validation`；没有把绑定中声明的身份当作原生验证成功，也没有推测缺失 preset/cwd。原生日志存在性与哈希未在本票检查，不能从此快照声称消息或 Native identity 已验收。

完整读取后再次读取全部七份文件核对 revision，写快照前再核对一次；检测到读取期间变化即拒绝。该措施固定离线快照输入，不锁住正在运行的宿主，不保证最后一次核对后源文件永久不变。后续具体计划及 apply 必须重新校验版本/revision；本票不实现稳定实例映射、幂等回执、失败恢复或回滚。

2026-10-24 辅助验证：11/11 受控夹具测试通过（Windows junction 测试使用临时目录，需允许创建 junction 的执行权限），覆盖字节保留、只读、已有输出保护、provider、CLI 脱敏、缺失/错误格式/版本/表、并发变更、私有分类、外部绑定保留和路径别名越界。未使用第三方测试依赖或 node_modules 链接。

用户授权的实际只读路径已实跑同一 CLI：题库 3994、知识 72、课堂 3、错题 22、练习轮次 9、计划日 216；角色共 7，其中考公 3、外部应用保留 4；笔记 3、其他来源未核验私有 69、可共享确认数 0。七份源文件 SHA-256 与预检基线以及输出后的再次读取均一致。完整结果仅保存在本地私有预览文件，未加入 Git。这里的统计不代表正式迁移或原生学习闭环验收。
