---
id: harness-rc3-installed-acceptance
title: 新包真实安装与工作台考公完整用户验收
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [harness-rc3-host-consumers, harness-rc3-classroom-application, harness-rc3-kaogong-instances, harness-upgrade-acceptance-cutover]
target: 0.2.1-rc.3
---

## W.5/K.3 实际复验：候选仍未通过 · 2026-10-25

独立3101以官方source CLI启动准确W.5/K.3后，此前合成课堂和总结恢复。通用资料连接已完成真实显式授权、应用刷新读取1份公开资料、PNG显示及私有讲义排除；显式撤销后状态已撤销，后续新读取403拒绝。

仍有两个实际阻塞：首次创建辅导员依旧 `duplicate deployment:persona-prefix`（source/compiled Scope模块身份分裂，双入口修复进行中）；K.3阅读器撤销后虽报错却保留旧正文、图片和计数（缓存清理修复进行中）。compiled安装身份门禁通过不等于source CLI或真实用户闭环通过；K.3候选明确不通过，须新K.4验收。

本轮自有3101进程已停止，合成数据保留。真实AI请求仍0次，问题/审批/Stop与完整生命周期未完成；没有正式资料接入、正式注册或推送，本票及13/15均未关闭。

## 最新真实安装结果 · 2026-10-25

3101的准确候选组合（Worktable `0.10.0-rc.3.4`、Kaogong `0.2.0-rc.3.2`）已完成部分实际用户流程：原生菜单没有考公角色模式；合成资料10道题、1份有来源证明资料、1份私有讲义及6个证明文件通过UI预览和显式接入；私有讲义在资料库自己的视图可读；无授权学习实例显示0份资料。同一学习实例的第二课堂视图共享学习目标与已保存总结；未练习时不能完成课堂。

**候选整体未通过**，有两个明确阻塞：首次创建班主任报 `duplicate deployment:persona-prefix`（[13](13-kaogong-role-scope.md)），普通深度应用缺少只读资料授权与撤销UI（[15](15-kaogong-fresh-materials.md)）。修复正分别进行，当前准确旧候选不能继续被视为通过。真实模型请求为0次；教学、问题、审批、Stop、练习评分、完整刷新/重启和停用重装矩阵仍待新候选复验。

本轮自有3101进程已停止，合成数据和回执保留。没有正式资料接入、正式注册或远程推送；本票保持open，不以pack门禁、局部UI或候选安装成功关闭。

## 当前范围覆盖 · 2026-10-25

本节优先于下方保留的历史实施记录。本轮按用户最新决定采用全新部署：使用原生标准 preset，角色人格及 Skills 由考公应用私有管理；不迁移、不删除历史会话、学习记录或成绩，也不把保留旧 preset IDs 作为新部署要求。角色范围与原生执行边界见[13](13-kaogong-role-scope.md)。

原题库、讲义、图片、PDF 与 MinerU 资料保留原址。先只读清点、展示 materials-only 具体预览，经明确确认后才写入新的空资料库；不默认共享私人或来源不明资料。接入及隔离要求见[15](15-kaogong-fresh-materials.md)。历史[09](09-legacy-adoption.md)不构成本轮前置，原票与历史正文保留，历史联合迁移未执行，09未关闭；旧接管计划批准不替代本轮具体资料计划批准。

当前独立验收入口为 3101，目标为准确 Worktable `0.10.0-rc.3.4` / Kaogong `0.2.0-rc.3.2` 归档组合。新包真实安装 UI、原生 AI 与恢复的完整验收仍 pending；下方 3097 开发 link、旧版本及接管准备只证明相应历史检查点。本票未据此关闭。

## 历史要求与检查点（按上述当前范围解释）

按 HU01—HU08 与原 F01—F14，在独立的未经补丁 rc.3 原生实例安装准确新版本归档。3097 开发 link 点测仅为前置，不替代本票。

