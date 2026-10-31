# 个人学习插件：交互教材与导航参考

调研日期：2026-10-31。已确认偏好：个人使用；以 /teach 教学，抽象概念用 HTML/动画表达，知识图串联学习。

## 证据边界

阅读了一手课程页面、仓库说明和下述许可文件。浏览器尝试加载 Seeing Theory 与 Transformer Explainer 均超时，未完成实际点击或视觉验收；不将页面可解析等同于交互已验证。AI 课程项目见 [单独报告](ai-course-projects.md)。本轮研究不关闭产品决策。

## Seeing Theory：概念、实验、公式相邻

[概率入门课程](https://seeing-theory.brown.edu/basic-probability/index.html)将随机事件、期望、方差分为三个短实验：抛硬币一次/100次并修改概率，掷骰子并修改各面分布，抽卡并改变牌组。课文把实验与相应数学定义相连。这是人工编写的教材，不是 AI 生成样例。官网提示已归档。

[源码](https://github.com/seeingtheory/Seeing-Theory)。本轮未可靠提取许可证正文，不给代码复用许可结论。

设计启发（建议）：一节课一个问题，一个可操纵模型，一次结果解释。把参数变化与公式、图形同步；补上先预测、后观察的任务，不能仅播放动画。

## Transformer Explainer：全局结构与局部细节联动

[实际课程页面](https://poloclub.github.io/transformer-explainer/)包括输入、Generate、Temperature、Top-k/Top-p 控件，以及 embedding、attention、MLP、输出概率的讲解。[项目说明](https://github.com/poloclub/transformer-explainer)描述在浏览器运行 GPT-2 并观察内部计算；本轮未实际验证模型运行。它是专门设计的交互教材，不是通用课程生成器。[许可文件](https://github.com/poloclub/transformer-explainer/blob/main/LICENSE)为 MIT。

设计启发（建议）：先显示整体过程，再点开局部细节；让同一个学习者输入贯穿全部步骤。对于难概念，用可复用的模型组件承载计算，由 /teach 生成任务和解释。

## roadmap.sh：导航参考，单列为受限公开源码

[项目说明](https://github.com/nilbuild/developer-roadmap)明确节点可点击并阅读相关主题；[AI Engineer 示例](https://roadmap.sh/ai-engineer)提供课程方向入口。源码公开不等于宽松开源：[许可](https://github.com/nilbuild/developer-roadmap/blob/master/license)允许个人使用并限制再发布。因此这里只借鉴导航方式，不作为可直接复用的开源底座。

设计启发（建议）：知识图的首要问题是“下一步学什么、为什么”，节点点击后进入课程。关系图、推荐顺序、个人掌握记录分别建模，不能把有关联自动解释为有先修依赖。

## 与本地 /teach 的衔接

已读 `C:/Users/pc-zzy/.codex/skills/teach/SKILL.md`：教学工作区已有 MISSION.md、RESOURCES.md、lessons/*.html、reference/*.html、learning-records/*.md、assets/。技能规定短小单目标课程、课程互链、共享组件、即时反馈和长期记忆练习；尚未定义正式知识图数据结构。

建议的首版体验：学习目标 → 当前概念及先修节点 → HTML 实验课程 → 追问/解释/练习 → 保存证据 → 推荐下一步。课程、知识概念、掌握证据应独立关联，避免一次浏览直接标记已掌握。这些是研究建议，尚未作为用户已确认的产品规格。
