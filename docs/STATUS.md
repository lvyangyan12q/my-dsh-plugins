# 工作台进度与待办

## 当前检查点 · 2026-10-23

2026-10-23 当前：独立官方未补丁rc.2/3091已安装冻结Worktable0.9.4（SHA256 c40c0c550cc1fa4c55f54eb695c712c58609b82bd82c52c920f5ca081aa1aff6），9/9包内文件一致、peer0。15追加真实旧G6失败恢复、显式预览/草稿/启用及同包卸载重装冷恢复，已关闭；12—18按各票限定范围关闭。19仍open：最终增量映射、正式宿主可用前提、3080同步与远程交付待完成。3080仍0.7.2，本轮尚未同步或推送。原生alpha.2独立3092在插件安装前已有9项原生inactive，原生UI失败不能计为工作台UI通过；未修改原生。两轴审查固定485b38c共3项已由单一implementer修复，source272/272、独立18/18与factory10/10不替代实页。完整spec和历史172分类保持，考公暂缓。

当前证据：[19阶段实页记录](wayfinder/worktable-platform/implementation/evidence/19-final-interim-installed094.json)。以下旧日期段落保留为历史，不能覆盖此检查点。

2026-10-22当前前沿：12、13、14、15、16、17、18已按各票实际范围关闭；19全部依赖已解除，进入最终闭环和两轴审查。15已在独立官方rc.2/Worktable0.9.3（SHA256 57222fda4d6f4b9310e42baa2c1648372f5ea26a2dc2ae9f049a9497b15abd5b）完成原生生成追改、A/B隔离、目标替换与原生Stop、Skill及单次审批验收，见[15实页证据](wayfinder/worktable-platform/implementation/evidence/15-installed.json)。17已在同一0.9.3完成真实合作网页只读两条新合成资料、只准备任务、界面撤资料后读取/原生发送拒绝；独立Chrome补同主机跨端口/缺CSP接纳/302跳宿主拒绝及刷新默认关闭，见[17实页证据](wayfinder/worktable-platform/implementation/evidence/17-installed.json)。最终冷启/旧包回退/剩余窄屏明暗和3080目标宿主仍待19；3080保持原部署，完整spec仍open，历史映射不变。


## 当前实施 · 2026-10-21

用户已要求继续implement-spec，继续集成分支`codex/worktable-framework`。[后续范围](wayfinder/worktable-platform/continuation-spec.md)和[12—19工单图](wayfinder/worktable-platform/implementation/README.md)为本轮入口；起点`92d14ac`。本段更新时集成`7649c490`：12组合草稿Host合同、13公共展示与独立应用、16原生状态及真实存储故障已验收关闭；14模块内搭建、18升级影响确认已进入独立工作树实施。15等14，17等14+16，19负责最终真实闭环与固定基线两轴审查，尚未关闭。

独立3091使用未经补丁的官方DSH0.2.0-rc.2，官方CLI安装Worktable0.8.0、Notes0.2.0、Reading0.2.0。首次依赖核对曾发现profile缺少公开peer而回落alpha；已正常安装锁定公开rc.2依赖、`pnpm peers check`归零并冷启动复验，旧mixed记录保留范围，不冒称其纯rc.2通过。[13-clean](wayfinder/worktable-platform/implementation/evidence/13-clean-installed.json)记录三插件依赖解析及9/5/6安装文件逐字节一致、Notes390/1440明暗主题与公共控件，Reading正常/撤销由root IAB分别实测；未声明Reading390整视口或拖窄成功。

[12-clean-cold](wayfinder/worktable-platform/implementation/evidence/12-clean-cold.json)补齐新clean七步目标的再次真实冷恢复：running1.1.0、revision7与原实例/视图保持，4份平台耐久JSON原字节保持，当前17实例/27视图包含合成setup。[16-clean](wayfinder/worktable-platform/implementation/evidence/16-clean-installed.json)记录真实运行、等待、provider失败、Stop/未读/打开清除与官方已安装profile真实503拒绝及释放重试；Stop、未读不等于成功或确认取消。临时provider、合成key和测试listener均已清理。

冻结归档SHA256：Worktable0.8.0 `c4fb81aa00de16390ed11eeadd7c0e0e5425bf48f0bfcbb156c4e066e8096a91`；Notes0.2.0 `375f1ef756e5da976de2c8286f3dd6d59ad3059fcba41dcd0df242ed05cab17e`；Reading0.2.0 `33ade5eabea718f8daed1652fdd675c372b122916064b7b8b8bde95ed49cdf9a`。后续源码变化须新版本重新发布验收，不覆盖冻结资产。

3080保持先前0.7.2，不提前部署候选；本轮源码/证据尚未推送远端。原生仓库、上游及六份历史用户改动保持，考公暂缓。完整spec仍open，172项旧映射66/94/12保持，未用新源码自动提升旧验收计数。以下各历史日期按当时版本解读，不覆盖本段。

