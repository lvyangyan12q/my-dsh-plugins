# 个人学习 · 实验台实施图

父规格：[知间 · 学习实验台](../lab-spec.md)。设计依据：选定原型 B「实验台」。

每票一个垂直切片，完成即可单独演示；`Blocked by` 表示前置票完成才可开始。
全部票 `ready-for-agent`，代码完成不等于真实宿主验收完成。

| 工单 | 前置 |
|---|---|
| [01 rc.1 兼容并启用](01-rc1-compat.md) | 无 |
| [02 课程页实验台骨架](02-lab-shell.md) | 01 |
| [03 课程协议 v1 与参数桥](03-lesson-protocol.md) | 02 |
| [04 预测门控](04-prediction-gate.md) | 03 |
| [05 复述检查与学习证据](05-restate-evidence.md) | 04 |
| [06 /teach 生成适配](06-teach-generation.md) | 03 |
| [07 配置收纳与追问入口](07-config-drawer.md) | 02 |
| [08 参数与位置恢复](08-recovery.md) | 05 |
| [09 安装包完整验收](09-installed-acceptance.md) | 06、07、08 |

前沿（无未完成前置）从 01 开始；01 完成后 02 与 07 可并行。
