# 班主任单轮/累计核对修复（工单10，未完成实际模型重试）

2026-10-11，基线 c42d022。父层 installed 3089 实际观察：班主任将本轮 10=3对+7错+0未答与累计 20=3对+8错+9跳过混用；在用户明确要求只读核对后仍仅 analyze_errors/list_questions，声称无法按 roundId 拆单轮、可能保存有误，并索要 ID。该回合原生轨迹未显示 Skill read，不能因用户写 `/kaogong-plan` 就称其加载。外部个人 Skill 未修改。

诊断候选为缺原生只读单轮工具、persona 未提供具体读取路径、已运行角色预设状态。公开 Host 注册反馈循环实际 RED 确认第一个缺口：HTTP 有 read/history，原生工具只有发题/提交，没有只读 completed-round 来源；真正 acquired native advisor persona 的公共组装回归也 RED，缺该读取路径。第三项运行中状态留给安装后检查，不将其假定为已修复。

最小修复：新增 `kaogong_practice_read`，复用现有已保存 PracticeRounds 快照和 view/result。指定真实 roundId，或省略 ID 按保存的 score.sequence 读取最近已提交轮，可按科目限定。输出明确 single-round、提交时间、原快照/作答及单轮正确/错误/未答计数。未提交轮拒绝作为完成依据，无匹配明确返回 null。读取走原有命令队列，但不调用 read 的 notebook projection recovery、不写任何业务表；没有新增计划/成绩写权限。

班主任 packaged persona 与现有 kaogong-teach 指令改为先只读该来源，不能先索要未知 roundId、不能用累计错题表替代单轮；未读取前不能诊断“保存有误”。累计另外标来源和分母；Skill 是否已加载按真实 native 轨迹判断。原个人 `/kaogong-plan` 文件与预设绑定未改。

GREEN：真实公开 Host/Tools 注册与持久域夹具产生两轮，旧轮0对1错9未答、最新轮3对7错0未答；公开 cumulative list 为20题3对8错9跳过。新工具无ID返回最新已提交轮、明确ID返回旧轮、忽略后来未提交轮；所有 round/bank/notebook字节结构保持不变。practice-rounds 定向回归14/14、actual preset/scope/Skill registry回归3/3通过，增补累计公共输出断言后对应tool用例再次通过。仓库配置的 check-client-types（映射公开WorkBench declarations）通过，diff check通过；未 build main/full gate、未启动 Host/Chrome/模型或推远程。

安装后验收：父层将新包通过已授权 Kaogong 生命周期加载，核对现有班主任绑定与原 native Session 身份保持，下一原生回合能见 `kaogong_practice_read`。先用同一现有会话显式只读核对最近完成轮及累计；新工具由全局原生 Tool registry 注册，能力无需创建替代 Session。已取得scope的persona是否刷新须实页确认，不能称提示已经热换；需要时显式加载现有 bundled kaogong-teach并核对真实轨迹。若需替换预设，必须经已有 UI 确认并保留旧历史，不能后台强换。实际模型应读取真实round后准确区分10与20，且不写成绩/计划；本文件不证明模型已经正确，工单10保持open。
