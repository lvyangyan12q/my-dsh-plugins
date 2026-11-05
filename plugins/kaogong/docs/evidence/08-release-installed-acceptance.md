# 08 准确包实装验收 — 2026-11-05

状态：部分验收。08 保持 open；01–07 的 implemented-pending-release-acceptance 不因源码门禁变为完成。

## 候选与源码门禁

宿主官方 DSH 0.2.2-alpha.3，HEAD 8bd073392eef6f54e921a093b95076248eb08cbb。仅独立 home、3164、无工作台；未改宿主源码、正式 3080、其他插件或上游。

最终候选 0.4.0-alpha.3.3，SHA256 `9557e8cbcdde847e96190eb3e168cca96da383e5d3ce8b6cd5a7555fae0bf388`，109 文件。旧 .1/.2 冻结保留。源 tip fb0cc31，包含已审查日期与可见错误修复。版本契约先红（实际 .2，期望 .3）后绿。完整 pack 门禁：Host 66、client 40 + Host/UI 5、domain 21、artifact 1；Host/client/types 构建成功。官方 CLI 独立目录实装、真实 Scope/installed owner 身份门禁通过；未知运行时拒绝未放宽。

以下真实浏览器记录按版本区分，不将 .2 的用户动作冒充 .3 重做。

| 检查 | .2 真实 UI | .3 准确包回归 |
|---|---|---|
| 目标与计划 | B 明确确认 2026-11-19、每日2、25任务 | 计划及已完成项恢复；资料分析权重经未来调整为21 |
| 稳定知识点 | 生成增长率任务→同任务课堂 kg-point-047 | 路线/进度恢复 1/73 |
| 题库与评分 | 资料库明确授权10道合成题，9对1错，90%，保存错因与反思 | 原1轮10题9对1错、90%恢复 |
| 课堂收尾 | 关联真实已提交轮次、保存手工学习总结、明确确认完成；学习/计划已保存，回忆已入队 | 记录与计划完整保留，无新增完成 |
| 错题复习 | 明确确认加入1/3/7；提前重新作答A，提交不推进；反思并确认后阶段1、下次11-08；原B错误保留 | 后续队列11-08与统计恢复 |
| 知识点回忆 | 提前回忆先写后提交；揭示拒绝“暂无获准参考资料”，确认次数仍0 | 队列11-06恢复；完整揭示/三种自评未验 |
| 正式计划边界 | 预览复习排程明确容量不足，可取消；未越容量；进度未来调整预览+确认保护完成项 | 保留计划，不把提醒算作正式任务 |
| 档案隔离 | A 覆盖0、无评分/复习；切回B保留自己的记录 | B/原会话及筛选恢复 |
| 授权/私有资料 | 题库引用显式授权；无获准讲义，未泄露资料库私有讲义 | 未追加授权；撤销完整场景未验 |
| 刷新/重启/重装 | 浏览器刷新后原Native会话、B学习页恢复 | 官方CLI原位升级及同一准确包重装：每次109文件逐字节一致；20个业务storage/Session/Cordis文件安装后、重启后均20/20哈希不变；浏览器恢复B、科目/知识点筛选、两类队列和评分 |
| 视觉与键盘 | 实际发出并查看原生截图：路线1440×900、900×600 | 实际查看复习页1440×900、640×560，导航/筛选自然换行；Tab聚焦筛选。未全面测键盘路径、主题、IME |
| 修复可见错误 | 发现启动失败藏在折叠设置内 | 无总结任务核对被拒绝；收起设置后顶层alert仍显示“请先保存学习总结”，覆盖仍1/73；未为此破坏已登记工作区来重演原Native缺目录错误 |
| 日期修复 | 发现边界由最终审查补充 | 当前实际后续11-06/11-08显示正确；跨时区/同日未来边界由新增源码公开页面测试覆盖，未修改系统时钟制造实装证据 |

## Native 外部阻塞

已通过官方 `workspace/create` Remote 注册本轮真实 cwd（公开 WorkspaceController，`args.request.path`）；没有改 storage 或绕 guard。Native 单一输入框与右侧课堂打开、真实消息发送、会话刷新恢复已观察。

