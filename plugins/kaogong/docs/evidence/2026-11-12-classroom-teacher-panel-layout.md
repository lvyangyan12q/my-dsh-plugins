# 2026-11-12 课堂布局：答疑区受控高度，学习内容回到首屏

对应规格「课堂布局」（`docs/task-centered-learning-spec.md:75`）：桌面以讲义/练习为主区，老师答疑为辅区。
本票只改 `src/sdk-classroom.tsx`（课堂页外壳与 `sdkLearningStyles`），未触碰原生会话与输入框。

## 复现与验证环境

- 工作树 `D:\programming\workspace\my-dsh-wt\t08`，分支 `ticket-08-acceptance`，基线 `d1dedd0`。
- 真实浏览器：Chrome DevTools MCP，现有 `http://127.0.0.1:3080`，视口 1920×889。
- 入口：点「考公学习」→「课堂」，进入「今日 → 继续最近任务：逻辑填空」的课堂（课堂 `2dad76dc-06d5-4865-89ff-5f818f47fee4`）。
- 构建：`node <tsdown 路径>/run.mjs -c tsdown.config.ts`（client），产物 `lib/client.js`；把新 bundle 拷到已安装目录
  `C:\Users\pc-zzy\.dsh\profiles\web\node_modules\@deepseek-ai\dsh-tool-kaogong\lib\client.js`（原文件备份为同目录 `client.js.bak-t08b`），刷新页面实测。
- 尺寸全部来自页面内 `getBoundingClientRect()` / `scrollWidth` / `clientWidth`，单位 px，保留一位小数。

## 修复前（基线 bundle）

| 量 | 数值 |
| --- | --- |
| 内容区 `.kg-sdk-content` | top 142，height 747，width 1640 |
| 「老师答疑」区 `.kg-teacher-session` | top 170，bottom 679，**height 509.1**，width 1507（整行，压在内容上方） |
| 其中内嵌会话 `.kg-teacher-session-embed` | height 462.3（原生 `min(52vh,520px)`） |
| 原生输入框 `[data-composer-seat]` | top 546，bottom 678（悬在闲聊区中间） |
| 「课堂与课后任务」区 | top 721，heading top 744.5 |
| 首屏能看到的学习内容 | 只剩区标题与页签边缘，正文（「本课暂无讲义。」）在首屏之下 |

截图：`docs/evidence/2026-11-12-classroom-teacher-panel-before.png`

## 修复后（1920×889）

| 量 | 数值 |
| --- | --- |
| `.kg-classroom-split` 列宽 | `978.6px 512.4px`（主区在左，答疑在右） |
| 「老师答疑」区 | top 170，bottom 580.9，**height 410.9**（受控在 360–420），width 512.4 |
| 其中会话体 `.kg-teacher-session-body` / embed | height 350.1，内部滚动 |
| 原生输入框 `[data-composer-seat]` | top 447.9，bottom 579.9（height 132，固定在面板内底部） |
| 学习内容 `[aria-label="课堂与课后任务"]` | top 188 |
| 「课堂与课后任务」h2 | top 211.4，bottom 238.6（**首屏可见**） |
| 「讲义 / 当堂检测」页签 | top 257.1，bottom 297.2（首屏可见） |
| 「本课暂无讲义。」 | top 320.2（首屏可见） |
| 页面横向溢出 | `documentElement.scrollWidth - clientWidth = 0`，面板/内容区同样为 0，越界元素 0 个 |
| 消息输入框数量 | 1（`[data-composer-seat]` 1 个，`[data-composer-seat] textarea/[contenteditable]` 1 个） |

截图：`docs/evidence/2026-11-12-classroom-teacher-panel-after.png`

## 交互与边界实测

- **收起答疑**：点「收起答疑」后 `[data-teacher-collapsed=true]`，面板只剩标题栏 **height 60.8**（`.kg-teacher-session-body` 为 `display:none`），主区从 978.6 恢复到 1507 全宽；按钮文案变「展开答疑」，`aria-expanded=false`；无横向溢出。展开后回到 410.9，输入框同一位置。
- **长对话不顶走输入框**：在原生 `[data-conversation-scroll]` 内插入 1200px 高的临时块（仅在页面内注入，不改代码），滚动区 client 350 / scroll 1332，滚到底 `scrollTop=982`；输入框位置 447.8–579.8、面板高度 410.9 均不变，学习内容位移 0。
- **窄屏（1000×800，容器 944 < 1100）**：单列 844.6，学习内容在上（h2 top 211.4），答疑区在下方（top 1284.6，height 378）；页面/内容区/面板横向溢出均为 0；输入框仍只有 1 个。
  截图：`docs/evidence/2026-11-12-classroom-teacher-panel-narrow.png`
- **并排最窄档（1400×889，容器 1120）**：列宽 `627px 360px`；答疑列 360 宽时原生输入框 `scrollWidth - clientWidth = 0`，发送按钮右边 1307 < 面板右边 1339（未被裁掉），输入框因换行长到 182px，面板高度仍 410.9。

## 未覆盖 / 已知边界

- 该窗口只有新会话，没有真实的长消息流；「长对话」用上述滚动区注入块验证布局机制，不等于真实多轮对话内容验收。
- 页面加载即存在两条与本改动无关的控制台错误（`useAnchoredPosition is not a function`，`conversation.composer.dock` 插槽），未打开「考公学习」时也会出现，属该 Web profile 既有问题，本票未处理。
- 收起状态是这次课堂访问内的本地状态；离开「课堂」再回来默认展开。
- `scripts/build.mjs` 因物理工具守卫失败，按票面要求改用 tsdown 直接构建，未改守卫、未装依赖。
