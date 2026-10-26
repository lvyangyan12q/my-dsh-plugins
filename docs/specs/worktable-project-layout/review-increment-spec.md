# Spec 审查（增量）

固定基线 `0ef4597ada997131da4d64a66590e5efb14e1cc4`，审查头 `55b93ce`。命令：`git diff 0ef4597...55b93ce`、`git log 0ef4597..55b93ce --oneline`。

## 发现

- **[P2] 可容纳性判定漏算顶行和左列的最小空间。** 规格要求“拖动实际分隔条……遵守最小尺寸和当前视口”。`F:/ai-project/my-dsh-plugins/plugins/worktable/01_content/src/client/split.tsx:188` 仅计算主行和左列的最低总宽，`:224` 的高度回退仅固定使用80/160，遗漏顶行总最小宽、自定义 `topHeight.min` 和左列叠窗总最低高度。通过完整公开 `SplitWorkspace` 实际DOM复现：①宽1200、全高聊天500、两顶窗各min500，仍非窄屏，顶窗各349.5px；②高300、顶行min260，主行仅14px；③高160、两左窗各最低80，实际各66.5px。分别见任务私有 `.scratch/review-top-min.cjs`、`review-top-height.cjs`、`review-left-min.cjs`。应统一计算展开区域最低宽高，在不能容纳时使用既有单窗回退，并使渲染、原生区域和分隔拖拽共用该投影；保留手动几何基准。

## 其余核对

未发现其他可行动的规格偏离或范围扩张。已检查稳定pane/tab提交前守卫、ready后复验与去重、新旧格式读写/备份、收起挂载保活与编号。最终包/真实宿主07尚待执行，未将其未完状态计为代码缺失。

结论：**1项可行动发现（P2）**；需修复后复核。
