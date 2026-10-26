# 项目布局实施工单

规格：[项目布局落盘与恢复](../worktable-project-layout.md)。集成分支：`codex/worktable-project-layout`。审查固定基线：`a2a10d01b0c8327cb1f0cec031c897d143b4a4c1`。

| 工单 | 依赖 | 内容 |
| --- | --- | --- |
| [01](01-storage.md) | 无 | 文件格式、原子存储、迁移及受认证接口 |
| [02](02-client.md) | 无，共用下方接口约定 | 布局快照、保存队列、状态、恢复入口、分栏兼容 |
| [03](03-tooling.md) | 01 | 布局命令行工具与使用文档 |
| [04](04-acceptance.md) | 01、02、03 | 最终产物、真实宿主验收、两轴审查与推送 |

## 并行实施接口约定

新增受宿主 connection.admit 保护的 `/api/worktable/project-layout`。客户端通过同源凭据 POST JSON 调用。

- `{action:'read',folder,projectId?,legacyFile?}`：读取固定主文件，缺省时查明确匹配的旧文件或唯一候选；多个候选返回 `ambiguous` 并含候选文件名。`legacyFile` 只接受服务端返回的旧布局文件名，用于显式选择。
- `{action:'save',folder,expectedRevision,layout}`：`layout` 是 `{project:{id,name},spec,geometry}`；新建的 expectedRevision 为 null，否则是读到的 revision。服务端检查并返回提交后的完整 document。
- 成功读取/保存：`{status:'ok',document,folder}`，document 为 `{version:2,revision,savedAt,project,spec,geometry}`，folder 是服务端规范目录。读取旧文件时返回 `{status:'legacy',document,folder,legacyFile}`，document 是待以 expectedRevision:null 创建的版本2候选；不得在只读请求中偷偷写文件。
- 其他读取结果：`{status:'missing'|'ambiguous'|'invalid'|'unsupported'|'error',message?,candidates?,folder?}`。错误写入返回 `{status:'conflict'|'invalid'|'unsupported'|'error',message}`；HTTP 409 用于修订冲突，400 用于格式错误，403/503 沿用宿主准入。前端必须先解析响应状态，不将非2xx都当成缺失。
- geometry 为 `{chatW,topH,leftW,paneWs,topWs,leftWs}`；三种数组使用 `{[paneId]:number}`，避免仅凭数组下标套用旧窗格宽度。几何数值为有限非负值，当前视口的最终钳制由分栏引擎负责。
- 规范校验与 Node 文件存储由共享 ESM 模块导出；工具从同一模块使用读取/保存协议，不另外实现文件格式与锁。

每张工单记录实际红绿测试与 Resolution。状态只有验收满足时才改 closed；04 及规格不得因源码测试通过就假记真实安装完成。
