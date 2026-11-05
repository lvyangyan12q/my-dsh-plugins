# 08 准确包实装验收 — 2026-11-05

状态：部分验收。08 保持 open；01–07 的 implemented-pending-release-acceptance 不因源码门禁变为完成。

## 候选与源码门禁

宿主官方 DSH 0.2.2-alpha.3，HEAD 8bd073392eef6f54e921a093b95076248eb08cbb。仅独立 home、3164、无工作台；未改宿主源码、正式 3080、其他插件或上游。

阶段候选 0.4.0-alpha.3.3，SHA256 `9557e8cbcdde847e96190eb3e168cca96da383e5d3ce8b6cd5a7555fae0bf388`，109 文件。旧 .1/.2 冻结保留。源 tip fb0cc31，包含已审查日期与可见错误修复。版本契约先红（实际 .2，期望 .3）后绿。完整 pack 门禁：Host 66、client 40 + Host/UI 5、domain 21、artifact 1；Host/client/types 构建成功。官方 CLI 独立目录实装、真实 Scope/installed owner 身份门禁通过；未知运行时拒绝未放宽。

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

## Native 外部阻塞（早期历史，后续结果见末节）

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

## 后续准确包与最终现场结论（2026-11-05 晚间）

最终保留候选更新为 **0.4.0-alpha.3.6**，SHA256 `862cf486a9bb3206ec34b501a02feeaef2de088cae90d8d94d5a643007996abc`，275617 bytes、111文件。固定路径为 `D:/programming/workspace/my-dsh/plugins/kaogong/releases/deepseek-ai-dsh-tool-kaogong-0.4.0-alpha.3.6.tgz`，旧 .1–.5 均冻结保留。本节记录后续实际结果；前面的 .2/.3 记录保留为历史，不把旧动作改写成 .6 重做。

**08仍为部分验收。** 用户本轮提供的 AGENTS 要求准确包在无工作台 DSH 0.2.1-rc.3 中验收；此次实际仅运行官方 **0.2.2-alpha.3**（同上 HEAD），.6 的 engines 也仅声明 alpha.3。本轮 rc.3 未安装、未实测，历史 rc.3 验收不能继承。工作台现包对 alpha.3 不兼容，共存未完成；未改工作台、未加版本豁免。因此父规格及要求 rc.3/共存的复合条件保持 open，01–07 保持 implemented-pending-release-acceptance。

### 后续真实矩阵

| 范围 | 实际版本与结果 |
|---|---|
| 模型恢复 | 用户确认额度恢复后，.3 原课堂 GLM-5.3-Flash 实际加载私有 kaogong-teach Skill；原生 ask_user 教学诊断卡选25%并提交，模型真实继续。长讲解生成中实际 Stop，状态已停止。模型遵守 Skill 禁止知识库写入的限制，没有用模型越权造讲义。前面的429/AUTH仅描述历史阻塞，当前这几项已消除阻塞。 |
| 原生审批 | .4 原课堂切只读，真实 write 请求创建独立workspace内 `approval-probe.txt`。第一次点击拒绝，工具明确拒绝且文件不存在；新回合明确重新授权，点击允许一次，文件真实生成 `synthetic approval test`，默认仍只读。验收后通过UI恢复原工作区内修改模式。唯一原生输入框，无复制聊天框。 |
| 撤销题库 | .4 真UI撤销后，自有原题错误/原B作答/正确A/复习历史及进度90%仍可读，新发题按钮禁用。随后恢复授权。新发题服务器拒绝由Host测试证明；本项UI未伪称发出被禁用的POST。 |
| 撤销材料 | .4/.6 真UI撤销材料后，自己学习覆盖1/73、90%成绩和复习元数据仍可读，显示来源不可用。.6有真实共享原文时撤销，候选、原文预览立即清除，关联显示原资料当前不可用；无整页刷新。自己的第四轮回忆文字仍可提交保存，但揭示原文明确拒绝“暂无获准参考资料”，不能确认新回忆。 |
| 用户关联讲义 | .5 新建独立合成资料库，经预览0题/1共享原始讲义/0私有/4证明文件，勾选确认接入；B先撤旧零共享材料引用，再授权新库。核对原文、选择同科目增长率、明确确认仅个人映射。原讲义分类与证明未修改。A没有自动获得B记录。 |
| 授权刷新修复 | .5新授权后候选不刷新，曾整页刷新继续；这是已发现缺陷，不作为最终通过。.6准确包专项：显示原文→撤销即清空候选和预览→恢复授权即出现候选和原映射，全程未整页刷新，实装通过。 |
| 完整主动回忆 | .5旧已提交周期成功揭示合成原文，未记住确认→11-06；另两轮明确提前回忆，先写再揭示、模糊确认→11-08、记住确认→11-12。三条历史真实保留。未修改系统时间、未注入学习记录。累计回忆3，原正确率90%与覆盖1/73不变。 |
| 隔离 | .5三次回忆后切A：0/73、无已提交轮次、回忆0、错题复习0；切回B记录恢复。资料库原私有分类讲义仍不通过共享读取。 |
| 准确包安装恢复 | .4→.5官方CLI：111文件逐字节一致，22保护文件仅本轮配置两来源路径预期改变；原Native会话恢复。.5→.6官方CLI：111文件一致、24/24业务/Session/config文件哈希不变。.6同包官方CLI重装及冷启动后，111文件一致、24/24仍不变；真实页面恢复B映射、三条回忆/11-12、第四轮未确认文字、90%/1已学、原Native7轮12步及cwd。 |
| 视觉/键盘 | .3实际切宿主暗色，查看桌面/640×560复习图，恢复system；Tab/Enter走复习入口→错题历史→返回队列并继续聚焦筛选，Native设置快捷键/Escape可用。未声称返回焦点严格落回原触发元素。.6新增映射页桌面与640×560稳定截图实际查看，控件换行/原文可读。IME、所有键盘路径及其他平台未测。 |

