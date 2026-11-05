# 08 准确包发行准备（2026-11-05）

候选0.4.0-alpha.3.1，宿主0.2.2-alpha.3/8bd0733。产物版本测试先红后绿，Host65/client43/domain21/artifact1与build双声明通过。官方CLI独立安装、公开RuntimeResolution/Scope身份、独立get-tsconfig依赖均通过。

SHA256: eb9b9796510575aa20371410ffdab0297d9cee8b07c307e9174d6c17a9245b6e。准确包已安装本轮独立home，109个包文件逐字节一致。真实UI/Native模型/恢复矩阵待执行，08不关闭。工作台冻结包不支持alpha3，共存未验且不使用豁免。

隔离运行准备：官方CLI已在独立home启动127.0.0.1:3164；仅引用原凭据文件路径和provider apiKeyEnv，不复制secret，不安装工作台。roleCwd为独立验收workspace。启动回执/启动URL仅私有文件；HTTP根401符合鉴权启用，真实浏览器会话及模型仍由后续08验收证明。未触碰正式3080。
