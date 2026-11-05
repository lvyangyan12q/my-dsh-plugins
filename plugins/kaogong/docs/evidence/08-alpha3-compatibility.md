# alpha.3 兼容前置验证

2026-11-05，官方宿主 8bd073392eef6f54e921a093b95076248eb08cbb / 0.2.2-alpha.3。

真实 standalone-native HTTP 集成先复现409 NATIVE_ROLE_SCOPE_RUNTIME_UNRECOGNIZED。源码候选发现的旧版本范围不包含alpha.3；编译Scope与源码preset图身份不同。新增alpha.3候选发现，仍须通过active TSX、安装元数据、来源路径及实际preset probe，不直接准入候选。

按官方manifest同步Host/client/可选依赖：DSH alpha.3、Cordis 4.0.6-alpha.2、Schemastery 3.18.6-alpha.2。包版本留最终发行票统一确定，冻结包未覆盖。

真实Native集成1/1、Host/client官方声明、插件完整构建、发行白名单契约1/1均通过。测试使用 --import tsx/esm 公开导出入口。未做准确包安装、真实模型或浏览器验收。未修改宿主源码或共享依赖，未启动3080；身份校验和未知runtime拒绝保留，无调试日志。