GLM-5.3-Flash 真实调用返回 HTTP429/code1310，周/月额度耗尽，提示本地15:13:30重置；已配置替代 DeepSeek-V4.1-Flash 单次真实调用返回 AUTH/API密钥无效。没有再批量尝试、复制secret、伪造模型响应。私有 Skill 实际读取、模型工具、问题卡、拒绝/允许一次审批、实际 Stop 行为均未通过；仅见Stop按钮不算Stop通过。

原生知识工具未成功，故没有合法自有讲义用于完整揭示与自评。当前合成来源的私有讲义不共享，缺资料拒绝属于实测通过；不能将其说成完整回忆通过。未找到可直接安全使用的公开任意工具Remote，未为夹具注入agent上下文或新增接口。

工作台冻结 rc.3.9 只声明 alpha.2/rc.3，不支持当前 alpha.3；共存未验，未修改工作台或启用版本豁免。

## 证据保存与限制

本轮私有证据位于 `C:/Users/pc-zzy/.codex/visualizations/2026/10/25/01a173b6-40b6-7fe0-b2c6-3235401e2e8f/release08-acceptance`，含脱敏可报告结果及私有原始snapshot：practice-score-90、learning-closeout、wrong-review-confirmed、recall-missing-material、profile-a-isolation、native-rate-limit、native-alternate-auth、release3-visible-error、release3-reinstall-restored、release3-progress-restored；文件后缀 `.private.json`。保护清单 upgrade3/reinstall3 的 before/after-install/after-restart 同后缀；准确109文件清单 installed3-byte-identity.json。

截图实际通过工具原生image查看，因DevTools文件root限制未保存图片文件，不捏造截图路径。未测的部分成功重试/多轮候选完整实装、重复并发提交、资料撤销全链、全部键盘与主题、IME和其他平台仍是剩余验收；源码回归不能代替。

保留独立home所有新增学习记录、Native Session、候选包和回退材料。不公开发布或推送。本轮正式安装未授权实施，仍未安装日常3080。最终清理只停止核对身份的自建3164和DevTools桥，保留home与证据；工作树交主agent归档清理。

## 隔离实例启动与回退

实例已停止。以下命令仅手动恢复本轮隔离验收，不启动日常3080；运行前检查3164空闲。配置原位引用凭据，命令不含密钥或launch token。

```powershell
$env:DSH_HOME = 'C:/Users/pc-zzy/.codex/visualizations/2026/10/25/01a173b6-40b6-7fe0-b2c6-3235401e2e8f/release08-acceptance/home'
$env:DSH_TELEMETRY_DISABLED = '1'
Set-Location -LiteralPath 'C:/Users/pc-zzy/.codex/visualizations/2026/10/25/01a173b6-40b6-7fe0-b2c6-3235401e2e8f/release08-acceptance/workspace'
node D:/programming/workspace/deepseek-harness/apps/cli/lib/bin.js --profile web --host 127.0.0.1 --port 3164 --no-open
```

回退前停止上面启动的实例，保存当前插件清单、配置及业务文件哈希。保留的 .2 包SHA256为 `9758f1fb7e13b75b4fe0d396803ffcfcb72ba49edd970823b88bc5918342c3f9`，包已复制到原仓库releases以免工作树清理影响回退。保持同一DSH_HOME与cwd，使用官方CLI：

```powershell
node D:/programming/workspace/deepseek-harness/apps/cli/lib/bin.js plugin --profile web add D:/programming/workspace/my-dsh/plugins/kaogong/releases/deepseek-ai-dsh-tool-kaogong-0.4.0-alpha.3.2.tgz --offline --ignore-scripts
```

然后按上面的启动命令运行，并重新验证安装身份、原会话和学习记录。仅恢复本轮插件包及确有需要的单项插件配置；不整库恢复、不覆盖本轮新增学习或Session。此次实测的是 .2→.3 升级与 .3 同包重装，未执行 .3→.2 降级；未知跨版本行为不保证兼容，不能把回退说明视作降级验收通过。

双轴最终审查：Standards 0项；Spec发现2项P2日期问题，已修复并通过新增回归。另实装发现的折叠设置隐藏错误一并修复，.3现场检查顶层alert可见。README同步新版四页及alpha.3，未声称工作台共存通过。

清理实际状态：已核对PID/命令/监听后停止本轮3164实例及DevTools桥；复查3164监听为0、两PID均退出，最终20个保护文件仍全部哈希一致。独立home、准确包、证据与回退材料保留。发行工作树的归档清理由主agent/merger随后执行，本记录不预报已清理。
