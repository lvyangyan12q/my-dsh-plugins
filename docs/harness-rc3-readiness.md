# 原生 Harness rc.3 启动准备记录

后续状态：本任务启动的 3080 实例已按用户要求关闭并确认端口释放，交由用户自行启动。本页以下是当时构建与启动记录，不推断用户当前进程状态。本轮升级规划不启动或停止实例。

2026-10-24：已准备并从 `D:/programming/workspace/deepseek-harness` 启动 3080。宿主为 `0.2.1-rc.3`，提交 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，使用原 `C:/Users/pc-zzy/.dsh` 和 web profile。没有切换到另建 alpha.2 运行时，也没有给原生源码或 lib 打补丁。

## 已完成

- 使用 Node 25.2.0、仓库声明的 pnpm 11.28.5 执行官方 `pnpm run build`。pnpm 按现有锁文件自动补齐依赖，安装阶段 52.3 秒；官方构建 153.62 秒，10 项全部通过，0 失败、0 跳过，记录 364 份客户端产物。
- 原先缺失的 `packages/api/remote-access/lib/typert.host.js`、`packages/api/gateway/lib/client.browser.js`、`packages/client/ui-secret-mask/lib/client.js`、`packages/client/ui-deepseek-model-label-1017/lib/client.js` 均存在，Web 静态产物已生成。
- 启动前备份并校验原 home 内 157 个配置、会话、存储、附件和工作台状态文件，约 39.9 MB。未复制 profile 的 node_modules、缓存目录或考公资料链接目标。
- 使用原仓库的 `apps/cli/src/bin.ts web --no-open --host 127.0.0.1 --port 3080` 启动。浏览器实际加载原生侧栏、工作区、旧会话标题列表、原生输入区和工作台入口；未发送 AI 消息，未新建学习记录。
- 未登录的独立 HTTP 请求返回 401，浏览器沿用原鉴权状态正常打开，没有关闭鉴权。进程记录和登录启动日志只留本机私有目录，不提交凭据或带鉴权查询参数的地址。
- 构建与启动后原生跟踪文件差异为空；保留既有 `.dsh` 考公 Skill 链接，没有再次产生 src 编译残留。官方安装生命周期同步了本仓库 Git hooks；未修改 AGENTS 或业务源码。

## 原数据检查与影响

启动前 157 个文件中，会话日志与原业务数据保持；1 个可重建 session projection cache 和 2 个工作台锁 owner 文件发生变化，其余 154 个原文件哈希保持。启动还可能新增正常日志及缓存，不视为业务迁移完成。未改正式 profile 包清单和配置覆盖来规避插件错误，也未删除其他插件。

本机私有备份 basename 为 `harness-rc3-start-backup-3970fa68`，清单为 `backup.private.json`；启动记录为 `.local/harness-rc3-current.private.json`，构建日志为 `.local/harness-rc3-build-20261024.private.log`。这些位于本机任务目录，不是插件仓库的待提交资产。

## 当前插件边界

- Project Notes 0.2.1、Reading 0.2.2 的依赖声明尚不支持 rc.3，官方兼容检查跳过加载；未添加版本豁免。
- BetterSidebar 因等待 `webRuntime` 未激活；Modlens 调用不存在的 `settings.register`，其设置注册被跳过。这些属于已有第三方兼容问题，没有禁用它们或计为通过。
- Worktable 入口可显示，只说明本次加载结果，不代表完整框架或原生 AI 闭环已经通过 rc.3 验收。
- 考公仍待从 personal-workbench 迁移到派生 Worktable SDK，再验证旧数据、资料、角色和会话恢复。本次未执行迁移。

## 下次启动

本任务实例已停止。自行启动前先检查端口是否已由你后续启动的进程占用；空闲时可在 PowerShell 执行：

```powershell
Set-Location 'D:/programming/workspace/deepseek-harness'
$env:DSH_HOME = 'C:/Users/pc-zzy/.dsh'
pnpm dsh web --no-open --host 127.0.0.1 --port 3080
```

此命令直接使用当前仓库；后续拉取新的原生提交后，需要重新检查依赖、构建和插件兼容性，不能沿用本次验收结论。遇到端口占用先核对进程所属，不重复启动或批量结束 Node。

总体接入步骤见[工作台接入说明](worktable-integration.md)，现场清理见[清理记录](harness-working-tree-inventory.md)。工作台与考公的新版本路线仍按 wayfinder 后续继续，不据本次原生启动关闭完整规格。
