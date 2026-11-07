# co-dev Speckit能力对照（2026-10-28）

只读检查位置：E:/work/project/co-dev。以下来自当前维护源码，不将插件缓存旧版本或历史报告视为当前实现。本轮没有读外部知识库或执行入库脚本。

| 已检查来源 | 已有能力 | 窗口4如何复用 |
| --- | --- | --- |
| [.claude/skills/spec-retro/SKILL.md](E:/work/project/co-dev/.claude/skills/spec-retro/SKILL.md) | 增量复盘；经验/领域/方案/Skill/Hook/代码观察；结论带依据、范围、状态、行动；无新增不写空报告 | 复盘方法主体；仅展示实际出现的类别，不强制五类占位 |
| [.claude/skills/spec-asset-curation/SKILL.md](E:/work/project/co-dev/.claude/skills/spec-asset-curation/SKILL.md) | 按消费者和用途筛材料，保留原review与定向确认、真实验证边界 | 收集清单和来源保留策略；不引入删除功能 |
| [external-knowledge.md](E:/work/project/co-dev/.claude/skills/spec-retro/references/external-knowledge.md) | raw归档和wiki提炼分离；按目标库规范；项目/版本/feature来源；内容hash去重；部分失败保留状态 | 知识候选、清单预览和写回结果 |
| [session-continuity.md](E:/work/project/co-dev/.claude/skills/spec-retro/references/session-continuity.md) | 按task绑定真实会话，限定JSONL窗口，read后保存摘要再ack；处理截断/变更/缺失 | 复用增量消费语义；DSH格式和Host来源适配尚未验证 |
| [.claude/commands/speckit.retro.md](E:/work/project/co-dev/.claude/commands/speckit.retro.md) | 显式复盘先只读分析，合并精确清单，再执行用户所选归档/提炼/清理；少量材料无需团队 | 借用收集→复盘→候选→选择→写回流程；窗口4不照搬清理功能 |
| [.claude/skills/spec-optimize/SKILL.md](E:/work/project/co-dev/.claude/skills/spec-optimize/SKILL.md) | 用户明确优化时追踪真实问题，最小修改并验证；仅需要比较时做隔离对照，不强制数据集 | 后续消费窗口4资料，本期不调用优化 |
| [AGENTS.md](E:/work/project/co-dev/AGENTS.md) | co-dev维护工具链；业务证据留验证项目；知识不是当前代码/需求的替代 | 不把co-dev当成bug-solver默认资料仓库 |

## 对旧窗口4规格的修正依据

- co-dev AGENTS 的知识根策略写明进程环境先于项目本地env配置；external-knowledge同时承认明确目标与项目政策。旧稿固定项目优先不可泛化。
- 当前external-knowledge要求查目标库实际规范，不预设政策文件名或必须存在同名skill；旧稿固定knowledge-policy.md/knowledge-curation会制造假阻塞。
- session-continuity明确read保存pending token，预览不能直接跑bind/read/ack。只读分析只读已定位的授权窗口。
- 当前方法并不限定复盘只针对approved；它支持日常讨论、bug修复、任务收口及明确历史范围。窗口4能否扩大原approved筛选仍需产品决定。
- 原始代码、测试与会话默认留项目并引用，不意味着必须把所有材料复制到知识库；raw与wiki有不同用途和完成状态。

没有验证：目标项目是否安装这些方法、DSH会话日志兼容、外部知识库实际政策与写权限、真实窗口挂载。以上均不推断为已可用。
