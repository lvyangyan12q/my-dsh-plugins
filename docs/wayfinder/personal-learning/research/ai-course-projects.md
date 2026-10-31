# AI 生成交互课程：一手项目调研

调研日期：2026-10-31。用途：个人自学插件的设计参考；本报告没有决定实现方案。

## 证据范围

已阅读官方仓库 README、官方网站和学习功能文档。GitHub connector 不可用，改用 web 读取官方页面。OpenMAIC 在线演示抓取超时，浏览器工具因已有 profile 占用未能打开；因此**没有实际操作生成课堂，也没有获得可以逐题核验的生成课程完整样本**。下面明确区分官方功能描述、示例输入与研究者建议，不把 README 宣称写成实测结果。主线另行调查可直接阅读的交互课程。

## DeepTutor

- 官方来源：[仓库](https://github.com/HKUDS/DeepTutor)、[产品网站](https://deeptutor.info/)、[Learning](https://docs.deeptutor.info/explore/learning/)、[Books](https://docs.deeptutor.info/explore/book/)、[Mastery Path](https://docs.deeptutor.info/explore/mastery-path/)。仓库当前标识 Apache-2.0。
- 官方把 Books、Mastery Path、Practice、Reading 分开：分别保存生成章节、知识点及掌握证据、回答与复习日期、来源相关对话与笔记。学习活动归当前工作区，支持继续上次活动。[Learning](https://docs.deeptutor.info/explore/learning/)
- Book 先提出章节计划，再生成可编辑内容块，块类型包含文字、测验、闪卡、交互 HTML、动画、概念图；每章有 Page Chat，可局部重写。上述是 README 描述，本轮未实际生成验证。[仓库 Book 部分](https://github.com/HKUDS/DeepTutor#-explore-deeptutor)
- 可读的官方学习场景是“概率考试”：先导入讲义 PDF、讨论困难证明，再建立 Mastery Path，将简短解释存入 Favorites，与自己的解题例子写入笔记，次日练习。它是产品使用示例，**不是生成出来的一套概率课程样本**。[Learning 场景](https://docs.deeptutor.info/explore/learning/#turn-a-chapter-into-lasting-knowledge)
- 设计推论：值得借鉴“课程内容”和“个人理解证据”分别保存，以及绑定当前章节的追问。不能把知识库检索图直接当作先修学习图。

## OpenMAIC

- 官方来源：[仓库](https://github.com/THU-MAIC/OpenMAIC)、[在线演示](https://open.maic.chat/)。当前仓库标识 MIT；README 历史记载 2026-06-28 改为 MIT，因此旧版本复用仍应按所选版本 LICENSE 核对。
- 官方描述的生成过程是“大纲 → 场景”，场景包括讲解、测验、HTML 实验、项目学习；交互类型包含 3D、模拟、小游戏、思维导图、在线编程。教师可操作界面引导注意。它提供很贴近需求的结构，但本轮未验证生成质量或移动端行为。[README Features](https://github.com/THU-MAIC/OpenMAIC#-features)
- 官方列出的输入示例包括“30 分钟从零学 Python”“学习阿瓦隆桌游规则”“讲解 DeepSeek 论文”；这些是示例需求，不是可审查的生成结果，不能据此判断课程深度。[Use Cases](https://github.com/THU-MAIC/OpenMAIC#-use-cases)
- 设计推论：适合借鉴“一个课程由不同学习场景组成”，允许某页是模拟实验、某页是检验理解的题。个人版可以先保留一位导师，不必把多位 AI 同学同时对话作为核心。

## 对个人插件的启示与下一轮验证

建议比较两条互补主线：DeepTutor 的长期个人学习记录，OpenMAIC 的场景式课件。/teach 可负责教学节奏，插件负责知识节点、课程场景、学习记录之间的关联。这是建议，尚非已确认决策。

下一轮有价值的实测应统一输入一个小主题，例如“条件概率为什么不同于联合概率”，检查：生成的大纲是否合理；滑块是否真的改变条件与图形；解释是否与数值一致；错误答案有没有针对性反馈；退出后是否恢复；知识节点能否说明先修原因。在拿到实际生成样本前，不能声称以上任一项目已经完整满足需求。
