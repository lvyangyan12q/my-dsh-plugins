---
id: harness-upgrade-kaogong-research
title: 核实考公旧接入、数据及角色会话的迁移接缝
parent: harness-upgrade-map
labels: [wayfinder:research]
status: closed
assignee: null
blocked_by: []
context_branch: research/kaogong-worktable-migration-20261024
---

## Question

当前考公对 personal-workbench 和旧 Harness 的依赖分别落在哪里？题库/资料、进度、错题、练习轮次、课堂/计划、角色绑定和原生会话各由谁持有，哪些目前是全局/default 作用域？派生 Worktable SDK 已能承接哪些职责，哪些还需新增接口或应用侧实现？

只读核实代码与脱敏的路径配置，给出共享只读资料与实例私有学习状态的候选划分、旧记录/绑定接管的风险和迁移前核验项。不得读取或输出凭据、复制私有题库到报告、改答案、迁移正式数据、创建 Session 或改变资料链接。

## Resolution

只读源码与脱敏路径关系研究完成，报告已审阅并发布到独立 research 分支：[考公接入派生 Worktable 的迁移接缝研究](https://github.com/lvyangyan12q/my-dsh-plugins/blob/fc2614973552ad5db6178d03f791f4e27cf739b5/docs/wayfinder/harness-upgrade/research/kaogong-worktable-migration.md)。引用均为公开固定提交源码，没有发布本机私有路径配置值；没有合并研究分支。

现有六个业务领域没有实例分区，Client/课堂限制 default；knowledge 含个人笔记。SDK 已提供实例、资源授权和应用私有能力，但未公开完整旧绑定接管/历史导入及课堂原生嵌入合同。资料只读共享、私有学习状态、旧教师身份与 cwd 保留需要联合设计，不能仅改菜单或服务名称。

“一个历史学习实例 + 专用资料库实例”是研究建议，未被用户批准；实际旧数据和会话未读取，未运行迁移或模型验收。归属及接管方式转入后续用户决策，课堂原生交互需补充原型验证。
