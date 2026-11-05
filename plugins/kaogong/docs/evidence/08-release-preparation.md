# 08 准确包发行准备（2026-11-05）

候选0.4.0-alpha.3.1，宿主0.2.2-alpha.3/8bd0733。产物版本测试先红后绿，Host65/client43/domain21/artifact1与build双声明通过。官方CLI独立安装、公开RuntimeResolution/Scope身份、独立get-tsconfig依赖均通过。

SHA256: eb9b9796510575aa20371410ffdab0297d9cee8b07c307e9174d6c17a9245b6e。准确包已安装本轮独立home，109个包文件逐字节一致。真实UI/Native模型/恢复矩阵待执行，08不关闭。工作台冻结包不支持alpha3，共存未验且不使用豁免。

隔离运行准备：官方CLI已在独立home启动127.0.0.1:3164；仅引用原凭据文件路径和provider apiKeyEnv，不复制secret，不安装工作台。roleCwd为独立验收workspace。启动回执/启动URL仅私有文件；HTTP根401符合鉴权启用，真实浏览器会话及模型仍由后续08验收证明。未触碰正式3080。

## .2 生成任务身份修复
真实浏览器验收发现generate未传稳定知识点。新增公开Host测试先因undefined失败，再修schedule保留结构化knowledgePoint，StudyPlan只对新调度slot按精确科目/知识点绑定冻结ID；不从标题推断或补写旧任务。新计划→路线同任务→开始同point→本人确认覆盖+1通过。既有adjust只移动原任务的逻辑保持，进行中/完成项不改身份。

新候选0.4.0-alpha.3.2完整build/Host66/client43/domain21/artifact1、官方独立安装identity通过，.1保留不覆盖。.2尚未切换本轮运行实例，真实原位升级/页面验证待协调执行。

.2 原位升级验证：在用户流程暂停后核对本轮PID/3164监听身份，停止自建服务，仅官方CLI更新本轮独立profile。升级前10个业务、Session与Cordis配置文件逐项哈希；安装后及重启后均10/10原样，无新增。准确包109文件逐字节一致，SHA256 9758f1fb7e13b75b4fe0d396803ffcfcb72ba49edd970823b88bc5918342c3f9。同home/cwd/3164恢复运行，真实页面恢复留后续验收。
