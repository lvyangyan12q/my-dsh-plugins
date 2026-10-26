# Standards 增量独立审查

固定范围：`git diff 0ef4597...55b93ce`；提交列表：`git log 0ef4597..55b93ce --oneline`。依据 `plugins/worktable/AGENTS.md`、`GLOSSARY.md` 及 code-review 的 Fowler smell baseline。未修改生产代码。

## Findings

- **[P3，judgement] Possible Duplicated Code：拖拽仍重复维护区域宽度公式。** `plugins/worktable/01_content/src/client/split.tsx:1212` 的 `colW-nativeChatWidth(...)-leftColumnWidth(...)`、1222 的顶行公式，以及1566的 `kind==='pane'?...:kind==='topPane'?...` 重复了209行 `workspaceGeometry` 已拥有的可用区域计算。当前未确认行为偏差；但同一收起/补位规则今后仍需多处同步，与本次建立统一投影的维护目标相抵触。建议 `setPaneW`、`setTopW` 和指针起点直接使用 `workspaceGeometry(...).contentW/topRowW`，左列高度也取共享投影的可用高度。

## Result

明确仓库规则违反：**0**。Smell 判断：**1（P3）**。未把既有巨型 split 文件、已有兼容分支或最终安装尚待执行作为新增问题；未确认新的归属、提示词泄漏、分组、跨平台拼接或冻结资产违规。最终安装及公开交付证据由07另行收口。
