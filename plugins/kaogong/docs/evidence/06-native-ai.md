# 06 私有角色与模型写入边界

2026-10-28，工单closed。真实模型、原生提问/审批/Stop、角色草稿和页面确认结果见[最终验收](07-final-acceptance.md)。以下保留2026-10-27源码阶段证据，不能单独替代真实模型验收。

## 全部模型工具审计

基线 `e864912f6b2b6b3cf2847df7aae186256675c960` 的 businessRegistry 注册24个工具：

| 能力 | 工具 | 处理 |
|---|---|---|
| 已保存错题查询 | `kaogong_list_questions`、`kaogong_analyze_errors`、`kaogong_summarize_weaknesses` | 只读，读取既有记录，不修复投影 |
| 大纲、计划、进度 | `kaogong_taxonomy`、`kaogong_plan_view`、`kaogong_progress_status` | 只读；累计统计来自全部已评分轮次 |
| 原题与资料 | `kaogong_bank_list`、`kaogong_knowledge_read`、`kaogong_knowledge_search` | 只读，来源授权仍由真实 Session 对应档案决定 |
| 课堂与已提交单轮 | `kaogong_lesson_read`、`kaogong_practice_read` | 只读，使用 readCompleted，不调用会修复投影的 read |
| 题目记录 | `kaogong_record_question`、`kaogong_delete_question` | 模型不可用，直接执行也拒绝 |
| 题库写入 | `kaogong_bank_add`、`kaogong_bank_delete`、`kaogong_bank_review` | 模型不可用，保持原题、答案及审核记录 |
| 作答与评分 | `kaogong_practice`、`kaogong_practice_submit` | 模型不可用；学习者页面发放与提交仍可用 |
| 解析与知识库 | `kaogong_pdf_parse`、`kaogong_pdf_collect`、`kaogong_knowledge_add`、`kaogong_knowledge_delete` | 模型不可用，阻止解析任务和知识库的隐含写入 |
| 计划与完成建议 | `kaogong_plan_set`、`kaogong_plan_done` | 03实现已合入：前者只保存未生效草稿，后者只返回建议；两者不接受页面确认权限 |

`KaogongHost.tool` 在创建动态 registry、来源覆盖、PDF job owner 和 knowledge wrapper 之前检查显式能力清单。`active` 使用相同清单决定实际 Native 步骤的工具准入。新工具默认不可用于模型；模型提供的 `confirmed`、档案 ID 或其他参数不产生学习者页面权限。真实 Session、私有作用域、Scope 身份和来源撤销校验保持原样。HTTP 路由继续通过身份准入及 Host 登记 viewId 执行。

## 当前验证

- TDD 红灯：实际 Native 标准 Agent 的步骤激活集包含 `kaogong_record_question`，与页面确认要求冲突。
- 绿灯：全部11个有效写工具在 Native 步骤准入集中缺席；拿到注册描述后以 `confirmed:true` 直接调用同样返回 `LEARNER_PAGE_REQUIRED`。进度、课堂读工具仍可用，普通 Session 读取仍拒绝。
- 完整 Host 33/33、官方 Host 声明类型检查通过，包含手动资料授权/撤销、练习发放、评分、反思、幂等冲突、重启保留和累计统计反例。
- 教学任务既有公开测试继续验证：准备不发送；明确发送后保存 Native admission/flush 回执；响应丢失为 unknown，重复发送与恢复重发拒绝。
- 私有 `kaogong-teach` 和三类 persona 已纠正旧直接入库、交卷或打卡指令，明确页面确认及 Native Stop/空闲不等于完成。

## 合并03与05基础后的验证

同步集成提交 `b5df33cb77a93cba3576c96bed9bd1fee81f0e4a` 后，审计03的两个建议工具并加入显式能力清单。

- TDD红灯：Native步骤准入缺少计划建议；开放仅此两个惰性建议处理器后转绿。
- 真实标准 Native Agent 调用 plan_set，即使携带 `confirmed:true` 和模型指定的其他档案字段，也只得到 `effective:false`；HTTP读取的目标仍为null、任务为空、有效版本不变，仅草稿出现。
- 同一草稿经学习者HTTP明确确认后才产生正式任务；模型随后调用 plan_done 返回 `effective:false`，再读页面的完整计划及任务状态完全不变。
- 连续调用 plan_view、practice_read、lesson_read 不改变有效计划；普通Native Session不能调用建议工具。
- 合并后公开 Host 41/41、Client 18/18、构建后领域回归21/21、发行内容门禁1/1通过。完整构建包含官方Host/Client声明门禁。领域测试首次因尚未构建lib无法导入；构建当前源码后重跑通过，未使用旧lib代替。

## 源码阶段待办的最终结果

当时待办的05复习日程关联及完整手动闭环、真实模型加载私有Skill、上下文读取、提问、审批拒绝/允许一次、Stop、角色草稿切换与普通会话隔离已在07完成。模型实际建议不改变有效任务；页面缺依据时阻止完成，确认计划才生效。真实结果、准确包与限制以[最终验收](07-final-acceptance.md)为准。

2026-10-27审查修复更新：plan_done现持久保存惰性完成建议，绑定taskId/planRevision/taskRevision；页面先读取实际完成依据再独立确认。有效计划版本和任务状态在确认前不变，但待确认建议元数据会增加。模型confirmed不生效，缺总结/反思与过期/外来建议拒绝。见[审查修复](07-review-fixes.md)。05关联已完成；本票真实模型矩阵仍待最终准确包验收，维持open。