- [ ] 新版本经规定 pack 入口、精确文件清单、独立安装、客户端工厂/SDK 消费者验证，记录 SHA 与真实加载来源。
- [ ] 工作台创建修改启用、模块/数据/角色、标注生成追改、两实例隔离与共享撤销通过。
- [ ] native Session 创建/恢复、plain/reference/command/quote 草稿、焦点、撤销、原生问题/审批/Stop 真实核对。
- [ ] Notes/Reading 与考公真实教学/练习评分/课堂完成/统计/资料引用连续可用。
- [ ] 热停用卸载重装、浏览器刷新与 Host 重启恢复，终端/路由/持有释放且原生菜单完整。
- [ ] 物理 IME 单列实际人工证据；未提供的范围不宣称通过。真实模型未配置/失败不得写完成。
- [ ] 正式资料接管及正式切换按已审具体预览，不借本票自动改3080或读取凭据用于别处。

## 2026-10-24 开发 link 准备（不是最终包验收）

隔离分支以 `10e1781446f5b5b3e0cbca55dda1ceb3a9700740` 构建 Worktable 与考公，随后同步 `2ae9f24cb8cad4c86a32473e7e546abf2ba59170`。Worktable package/manifest 由 `0.10.0-rc.3.1` 前进到 `0.10.0-rc.3.2`，lock 根与根包原滞留 `0.9.6` 同步为 `.2`；未执行 pack、未冻结 `.2`、未修改冻结 `.1` 资产。此处只变版本元数据，不改功能代码。

