# DSH 0.2.2-rc.1 考公适配

- 宿主：`D:/programming/workspace/deepseek-harness`，提交 `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。运行官方 `node --import tsx scripts/build.ts --scope artifacts`，8 项通过。
- 原生源码运行时识别增加 rc.1 的公开来源候选；仍验证安装来源、作用域和 standard preset 的真实探测，不设置版本豁免。
- 新候选 `0.4.1-rc.1.2`，仅声明 DSH `0.2.2-rc.1`；匹配宿主 Cordis `4.1.0` 和 Schemastery `3.19.0`。SHA256：`fb4827dfc454fe54c6cddf507c12f56f866150a2c189f17149db45df55e75e8a`。
- 最终包完整门禁：Host 68、客户端 44、Host/UI 联调 5、领域 21、发行 1 全部通过；官方声明构建和无工作台隔离 CLI 安装、真实 Scope 身份检查通过。
- 同一准确包的独立 3169 实例可启动并监听；本轮未以浏览器实测全部 rc.1 学习流程或正式 web 入口，旧 alpha.3 验收不自动继承。验收进程已核身份停止。
- 官方 CLI 已将日常 `web` 中的考公包更新为上述版本，安装 111 个文件与准确包逐字节一致。其余直接依赖和 bundle 列表、Cordis 配置未改；检查的 24 个既有 storage 顶层文件哈希未变。配置和锁文件备份在本轮 `rc1-web-upgrade` 私有验收目录。
- 官方安装器报告现有 `dsh-worktable@0.10.0-rc.3.9` 和 `@deepseek-ai/dsh-tool-personal-learning@0.1.0-alpha.1` 的宿主版本声明不支持 rc.1，可能阻止日常 web 启动；未修改、禁用或豁免其他插件。本轮没有启动用户日常 3080。
