# 设计说明：论文中英文阅读页

本文档记录 `dsh-paper-reader` 的页面结构、交互规则、数据契约与接入方式。实现位于 `src/client/index.jsx`（页面）、`src/index.js`（宿主路由）与 `src/client/styles.css`。

## 1. 目标与边界

**目标读者**：每天需要快速扫一遍 X / Claude Blog 上的重要论文与文章，并希望「先看中文、需要时对照原文」的中文读者。

**页面职责**：

- 把 agent 每日抓取的结果按天组织成可扫描的列表；
- 点击条目即可在中英对照 / 仅中文 / English 之间切换阅读；
- 阅读状态本地保存，刷新不丢。

**不属于本插件**：

- 抓取 X / Claude、翻译、打分、去重（由外部 agent 完成后写入 `digest.json`）；
- 账号、云端同步、分享；
- 打开独立网站或 iframe。页面是 DSH 主面板里的原生 React 视图。

## 2. 信息架构

```
pr-root
├─ pr-top                 品牌 · 每日抓取状态 · 侧栏/大纲/刷新
└─ pr-workspace
   ├─ pr-sidebar          搜索 · 方向筛选 · 按天分组列表 · 数据来源
   ├─ pr-reader           模式切换 · 进度 · 论文头 · 正文 · 读完操作
   └─ pr-outline          可选大纲（默认关闭）
```

### 2.1 左栏（列表）

| 元素 | 规则 |
|---|---|
| 分组 | 按 `days[].date` 分组，新日期在前；相对最新一天显示「今天 / 昨天 / 前天」，其余显示月日 |
| 折叠 | 点击日期标题折叠/展开；状态持久化；搜索或筛选时临时强制展开，不破坏已保存的折叠状态 |
| 条目 | 中文标题为主、英文标题为辅；来源徽标、收集时间、方向、阅读时长、会议/来源、未读点、收藏星、翻译中标记 |
| 搜索 | 输入即过滤；匹配标题（中/英）、摘要、作者、机构、标签；`/` 聚焦，`Esc` 清空 |
| 方向筛选 | 单选标签，显示当前查询与来源下的计数；与搜索、来源、收藏叠加；「全部」恢复 |
| 来源筛选 | 单选标签（全部来源 / arXiv / Hugging Face / Anthropic / DeepSeek / Kimi / OpenAI），只列当天有条目的来源；与搜索、方向、收藏叠加；计数随其他筛选变化；选择持久化 |
| 收藏筛选 | 与方向、来源独立叠加，只显示已收藏条目 |
| 空结果 | 显示「没有匹配的论文」与「清除搜索与筛选」 |
| 顺序 | 组内按 `collectedAt` 倒序（agent 写入时排好序） |

**为什么列表不做无限滚动**：每日条目通常 5–20 条，直接渲染更简单、键盘可达。若单日超过 200 条，建议改为虚拟列表或分页（页面结构不变）。

### 2.2 右栏（阅读）

**三种模式**

| 模式 | 内容 | 用途 |
|---|---|---|
| 中英对照 | 左右两列按段落行对齐；公式/图/代码整行跨栏 | 精读、核对译法 |
| 仅中文 | 单列 760px，中文文本；标题区隐藏英文副标题 | 快速理解 |
| English | 单列 760px，英文衬线排版；标题区隐藏中文标题 | 读原文、引用 |

> 语义（2026-11-04 决定，已实现）：对照固定「原文 \| 译文」，列的先后由条目的 `sourceLanguage` 决定——英文来源左英文右中文，中文来源左中文右英文；「仅中文 / English」是**目标语言**视图，中文来源的 English 模式读的是英文译文。数据以 `sourceLanguage` + `original`/`translation` 表达（见第 4 节）；v1 的 `en`/`zh` 在加载时归一化，旧文件无需迁移。

**对照模式为什么按行对齐，而不是双栏独立滚动**：

- 每一行就是一个段落对，滚动天然同步，不需要监听两个滚动容器；
- 读者能直接看出「这段对应哪段」，长段落也不会错位；
- 页面容器变窄时同一行自动堆叠为「原文在上、中文在下」，语义不变。

**全宽块**：公式、图、代码是语言中性内容，任何模式下都只渲染一份，在对照模式中占满整行；它们的说明文字与图注仍按 `original`/`translation` 成对，对照模式两行、单语模式取目标语言并标注回退。

**模式切换保持位置**：切换前记录当前可见段落序号，重渲染后把该段落滚回视口顶部附近，避免「一切换就回到顶部」。

