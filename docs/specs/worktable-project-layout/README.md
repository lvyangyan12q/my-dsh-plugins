# 项目布局实施工单

规格：[项目布局落盘与恢复](../worktable-project-layout.md)。集成分支：`codex/worktable-project-layout`。审查固定基线：`a2a10d01b0c8327cb1f0cec031c897d143b4a4c1`。

| 工单 | 依赖 | 内容 |
| --- | --- | --- |
| [01](01-storage.md) | 无 | 文件格式、原子存储、迁移及受认证接口 |
| [02](02-client.md) | 无，共用下方接口约定 | 布局快照、保存队列、状态、恢复入口、分栏兼容 |
| [03](03-tooling.md) | 01 | 布局命令行工具与使用文档 |
| [04](04-acceptance.md) | 01、02、03 | 最终产物、真实宿主验收、两轴审查与推送 |
| [06](06-custom-window-validation.md) | 无 | 自定义提交前校验 |
| [08](08-custom-submit-races.md) | 06 | 重复提交及途中变化保护 |
| [05](05-window-interaction.md) | 无 | 完整宽高拖拽与版本3保存 |
| [09](09-single-minimize.md) | 05 | 单窗收起、补位及展开恢复 |
| [10](10-region-minimize.md) | 09 | 整行、整列和全部收起 |
| [07](07-increment-acceptance.md) | 08、10 | 最终包、真实宿主、审查与PR交付 |

01—04及新增05、06、08—10已完成。增量审查基线为 `0ef4597ada997131da4d64a66590e5efb14e1cc4`，两轴发现已集中修复并独立复查为0。rc.3.6通过打包、隔离实际安装及宿主用户流程；全部工单与父规格关闭，分支已推送、远端双资产哈希一致，[PR #4](https://github.com/lvyangyan12q/my-dsh-plugins/pull/4)已可审阅。

版本3契约：独立 pane.minimized、geometry.leftHs 与最近手动展开基准，现有 collapsed 和 leftWs 含义不变；兼容读取版本1/2，版本2首次升级前保留原字节备份。收起及自动补位不覆盖手动尺寸，身份枚举仍包含隐藏窗格。

## 第一阶段接口约定（历史）

新增受宿主 connection.admit 保护的 `/api/worktable/project-layout`。客户端通过同源凭据 POST JSON 调用。

- `{action:'read',folder,projectId?,legacyFile?}`：读取固定主文件，缺省时查明确匹配的旧文件或唯一候选；多个候选返回 `ambiguous` 并含候选文件名。`legacyFile` 只接受服务端返回的旧布局文件名，用于显式选择。
- `{action:'save',folder,expectedRevision,layout}`：`layout` 是 `{project:{id,name},spec,geometry}`；新建的 expectedRevision 为 null，否则是读到的 revision。服务端检查并返回提交后的完整 document。
- 成功读取/保存：`{status:'ok',document,folder}`，document 为 `{version:2,revision,savedAt,project,spec,geometry}`，folder 是服务端规范目录。读取旧文件时返回 `{status:'legacy',document,folder,legacyFile}`，document 是待以 expectedRevision:null 创建的版本2候选；不得在只读请求中偷偷写文件。
- 其他读取结果：`{status:'missing'|'ambiguous'|'invalid'|'unsupported'|'error',message?,candidates?,folder?}`。错误写入返回 `{status:'conflict'|'invalid'|'unsupported'|'error',message}`；HTTP 409 用于修订冲突，400 用于格式错误，403/503 沿用宿主准入。前端必须先解析响应状态，不将非2xx都当成缺失。
- geometry 为 `{chatW,topH,leftW,paneWs,topWs,leftWs}`；三种数组使用 `{[paneId]:number}`，避免仅凭数组下标套用旧窗格宽度。几何数值为有限非负值，当前视口的最终钳制由分栏引擎负责。
- 规范校验与 Node 文件存储由共享 ESM 模块导出；工具从同一模块使用读取/保存协议，不另外实现文件格式与锁。

以上保留rc.3.4版本2接口历史。当前读取版本2/3，新写入版本3；版本1仍以legacy候选显式迁移。版本3增加pane.minimized及可选geometry.leftHs，版本2首次升级前保留原字节备份。未知版本拒绝，已冻结包不覆盖。

每张工单记录实际红绿测试与 Resolution。状态只有验收满足时才改 closed；04 及规格不得因源码测试通过就假记真实安装完成。
