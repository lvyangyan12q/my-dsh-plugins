# alpha.2一致构建与隔离接入阶段记录

[脱敏记录与私有证据哈希](evidence/19-alpha2-consistent-checkpoint.json)。官方同commit `d743267388641bc76f17c45ce8b4c231aed1d32c` 导出后14988项源字节一致，14个符号链接Git blob精确物化，冻结lock保持，官方安装/构建与三个最小native import通过；没有修补原生源码。原有checkout的旧编译产物失败仍作为历史保留，不与新构建混同。

必须保留两类副作用：v1 PowerShell启动丢失显式环境而误加载默认正式profile，看到第三方后立即停止，未操作业务/模型；cordis.yml被重写但字节与20Oct备份相同，package/lock/patch的修改时间仍20Oct。依赖生命周期还向父插件仓库生成全注释lefthook配置和hook，后续已精确保护；不能声称整个父仓库始终未受影响，也没有盲目恢复旧备份。

v2使用显式Node子环境和官方公开home/agents解析探针，真实空profile原生UI通过；Worktable094手动搭建/关联与095目录补修通过。095首次错误store安装保持失败停止记录，再使用同一已有owned store重试成功；9文件一致、peer0、12份选定非空数据路径不变。两个已知失败不从交接记录抹去。

固定485b38c→df5f918两轴代码审查均无新增actionable finding；这不是完整实页交付。Notes/Reading021冻结后已尝试官方安装，包内字节核对通过但最终peer gate失败并保持宿主停止，未作UI或AI验收；新alpha.2宿主AI未验，没有复制模型凭据。主3091仍094、正式3080仍072；父19及完整spec保持OPEN，历史172与主STATUS不由本文修改。

后续source635c722修复Reading发布器Windows路径，28项源码与两宿主public类型门禁通过，最终021包已冻结（哈希见JSON）。官方CLI完成Notes021和Reading021 add、9/5/6文件字节核对后，Reading三个必需host-provided peer缺失使最终peer gate拒绝；宿主保持停止。data/sessions/storages、正式4配置与父仓库2hook/config哈希保持。Reading022仅做新的metadata修正，不能覆盖021；本阶段不称021实际支持。

另有实际095画布标注：点击位置、填写合成要求、明确确认后注入原生输入，保留project/pane/app/instance/view稳定目标；没有发送、0模型调用。原生未发送草稿重启恢复尚未验，注入不等于AI执行通过。父19保持OPEN。


## 0.9.6实际阶段补证

2026-10-23追加当前阶段：独立一致官方alpha.2/3093已安装冻结Worktable0.9.6、Notes0.2.1、Reading0.2.2。合成记录管理、多视图筛选详情及A/B实例/原生会话隔离已实际验证；Notes原生AI完成与另一轮native Stop、096冷恢复、最小宽度下问题一次提交及拒绝/允许一次审批均有实页证据。模型仅按授权复用连接，未混合实例会话。rc.2/3091已升级最终三包，但本检查点不提前记实页恢复通过。19与完整spec保持OPEN、正式3080未同步；历史172分类不变、考公暂停。前述v1启动失隔离、正式cordis同字节重写、父仓库hook副作用、021peer失败历史继续保留；本段不将整项规格提升为完成。 见[实页阶段JSON](evidence/19-final-alpha2-installed096.json)。问题/审批通过不替代所有旧持久宽度、窄屏与全工作流验收；补票暂保持OPEN，待root最终收口。