**标题区**：来源、方向、收集时间、节选标记、中英标题、作者/机构/会议/原文链接、导读（agent 生成的中文摘要）、翻译进度提示。English 模式隐藏中文标题与导读；仅中文模式隐藏英文副标题。

**大纲**：默认关闭；标题块（`type: "heading"`）生成大纲，点击跳转，滚动时高亮当前小节。窄容器下改为覆盖式面板。

**进度与读完**：顶部 2px 进度条按滚动比例显示；正文末尾提供「下一篇（J）」。

### 2.3 键盘与可达性

- `/` 搜索，`Esc` 清空/关闭抽屉/失焦
- `J` / `K` 下/上一篇，`B` 收藏，`1` / `2` / `3` 切换模式，`Ctrl/⌘ + B` 收起/展开列表
- 列表项 `role="option"` + `aria-selected`，日期标题 `aria-expanded`，模式切换 `role="tab"` + `aria-selected`
- 焦点环统一使用 2px 强调色；所有图标按钮有 `aria-label` / `title`
- 减少动画：仅使用短过渡（≤180ms），无自动播放动画

### 2.4 视觉

- **跟随 DSH 主题**：背景、面板、边框、三级文字全部取 `--dsw-alias-*` 变量；强调色取 `--dsw-static-deepseek-500`；不提供独立主题开关。
- **阅读排版**：正文英文用衬线（Iowan Old Style / Palatino / Georgia），中文用宋体栈（Songti SC / SimSun 等），行高 1.82–1.95；UI 用宿主字体，代码用宿主等宽字体。
- **信息层级**：列表只用两级字号（标题 13px、英文副标题 11px）；阅读区标题 22–28px，正文 16–16.5px。方向色只用于小标签，不铺大面积色块。

## 3. 状态与边界

| 状态 | 页面表现 |
|---|---|
| 加载中 | 居中 spinner +「正在读取每日论文…」 |
| 读取失败 | 标题、错误详情、数据路径提示、重试按钮 |
| 文件缺失 | 使用内置示例，顶部「示例数据」徽标 + 阅读区说明 |
| 文件损坏 | 422 错误页（不静默回退示例） |
| 搜索无结果 | 列表空状态 + 清除筛选 |
| 翻译中 | 条目「翻译中」标记；对照模式缺失段显示骨架屏；文首显示 `done/total` 与重试提示 |
| 翻译缺失 | 单语模式回退原文并标注「未翻译，显示原文」；对照模式译文列显示骨架屏或回退 |
| 标题缺译文 | 标题回退另一语言并标注「未翻译」 |
| 中文原文 | 条目与阅读区显示「中文原文」标记；对照列顺序为中文 \| English |
| 无标题 | 模式切换、大纲、收藏等按钮禁用或显示「未选择论文」 |
| 窄容器（≤820px） | 对照行堆叠，单语正文自适应宽度 |
| 窄窗口（≤900px） | 左栏变为抽屉 + 遮罩，阅读区占满 |
| 打印 | 隐藏列表、顶栏、大纲，正文完整输出 |

## 4. 数据契约（v2）

> 原文语言由 `sourceLanguage` 声明，文本用 `original` / `translation` 成对表达，阅读页不再假定英文在前。宿主校验 v2：条目缺 `sourceLanguage` 或可翻译字段缺成对成员即 422。v1（`en`/`zh`、`titleZh`/`titleEn`）仍可读，页面加载时归一化，用户无需先迁移文件。