官方未补丁 rc.3 CLI 在既有独立 3097 home 注册该工作树的两个 development link；Node25.2.0 从原生 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60` 入口隐藏启动，owned PID29288 真实监听127.0.0.1:3097。启动警告一度显示考公等待服务，root随后真实IAB看见考公及资料库应用目录，不能将瞬时警告直接写成持续失败。未重启/停止其他宿主，未读取3091凭据或复制模型；原有文件写前hash清单保存在私有验收目录。

辅助验证：Worktable实际host/client构建及node语法通过；考公host/client构建、客户端声明、实际原生公开host声明通过。运行依赖独立解析确认 Worktable/考公 `@deepseek-ai/cordis` 均为该原生 `vendor/cordis/lib/index.js` 且 Context 严格同一；考公storage-domain和agent-preset-registry解析至该原生公开lib。构建工具通过本工作树自有junction引用既有依赖，不改目标目录；该运行中工作树暂不清理。

浏览器证据由root继续：本子任务CUA只有Chrome/Edge扩展，隐藏IAB不可用，未擅自换浏览器，也没有创建实例、角色、模型消息。root报告原有两条未发送标注保留、原生模型选择器仍显示“请选择模型”。角色创建前还须通过公开配置设置 `roleCwd` 为隔离 acceptance/project，并在原生UI登记对应工作区；子任务尚未执行这两项。真实课堂、两实例、多视图、资料库及单composer点测留给root记录，不在这里提前勾选。

注意同步integration后未在root活动点测期间覆盖运行bundle：当前3097运行构建来源仍为 `10e1781 + .2元数据`，不能把随后同步的源码当成已加载/已验版本。最终冻结包必须重建并重新独立安装与验收；本票全部复选框仍保持未勾选。

## 当前状态补记（保留以上历史准备记录）

模型连接随后已按明确授权复用，开发link真实模型、提问和Stop已由root验证；早期未配置模型记录仅描述当时检查点。当前3097/3098/3099均已停止，最终pack正在执行，不将曾运行PID或源码同步当作当前最终包已加载。3097具体合成接管计划已获确认但尚未apply；正式旧数据迁移仍需其具体计划确认。最终归档安装、审批、物理IME及本次合成接管结果继续待验，本票保持open。

### Kaogong rc.3.2 候选归档已保存 · 2026-10-25

新归档与[公开来源回执](../../../../plugins/kaogong/releases/deepseek-ai-dsh-tool-kaogong-0.2.0-rc.3.2.receipt.json)已保存仓库：`0.2.0-rc.3.2`，520960 bytes，SHA256 `6f30424b5fa8c643dbc36bd065d11b083276ca10f52906752e7cbce01b663aef`，构建源码 `5fe314ab473d9bf23777af4df94b6b18db45ec38`，依赖 Worktable `0.10.0-rc.3.4`。规定 pack 已执行构建及公开类型、Host153/153、客户端9/9、领域21/21、归档1/1；实际包63文件，解包 Host/客户端工厂检查通过。

3101 已通过官方 CLI 安装该准确候选组合并启动，真实 UI、原生 AI 及恢复验收仍在进行，不能把安装成功或 pack 门禁代替整体验收。未切换正式3080、未执行正式资料接入；旧 Kaogong rc.3.1 与 Worktable rc.3.3 冻结包保持不变。

## Kaogong rc.3.3 候选替代复验 · 2026-10-25

修复后的 K.3 / W.5 精确组合已产新不可变归档：[公开来源回执](../../../../plugins/kaogong/releases/deepseek-ai-dsh-tool-kaogong-0.2.0-rc.3.3.receipt.json)。K.3为521739 bytes、63文件，SHA256 `500f00ffabafbc73b6b98df6b5227881cd2c9bdaed2c3de8411cd62e8f3d1ebf`，源码 `0e09e6c20dd13062a7efb6a5a62813df3375a343`。构建/公开类型、Host153、客户端9、领域21、归档1均通过；新增官方compiled CLI隔离安装门禁在无开发依赖祖先的全新HOME核验真实公共PluginPackages installation Cordis/preset/Scope身份及实际K/W Host导入，全部通过。

独立3101已由官方CLI安装该准确组合并启动，真实浏览器角色创建、模型、授权/撤销与恢复仍在复验。历史K.2失败证据保留，新辅助门禁不能提前取消其两个实际阻塞或关闭13/15/16/10。本票保持open；没有正式资料接入、正式注册或推送，既有归档均保留原字节。

## 双入口与阅读器修复已集成 · 2026-10-25

双入口Scope修复 `41482be` 与撤销后阅读器清理 `824b26f` 已合入 `6cafbe9c1e5d894b0e143c279f208bee42eac3b2`。合并后Host154/154、客户端13/13与官方公开Host类型检查通过；发布清单包含新阅读器测试，未再强制把所有Scope解析到LIB掩盖SOURCE差异。仍需K.4准确新归档及source CLI真实复验，13/15/10不因此关闭。

后续独立3101切换同一未经补丁Native的compiled CLI入口，K.3实际新建班主任成功并完成真实身份回答；任课老师的私有教学Skill已出现工具调用轨迹。该检查点真实模型请求已为2次，工具及课堂完整结果仍待核实，不能写作课堂完成。它是K.3 compiled入口证据，不能替代仍待执行的K.4 source入口验收，也不取消此前K.3 source运行失败记录。正式资料及环境保持不变。

## K.4 准确候选归档与分入口验收 · 2026-10-25

K.4已通过规定完整pack并保存[公开来源回执](../../../../plugins/kaogong/releases/deepseek-ai-dsh-tool-kaogong-0.2.0-rc.3.4.receipt.json)：源码 `ece1144b9543133ba4b101555df5db0478ff15e2`，524312 bytes、64文件，SHA256 `cc1fe69df1f676ee9a52aba877c5ebf5ac46ae2f17ccb132d92a5ed23d24f88d`，精确依赖W.5。构建/公开类型、Host154、客户端13、领域21、归档1及官方CLI无开发依赖祖先安装身份门禁均通过；Host明确包含source/compiled真实子进程和独立Scope副本，客户端包含4项撤销DOM回归。64文件唯一新增项是公开native-role-scope声明，无源码/测试/map入包。

之前K.3在compiled入口实际完成3次模型请求：班主任身份答复、任课老师调用私有教学Skill并取得实际工具结果、普通未绑定Native会话对同Skill返回unknown，支持该入口的私有能力隔离；未将其写作完整课堂完成。该自有compiled进程已停止。独立3101随后经官方CLI安装K.4并启动source入口，K.4真实UI及完整教学/撤销缓存/恢复仍待复验，不用K.3compiled或新辅助门禁替代。13/15/16/10保持开放，正式环境和资料未改，未推送。
