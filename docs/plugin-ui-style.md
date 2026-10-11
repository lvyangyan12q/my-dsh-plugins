# 插件界面样式

考公、工作台、Agent 和 Skills 的自有操作共享 `controlStyles`。新增应用可从 `@deepseek-ai/dsh-personal-workbench/client` 导入该字符串并在自己的视图中注入 `<style>`，外层使用 `kg-study-shell` 或置于工作台 `pwb-workspace` 内。

- 基础操作按钮标记 `data-pwb-button`，主操作再标记 `data-variant="primary"`。不要在原生 DSH 会话控件上添加这些标记。
- 主操作使用暖橙色实心按钮；次要操作使用浅色背景和明确边框；导航用轻量背景，当前项用暖色选中状态。共享规则包含 hover、active、focus-visible 和 disabled 状态。
- 按钮最小高度 36px，字号 13px，圆角 7px。下拉框和筛选输入保持 38px 高度。图标辅助文字表达，创建和刷新等关键动作应包含文字。
- 画布 `#f7f5f0`、表面 `#fdfcf9`、文字 `#2e2b26`、边框 `#d7d0c5`、主要操作 `#a44c32`。状态成功/失败颜色保留语义，不用于装饰按钮。

视觉方向采用暖色中性背景、克制装饰和清楚的操作层级。Claude Code 的界面与状态可见性参考见 [官方界面更新介绍](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously)；上述配色与控件尺寸是本项目的设计选择。
