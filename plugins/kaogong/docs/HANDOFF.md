# 执行交接：考公目录收拢与独立学习闭环

## 用户要求
在 D:/programming/workspace/my-dsh/plugins/kaogong 单独创建执行会话，后续基于该目录开发。将对应 spec/ticket、资料和题目归位；其他考公内容有依据地归档或删除。当前已退出规划模式，用户明确要求进行交接；本任务应直接执行，不再重复规划或仅承诺能力。

## 已确认决策
1. 考公完全独立于工作台运行；本轮先交独立插件，不继续把工作台作为必需后台。工作台快捷入口后续再做，不作为本轮前置。
2. 每日模块数、科目权重、考试日期构成计划；补全程日程、调整、打卡、错题复习，不做小时级排程。
3. 学习采用完整 DSH 原生对话 + 原生右侧学习面板，不再复制聊天输入框或修改原生布局源码。
4. 首版不实现系统内限时整卷模考；外部模考手动记录、单列成绩，不假称系统判分。
5. 保留当前新实例的课堂、成绩、草稿、资料关系和老师绑定。旧全局计划/错题/原生会话继续原址保存，不自动迁移。
6. AI计划和日程调整先预览，用户确认才写入；成绩和任务完成依据真实记录。
7. 原PDF、题库JSON、图片、MinerU成果仅本地保存并备份，不提交远程。

## 现场与保护
- Git仓库：D:/programming/workspace/my-dsh；远程 https://github.com/lvyangyan12q/my-dsh-plugins。
- 交接前代码基线：6eb6abf0bca2f092eb41cd6c5d942f4fa5d6f3dd，原分支 codex/kaogong-rc3-completion。新实施使用 codex/kaogong-standalone-closed-loop；先核对现场，保留用户改动。
- Native：D:/programming/workspace/deepseek-harness，官方0.2.1-rc.3，已核对提交22ddee3792402c3e70ec5f86a63c3e3e895a2f60；仅作公开接口参考和既有运行环境。
- 正式home：C:/Users/pc-zzy/.dsh，web profile 已注册W.7/K.7。新任务应先核对当前进程和用户在用状态，不能把此前已停机当作现在停机。
- D:/programming/workspace/kaogong 是 junction，真实目标为 D:/programming/workspace/my-dsh/materials/kaogong；不是两份独立资料。
- 当前老师原生工作目录为 D:/programming/workspace/my-dsh/workspaces/kaogong，已经公开Registry登记。Codex开发目录与老师工作目录是两件事；不改既有Session的cwd。
- 根仓库已有 docs/full-scope-audit.md、lefthook.yml 及 docs/evidence/2026-10-10 的原生标题栏JSON/5张截图等用户未提交文件，保持原样，不擅自发布。旧未跟踪K.1发行包也先保留归档核对。
- 前序清理曾因Git跟随Windows junction误触3个Native跟踪文件及2个编译库，已经精确恢复、官方重建且167回归通过。必须遵守AGENTS的零链接清理规则，不能复发。
- 已冻结W/K准确包及回退包不覆盖、不改字节。当前 installed rc.3.7 不是独立版，不应仅换版本或界面宣称完成。

## 现有实现及真实缺口
计划生成/打卡/进度、练习快照/判分、错题分析、课堂、资料证明大部分仍在。当前默认课堂，计划/进度/错题分散，缺全程日程和独立错题复习流程；未配置时仍可能显示默认2027-03-01倒计时；部分统计来自按题目ID的notebook而非轮次，重复练习需纠正统计口径。
Host/client/角色/资料/任务直接依赖 worktable*，旧独立Dashboard为冻结提示，故需要真正独立化，不能只新增入口。

## 历史证据
根 docs/evidence/2026-10-25/rc3-fresh-installed-current.json、rc3-cleanup-recovery.json，以及 docs/wayfinder/harness-upgrade/implementation/07/08/13/15/17/19/20 等保存已验范围。混合/共享文件不整体迁走，按工单00分类。
私有完整检查点在 C:/Users/pc-zzy/Documents/ChatGPT/deepseek-harness/.local/kaogong-completion-20261025/CHECKPOINT.md。仅在追溯事实时读取；不要将私有日志、模型配置或整home提交仓库。

## 执行顺序
先完成工单00的文档/资料盘点、归位、路径验证及归档，再按工单依赖实现独立闭环。保存每个阶段的具体变更与真实证据。迁移有已接入绝对路径证明时，先保留原址，完成位置映射与验证后再清旧副本。独有数据或来源不明内容归档，不因名称像缓存就删除。