### 合成来源与证据

本轮新来源在隔离验收根 `synthetic-growth-raw-v2-20261105`。真实生成PDF、相符Markdown及明确手写合成清单，公共资料证明 verified1/private0/assets0；PDF SHA256 `85db5ab06333fc37802a8c3b1e6be06d3be2664f24d7897ab27a50ac3e129aba`。PDF、原文、manifest、job及README明确 synthetic、非真实教材、未运行MinerU。它只证明合成接入路径，不是实际MinerU验收。首次未导入候选因标题/tags不符被拒，单独保留；v2为新目录，任何已接入旧proof都未改。关联/回忆后4个源证明文件逐一哈希仍相同。

私有证据根为 `C:/Users/pc-zzy/.codex/visualizations/2026/10/25/01a173b6-40b6-7fe0-b2c6-3235401e2e8f/release08-acceptance`。其中 `extra-evidence.md` 记录阶段结果；`native-approval-*.private.json`、`release5-recall-*.private.json`、`release6-{revoke-immediate,regrant-immediate,revoked-reveal-denied,cold-recalls-restored,cold-native-restored,cold-progress-restored}.private.json` 为真实页面回执；`installed6-byte-identity.json`、`reinstall6-{before,after-install,after-ui}.private.json`、`final6-stopped.private.json` 为逐文件证明。实际查看并保存 `native-approval-completed.png`、`release6-mapping.png`、`release6-mapping-narrow-stable.png`；窄屏初次动画中截图不作为稳定布局通过证据。凭据、启动token、源文件和私有截图不提交仓库。

双轴后续审查修复包括：撤销来源误挡自有成绩/元数据、材料同科目确认边界、自有映射在来源撤销后的安全重验、React卸载/迟到响应隔离，以及授权变化即时清除旧预览。准确 .6 完整pack与独立官方安装身份门禁由发行记录证明；真实浏览器证明仅覆盖上表实际动作，不替代全部源码边界。

### 最终保留、启动与回退

沿用上面的独立DSH_HOME、workspace及3164 PowerShell启动命令，实际最终安装包是.6。CLI依赖指向原仓库固定releases，避免删除工作树导致file依赖失效。最终仅核对后停止自建PID15788（3164）及PID48108（本轮DevTools桥），复查两PID退出、3164无监听；24/24保护文件仍完全相同。home、所有新增记录/Session、合成源、全部候选包与证据保留。发行临时树由主agent按链接规则另行清理。

回退仍必须停止本轮实例、保护当前记录，仅用官方CLI更换保留包和确有需要的单项配置；不整库覆盖新增数据。上文.2回退命令仅作为保留路径说明，**没有执行.6→旧版降级验证，新增映射跨旧版兼容不保证**；优先保留当前.6数据并核对目标版本合同。未安装日常3080、未向公共仓库/工作台上游发布或推送。

剩余未验：本轮rc.3准确包、alpha.3工作台共存、全部部分成功重试/多轮候选完整实装、重复并发冲突完整实装、全部键盘路径、IME及其他平台。已完成的alpha.3独立真实闭环与恢复不能被表述为这些复合条件全部通过。