宿主路由 `GET /api/paper-reader/digest` 返回：

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-11-03T09:00:00+08:00",
  "demo": false,
  "directions": [{ "id": "agent", "label": "Agent", "labelEn": "Agents" }],
  "sources": [{ "id": "deepseek", "label": "DeepSeek", "short": "D" }],
  "days": [
    {
      "date": "2026-11-03",
      "items": [
        {
          "id": "deepseek-v3-2024",
          "sourceId": "deepseek",
          "sourceLanguage": "zh",
          "title": {
            "original": "DeepSeek-V3 技术报告：更高效的混合专家模型",
            "translation": "DeepSeek-V3 Technical Report: A More Efficient Mixture-of-Experts Model"
          },
          "summary": { "original": "…", "translation": "…" },
          "authors": ["DeepSeek-AI"],
          "org": "DeepSeek",
          "venue": "DeepSeek Technical Report",
          "publishedAt": "2024-12-27T00:00:00.000Z",
          "collectedAt": "2026-11-03T08:48:00+08:00",
          "direction": "architecture",
          "tags": ["混合专家", "MoE"],
          "readingMinutes": 16,
          "excerpt": true,
          "url": "https://github.com/deepseek-ai/DeepSeek-V3",
          "translationState": "partial",
          "blocks": [
            { "type": "heading", "level": 1, "original": "摘要", "translation": "Abstract" },
            { "type": "paragraph", "original": "…", "translation": null, "translationState": "pending" },
            {
              "type": "equation",
              "display": "h_t = o_t + sum_{i=1}^{N_s} g_{i,t} FFN_i(u_t)",
              "label": "(1)",
              "note": { "original": "…", "translation": "…" }
            },
            {
              "type": "figure",
              "diagram": { "title": "训练流程", "steps": ["预训练", "微调"] },
              "caption": { "original": "…", "translation": "…" }
            }
          ]
        }
      ]
    }
  ]
}
```

### 字段规则

| 字段 | 必填 | 说明 |
|---|---|---|
| `schemaVersion` | 是（v2） | 当前为 `2`；缺失或 `< 2` 按 v1 宽松校验 |
| `generatedAt` | 建议 | agent 完成时间，ISO 8601 |
| `days[].date` | 是 | `YYYY-MM-DD`，用于分组与「今天/昨天」 |
| `days[].items[].id` | 是 | 全局唯一，用于阅读状态、收藏与滚动锚点 |
| `days[].items[].sourceLanguage` | 是（v2） | `en` 或 `zh`：条目原文语言 |
| `title` | 是（v2） | `{ original, translation }`；标题区与列表双语言展示 |
| `summary` | 建议 | `{ original, translation }`；`original` 可为 `null`（agent 生成的导读） |
| `sourceId` | 建议 | 对应 `sources[].id`；唯一来源键，写入不再产生 `source` |
| `direction` | 建议 | 对应 `directions[].id`；列表方向与来源筛选依赖它 |
| `publishedAt` | 建议 | ISO 8601 发布时间；日期型来源写作当天 `T00:00:00.000Z`。`published` 仅为旧文件读取别名 |
| `collectedAt` | 建议 | 列表时间与排序依据 |
| `readingMinutes` | 建议 | 预计阅读时长 |
| `authors` / `venue` | 建议 | 作者与会议/栏目，列表与标题区展示 |
| `excerptReason` | 条件 | 节选原因 `{ code, message?, detail? }`，页面据此解释代理降级 |
| `translationState` | 建议 | `complete` / `partial` / `pending`；非 `complete` 时显示进度与提示 |
| `blocks[]` | 是 | 段落级内容，见下表 |

### 内容块

| `type` | 字段 | 渲染 |
|---|---|---|
| `heading` | `level`、`original`、`translation` | 对照模式按原文→译文各一列；单语模式只显示目标语言 |
| `paragraph` | `original`、`translation`；可选 `translationState` | 对照模式一行两列；缺译文显示骨架屏或原文回退 |
| `equation` | `display`、`detail`、`label`、`note: { original, translation }` | 语言中性，任何模式只渲染一份；`^{...}` / `_{...}` 渲染为上/下标；说明文字成对 |
| `figure` | `diagram.steps[]` / `image`，`caption: { original, translation }` | 语言中性，只渲染一份；图注成对 |
| `code` | `code`、可选 `language` | 语言中性，只渲染一份 |

段落必须成对提供 `original` 与 `translation` 两个键；未翻译时写 `"translation": null`（可加 `"translationState": "pending"`），不要省略键。**不要**把多段合并成一个 `paragraph`，否则对照行会错位。公式与代码保持原文，不要翻译内部标识符。

### 校验

宿主在返回用户文件前运行 `src/shared/schema.js` 的 `validateDigest`：

- v2 条目必须有合法的 `sourceLanguage`；`title` 必须有非空 `original` 与 `translation` 键。
- `heading` / `paragraph` 必须有非空 `original`，且 `translation` 键存在（字符串或 `null`）。
- `equation.note`、`figure.caption` 出现时必须是成对对象；`figure` 至少要有一个 `diagram` / `image` / `caption`。
- 缺字段返回 422 与第一条具体原因；`translation: null` 是合法状态，不是错误。

### agent 写入约定

- 写到 `$DSH_HOME/paper-reader/digest.json`；先写临时文件再原子替换。
- 单文件上限 8 MiB（宿主路由校验）。
- 一天最多保留最近 N 天（建议 14 天），避免文件无限增长。
- 翻译失败保留 `"translation": null`（必要时 `"translationState": "pending"`），不要删除段落；下次抓取补齐。
- 中文来源条目同样要写英文译文；`sourceLanguage: "zh"` 时 `original` 是中文。
- 字段只写 v2 拼写：`sourceId`（不写 `source`）、`publishedAt`（不写 `published`）；旧文件里的别名在读取时归一化。
- 去重键：canonical URL 或 `arxiv id`；标题指纹兜底。
- 条目 `id` 一经发布不要变化，否则已读/收藏状态会丢失。
## 5. DSH 接入

### 5.1 包与组合

```
dsh.plugin.json      entry.name = dsh-paper-reader, client.platform = web
package.json         dsh.bundle.patch = cordis.patch.yml, dsh.client.platform = web
cordis.patch.yml     insert 一行 dsh-paper-reader
lib/index.js         宿主 Cordis 插件（webServer 路由）
lib/client.js        客户端 bundle（window.__ModuleLoader__.load 握手）
```

`package.json` 的 `engines.dsh` 固定为已验证的 `0.2.2-alpha.2`。升级 DSH 时按新客户端契约复验，再放宽版本。

### 5.2 客户端注册

```js
export const inject = ['slots']

