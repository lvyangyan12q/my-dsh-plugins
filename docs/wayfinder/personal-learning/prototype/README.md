# 个人学习空间 · 一次性 UI 原型

问题：参考 OpenDesign 的中性工作区风格，个人学习更适合工作室、知识图还是专注课堂布局？等待用户体验反馈，尚无胜出方案。

运行：`node docs/wayfinder/personal-learning/prototype/serve.mjs`，访问 http://127.0.0.1:4381/?variant=A 。也可直接打开 index.html。

A：侧栏＋实验课程＋随堂导师。B：知识图为主，右侧概念详情。C：专注阅读，实验与理解检查并排。底部按钮或左右方向键切换，通过 variant 参数保留布局；输入框使用方向键时不切换。

样式参考：[OpenDesign](https://github.com/nexu-io/open-design) 的 [tokens.css](https://raw.githubusercontent.com/nexu-io/open-design/main/apps/web/src/styles/tokens.css)：白底、浅灰面板、细边框、深灰文字和主按钮、少量绿色提示。使用同一视觉语言探索不同信息结构，不复制品牌资产或代码。

独立学习插件暂无实际页面；原型放在本轮学习设计资料旁，不改现有考公/工作台路由，不纳入生产构建。全部数据为内存示例，导师是预置回复，只有条件概率是可操作样课，未接入 /teach 执行或学习记录存储。滑块改变交集，筛选按钮改变概率分母，题目给出反馈。

后续：用户选择或组合布局后再记录决策、存档原型到独立临时分支并实现正式界面。