## 最新状态 · 2026-10-20

Worktable派生框架首阶段01—11工单已closed，代码与验收记录检查点`b99cdcd`已推送`origin/codex/worktable-framework`，未合入main。最终Worktable0.7.2、Notes0.1.2与固定Reading组合、SDK协议v1见[验收](wayfinder/worktable-platform/implementation/11-acceptance.md)。当前完整framework spec仍open，旧12张工单与123项原要求不自动关闭。

优先阅读：[接续交接与代码位置](wayfinder/worktable-platform/handoff.md)、[实现技术路线及后续待办](wayfinder/worktable-platform/technical-roadmap.md)、[完整框架spec](wayfinder/worktable-platform/framework-spec.md)、[11张工单](wayfinder/worktable-platform/implementation/README.md)、[两轴审查](wayfinder/worktable-platform/implementation/11-review.md)。

172条映射为66首阶段已验/94当前未验/12后续保留；新框架49条为41/6/2。计数不是独立缺陷数，具体边界以[逐项映射](wayfinder/worktable-platform/implementation/11-acceptance-mapping.md)为准。完整搭建器、AI生成追改、通用展示组件库、未知升级与旧资料迁移仍有缺口；考公专项暂缓。后续建议已记入技术路线，本次未发布新工单。

3091真实验收使用官方未补丁DSH0.2.0-rc.2，现已按用户要求停止；3080已于本日后续获用户授权切换0.7.2，当前原生为0.2.1-alpha.2，只完成安装/加载/控制室页面检查，不替代rc.2完整验收；3095仅本机交互原型。11个临时工作树已获授权清理，保留分支、38份本地发布归档与验收数据。未修改原生仓库或原上游插件。最初交接提交812c8bf仅文档；后续用户明确要求“去掉其他的只加载我们最新的”，现已调整用户web profile并从原生源码启动3080。旧personal-workbench、旧阅读、旧考公接入停用但软件与数据保留，上游0.4工作台链接已替换为精确0.7.2验收包；其他插件保留。配置已本机备份，未新增兼容豁免。

**下面所有较早日期的“尚未实施/未推送/open”均为当时状态记录，不覆盖本段当前状态；旧版personal-workbench的兼容和启动记录不等于新派生框架验收。**

## 2026-10-18：Worktable 基线框架规格

用户已确认以Worktable为基线、AI工作台为主、模块化内核及应用独立接入；项目可组合应用，实例状态与会话默认隔离、数据显式共享，同实例多视图共享状态。[框架与应用接入规格](wayfinder/worktable-platform/framework-spec.md)已发布到本地跟踪器，status=open、ready-for-agent。主验收为真实安装的完整用户流程，用户已明确确认；尚未冻结脏工作树基线、实施迁移或验证新组合。后续按[决策地图](wayfinder/worktable-platform/map.md)保留未决接入及交互事项。旧规格、原123项要求及历史验收继续保留，不据新规格关单。本轮仅文档写入，没有产品代码、原生、3080或远程变更。

以下2026-10-11进展保留为历史状态，不代表新框架已实现。

更新日期：2026-10-11。

## 当前状态

此前恢复至`639ed015`的记录保留；当前原生仓库检出为`d743267388`（alpha.2），本轮未修改其跟踪文件。本地配置、资料和数据保留。3080 的源码与编译产物存在版本不一致，尚不能确认实际运行版本。

工作台无原生补丁适配已有当前平台实页证据，完整要求尚未全部完成。产品`0c232925`的406项回归及3089实页结果来自旧补丁环境，只作历史证据，不能据此宣布当前兼容或部署通过。

## 本轮进展（2026-10-11）

- 工作台通过公开main/panellist接入，使用原生conversation.content与同Session公开导航；不修改原生菜单或编辑器，不要求历史compat补丁。stock原生不新建无法持久注销的BetterSidebar标签，保留主入口与已知旧标签公开恢复。
- 主面板切换卸载、内嵌标题/导航缺失、截图需手动附加是公开限制，不能解释为用户同意删除原要求。完整内嵌标题栏仍未满足。
- 当前只读原生为d743267388（alpha.2），跟踪差异为空；历史恢复639ed015（rc.2）保留。两个精确候选的独立原生构建均通过，安装/实页证据分版本记录。

## 最新独立验证

