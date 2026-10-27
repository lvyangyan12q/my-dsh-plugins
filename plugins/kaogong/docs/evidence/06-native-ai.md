# 06 私有角色与模型写入边界

2026-10-27，工单仍 open。以下为源码边界证据，不能替代准确包中的真实模型验收。

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
| 计划与完成建议 | `kaogong_plan_set`、`kaogong_plan_done` | 等待03合入建议实现后审计并开放；本阶段仍拒绝旧直接写入实现 |

`KaogongHost.tool` 在创建动态 registry、来源覆盖、PDF job owner 和 knowledge wrapper 之前检查显式能力清单。`active` 使用相同清单决定实际 Native 步骤的工具准入。新工具默认不可用于模型；模型提供的 `confirmed`、档案 ID 或其他参数不产生学习者页面权限。真实 Session、私有作用域、Scope 身份和来源撤销校验保持原样。HTTP 路由继续通过身份准入及 Host 登记 viewId 执行。

## 当前验证

- TDD 红灯：实际 Native 标准 Agent 的步骤激活集包含 `kaogong_record_question`，与页面确认要求冲突。
- 绿灯：全部11个有效写工具在 Native 步骤准入集中缺席；拿到注册描述后以 `confirmed:true` 直接调用同样返回 `LEARNER_PAGE_REQUIRED`。进度、课堂读工具仍可用，普通 Session 读取仍拒绝。
- 完整 Host 33/33、官方 Host 声明类型检查通过，包含手动资料授权/撤销、练习发放、评分、反思、幂等冲突、重启保留和累计统计反例。
- 教学任务既有公开测试继续验证：准备不发送；明确发送后保存 Native admission/flush 回执；响应丢失为 unknown，重复发送与恢复重发拒绝。
- 私有 `kaogong-teach` 和三类 persona 已纠正旧直接入库、交卷或打卡指令，明确页面确认及 Native Stop/空闲不等于完成。

## 尚需完成

03/05合入后验证计划建议不生效、页面确认才生效，以及完整手动学习闭环；准确发行包真实模型加载私有 Skill、上下文读取、提问、审批拒绝/允许一次、Stop、角色草稿切换与普通会话隔离。上述项目未以本文件的源码测试替代。