export function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: 'paper-reader', order: 20, label: '论文阅读',
  }, PaperReaderPanelIcon))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: 'paper-reader',
  }, PaperReaderPage))
}
```

侧栏 `sidebar.panellist` 的 `id` 与主面板 `main` 的 `key` 相同，点击侧栏入口即把主面板切到本页（与 DSH 内置的 Plugins / Tasks 面板同一机制）。`react`、`react/jsx-runtime` 由宿主平台模块提供，bundle 保持 external。

### 5.3 宿主路由

| 路由 | 方法 | 行为 |
|---|---|---|
| `/api/paper-reader/digest` | GET / HEAD | 读取用户 digest；缺失时返回内置示例并标 `demo: true`；损坏返回 422；超过 8 MiB 返回 413 |
| `/api/paper-reader/health` | GET | `{ ok, plugin }` |

`connection.admit(req)` 存在时执行浏览器会话校验；拒绝则透传其状态码。路由只读，不写入、不创建目录。DSH home 优先取 `profileContext.dir` 的上两级，其次 `DSH_HOME`，最后 `~/.dsh`。

### 5.4 状态存放

- 阅读偏好、已读、收藏、折叠状态：浏览器 `localStorage['dsh-paper-reader:v1']`。
- 数据文件：`$DSH_HOME/paper-reader/digest.json`（agent 所有，插件只读）。
- 不写 DSH 会话记录、不触发模型调用。

## 6. 验收清单

- [x] 左栏按天分组、可折叠、折叠状态持久化
- [x] 点击条目切换右侧论文，未读点消失并计入已读
- [x] 搜索匹配标题/作者/标签，`Esc` 清空
- [x] 方向筛选与搜索、收藏叠加，标签显示计数
- [x] 三种模式渲染正确；仅中文不渲染英文列，English 不渲染中文列
- [x] 对照模式按段落行对齐；窄容器堆叠
- [x] 公式/图/代码跨栏，不重复
- [x] 切模式保持阅读位置（段落锚点）
- [x] 翻译中/缺失有可见状态
- [x] 示例数据、文件损坏、读取失败、空结果均有明确状态
- [x] 侧栏入口 + 主面板 slot 注册（单元测试断言）
- [x] 宿主路由：示例回退、用户文件、损坏、405、鉴权拒绝、HEAD、health
- [x] 数据契约 v2：示例含中文源样本；宿主接受 v2、拒绝缺 `sourceLanguage` 或成对字段的条目
- [x] 阅读页按 `sourceLanguage` 决定对照列顺序；中文源三种模式正确
- [x] 语言中性块只渲染一份；缺译文显示骨架屏/原文回退并标「未翻译」
- [x] v1 `en`/`zh` 数据仍可读（加载时归一化）
- [x] 测试覆盖英文源、中文源、三种模式（`test/host.test.mjs` + `test/client.test.mjs`）
- [ ] 安装进运行中的 DSH 后的视觉与交互验收（需要安装 + 重启 GUI）
- [ ] 真实 agent digest 文件与真实翻译质量的验收

## 7. 未验证与风险

- 未在运行中的 3080 实例上安装；slot 名称与注册方式依据 DSH `0.2.2-alpha.2` 文档与内置 Plugins 页实现，安装后仍需确认侧栏入口出现、主面板可切换。
- `matchMedia('(max-width: 900px)')` 抽屉判定基于窗口宽度；当 DSH 右栏使页面容器更窄时，列表仍为固定列而非抽屉，这是有意的降级。
- 浏览器字体差异会影响中英混排观感；Windows 上中文衬线回退到 SimSun，若观感不佳可把 `--pr-serif-zh` 换成无衬线栈（一行 CSS）。
- 长论文（数百段）未做虚拟化；当前按每日 5–20 篇、摘要级或全文级内容估算，实际全文阅读时需评估滚动性能。