- rc.2：产品c108c42e的独立干净构建、全量回归、官方安装及消费者门禁通过。
- alpha.2：产品源码561fc228的build-release、check-platform-tests、check-platform-release三门禁status0，严格消费者类型和官方安装通过；旧7项公开Skill/tool契约失败已修复。本摘要不沿用旧测试数。
- 独立未补丁 alpha 原生d743、产品1ab23ed已实际安装和复验；182产品文件、4519目标/4514来源保护文件与28554原生文件核对通过。私有builder下一版本编辑不再误报，保存成功，原角色和历史保持。真实声明工具链pnpm11.28.5执行阅读与工作台卸载、重装；阅读6文件/工作台128文件归档对应，4328保护项保持。缺依赖时真实404/不可用，重装后数据与会话恢复；旧工作台归档回滚→最新恢复实际通过。
- [当前分版本实页记录](wayfinder/workbench-completion/implementation/evidence/2026-10-11-unpatched-live.md#1ab23ed-实际安装与恢复增量)含真实审批/Stop处理、ask、模块生成与修订、手动原生图片附加、文字和历史冷恢复、阅读隔离、页面模板、Agent/Skill停用恢复、管理Agent更换确认及旧历史、应用生成失败重试取消。重试覆盖已选择应用草稿，不是新建独立应用。源码增量Spec/Standards两轴未发现新增问题，继承固定基线审查。
- 3080与远程尚未同步；08/10考公专项暂停，全部12张open。

## 下一步

| 顺序 | 工单 | 交付内容 |
|---|---|---|
| 1 | 01、05 | 公开接口盘点、入口/窗口适配、同Session原生会话路径；移除原生补丁依赖 |
| 2 | 02、03、04 | 画布内搭建、模块与数据联动、公共能力及应用私有角色 |
| 3 | 06、07 | 任意位置标注、模块生成与AI应用草稿闭环 |
| 4 | 09 | 未补丁DSH中的阅读统计完整实页验收 |
| 5 | 11、12阶段 | 当前恢复链已取得实证；复核剩余边界和正式21错误，通过交付门槛后同步3080插件及远程 |

08/10考公专项暂缓，历史实现、资料、会话及成绩保留。全部12张仍open；平台阶段发布不等于完整交付。

## 文档入口

- [规格](specs/README.md) · [路径图](wayfinder/workbench-completion/map.md)
- [工单与依赖](tickets/README.md)
- [验收记录](verification/latest.md) · [原生恢复清单](wayfinder/workbench-completion/native-restoration.md)
- [原生公开接缝盘点](wayfinder/workbench-completion/native-public-seams.md)
- [历史资料](archive/README.md)

每次进度变化先更新本页，再更新对应工单和证据。通过项必须标明产品版本、未补丁原生版本、实际流程及证据；缺口明确保留，不以测试数量代替关单。凭据、私密日志及本地备份不进入仓库。


## 当前未通过边界

完整12工单仍open，原始123标准及既有验收状态保留；考公08/10暂停，地图数据由应用提供、未据此宣称真实地图验收。正式混合依赖strict21错误、精确嵌入标题栏与未发送图片冷恢复等公共限制仍未通过。外观工具限制不计完整视觉或物理指针通过；没有三种适配器切换全部通过声明。3080及本轮远程同步尚未完成。


## 最新561实页增量

当前产品561fc228针对独立未补丁alpha原生d743三发布门禁均0，已在自有3089官方冷升级并启动；183归档产品文件、4521目标/4514来源保护项、28554原生项核对通过。实际桌面工作台填满原生中心1640×889，修复旧1ab收缩276px；原生菜单保留。 实际模板v6/revision21及任务草稿/两上下文已在此升级冷启动后保持；新实例角色隔离、同实例跨页、真实重叠创建唯一绑定已有实证。[561公开证据](wayfinder/workbench-completion/implementation/evidence/2026-10-11-platform-561-live.md)。

新增实例及并发创建后的最终Host再冷启动已核验同身份、历史及草稿；缺失Session文件、模块指针拖拽/尺寸、模板角色/数据重绑、完整视觉不由本证据替代。正式strict21、准确内嵌标题和未发送图片冷恢复两原生公共接口缺口仍保留。原123标准及既有状态、12工单open不改，考公暂停，地图由应用提供真实数据，未同步3080/远程。


## 最终561冷恢复

最终再冷启动后，两Browser公开read的默认、新实例、并发验收三个角色仍同ID/ready；默认4条旧历史引用保持，新实例previous空。实际恢复不同实例的各自未发送文本，无混用或发送。 实际分栏键盘50→55刷新保持、模块放大/返回正常并恢复50；普通无效网址草稿可保存，预览拒绝/启用禁用，恢复空模块后运行未替换。模板revision21仅为先前检查点，后续草稿revision已递增。自由尺寸/拖拽/重绑和完整视觉仍待验。

## 2026-10-18：框架首阶段实施开始

用户已确认[首阶段11张工单](wayfinder/worktable-platform/implementation/README.md)，独立集成分支为codex/worktable-framework。基线保护与关键交互原型已分别在隔离工作树进行；产品改动尚未合入集成分支。浏览器工具存在profile占用，根已验证独立Chrome配置可用，不关闭现有浏览器。其余工单按依赖等待，尤其原型需用户实际评审。未切换3080、未修改原生DSH、未推送本轮分支。
