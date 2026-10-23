# 正式3080同步与下次启动

2026-10-23正式交付检查点：用户选择的一致官方alpha.2构建已在3080使用原home和原数据，Worktable096/Notes021/Reading022正式同步，9/5/6文件与冻结包一致。目录可见两应用，创建的空Reading实例在刷新后经继续入口恢复同ID、无重复，无正式记录或AI请求。原Reading开发junction本体已归档、目标未动；第一次EPERM失败保留，正式重试通过。其余6依赖/lock解析、业务及3份根目录敏感文件哈希保留；原生UI只明确启用新Reading组件，策略恰一boolean变化。既有Modlens/BetterSidebar警告未禁用且不记通过。19仍OPEN待merger最终核验与远程交接，完整spec/历史172与考公等保留范围未改。

[脱敏版本、保护结果与私有证据哈希](evidence/19-formal-delivery096.json)。原生源码未补丁；既有第三方错误仍单列。正式空实例与目录点测不能替代全部业务/AI验收。父19继续OPEN，完整spec历史要求不在此关闭。

下次启动应使用用户已选的一致构建及原home。已审本地helper为 `worktable-formal-consistent-start.mjs`，参数为已成功的 `worktable-formal-reading-repair-20261023/operation.private.json`。两者在本机私有任务目录中，仓库只记录basename与哈希，不复制home、凭据或启动日志。当前3080已运行；正常退出后，在该本地任务目录执行：

```powershell
node .\worktable-formal-consistent-start.mjs .\worktable-formal-reading-repair-20261023\operation.private.json
```

helper核对已审receipt、实际官方home解析和3080空闲，仅启动已选构建，保留原数据；若端口占用会拒绝，不自动停止进程。启动后以新ready-check和真实页面确认，不只凭进程创建成功。原始源码目录中的 `pnpm dev` 仍属于该checkout的启动方式，不能承诺它会运行这份另建的一致构建。

通用等价入口是指定一致构建的CLI、原home和web profile，而非切换源码仓库：

```powershell
$env:DSH_HOME = '<原有DSH home>'
$env:DSH_SOURCE = '<已选一致官方构建目录>'
node '<已选一致官方构建目录>/apps/cli/lib/bin.js' --profile web --no-open --host 127.0.0.1 --port 3080
```

优先使用本机已审helper与成功receipt，避免填错home。旧0.7.2回退包、正式安装备份和旧Reading junction本体已保留；原junction目标与其他依赖不删除。初次失败和随后修复均保留，不用旧备份覆盖当前数据或策略。

正式启动和刷新继续后，独立核对安装前123份session/storage旧文件哈希全部一致，业务记录新增0、AI发送0；只新增已说明的空Reading实例。后续阶段19待最终merger核验、本批文档推送及交接后可有限关闭，完整framework spec及历史172不因此关闭。

当前正式入口的一致官方构建位于插件仓库的 `.scratch/native-alpha2-consistent-windows-20261023`。虽然目录名含scratch，它是已选正式运行时，必须保留；它不是implementer Git worktree，不在开发工作树清理范围。清理临时作者工作树不能删除这份运行时、原home或交付备份。
