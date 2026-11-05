# dsh-paper-reader

DeepSeek Harness 的**独立本地插件**：一个论文与重要博客的中英文阅读页。

左侧按天聚合 agent 每日抓取的 X / Claude Blog 条目，可折叠、搜索、按方向筛选；右侧阅读区支持 **中英对照 / 仅中文 / English** 三种模式。页面由插件直接渲染在 DSH 主面板中——不是 iframe，不打开独立站点，也不依赖 worktable。

```
┌──────────────────────── DSH 窗口 ─────────────────────────┐
│  DSH 侧栏    │ 论文阅读  [示例数据]      每日 09:00 · 8 篇 │
│  会话…       ├────────────────────────────────────────────┤
│              │ 搜索…  方向 × 筛选         1/8 · 已读 3/8 │
│              │ ┌───────────┬──────────────────────────────┐│
│              │ │ 今天   3  │ 标题（中/英）                 ││
│              │ │  □ 论文 A │ 导读                         ││
│              │ │  □ 论文 B │ ┌─原文──────┬─中文─────────┐ ││
│              │ │ 昨天   2  │ │ paragraph │ 段落译文      │ ││
│              │ │  □ 论文 C │ └───────────┴──────────────┘ ││
│              │ └───────────┴──────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
```

## 安装

插件是本地目录包，进入 DSH 插件管理页选择「本地目录」安装，或用 CLI：

```powershell
dsh plugin --profile web add "F:\ai-project\my-dsh-plugins\plugins\paper-reader"
```

安装后重启 `dsh web`（或桌面端）使 Host 组合生效；若插件管理页显示未启用，先启用该 bundle。重启后左侧栏出现「论文阅读」入口，点击即打开本页。

> 当前包按 DSH `0.2.2-alpha.2` 的客户端契约开发；其他宿主版本可能在安装时被 `engines.dsh` 拒绝。

## 数据：agent 每日写入

插件只读取本地文件，不主动访问 X / Claude，也不保存任何凭据：

```
$DSH_HOME/paper-reader/digest.json      # 默认 C:\Users\<你>\.dsh\paper-reader\digest.json
```

- 文件不存在时，页面使用包内 `sample/digest.json` 并显示「示例数据」标记。
- 文件存在但 JSON 损坏 / 结构不符时，页面明确报错，不会把旧示例冒充成你的列表。
- 每次打开页面和点击「刷新」都会重新读取该文件；agent 写完文件后刷新即可看到新内容。
- 读取是只读的：插件不会创建、迁移或改写该文件。

推荐由每日 agent 在 09:00 抓取后**原子写入**（先写 `digest.json.tmp` 再 rename），避免读到半个文件。数据契约见 [docs/DESIGN.md](docs/DESIGN.md#数据契约)。

### 每日抓取（插件之外）

采集链路方案已定、尚未实现：[实现规格](docs/wayfinder/daily-pipeline/spec.md) 与 [11 张纵向切片工单](docs/wayfinder/daily-pipeline/implementation/README.md) 是唯一实施入口。目标：每天 10 条、全文抽取、中英对照、按天 digest、DSH Schedule 每日运行；来源 arXiv、HF 每日榜、Anthropic、DeepSeek、Kimi、OpenAI；HF/OpenAI 需显式代理；X 预留，Claude Code 与 DSH `web_search` 不在范围内。

## 阅读与交互

| 操作 | 方式 |
|---|---|
| 切换论文 | 点击左栏条目；`J` / `K` 下一篇 / 上一篇 |
| 搜索 | `/` 聚焦搜索框，匹配标题、作者、关键词、机构 |
| 按方向筛选 | 顶部方向标签（Agent / 推理 / 训练 / 对齐 / 架构…），与搜索、收藏叠加 |
| 只看收藏 | 方向标签旁的「★ 收藏」 |
| 折叠某天 | 点击日期分组标题；筛选时自动展开 |
| 阅读模式 | 顶部分段控件，或快捷键 `1` / `2` / `3` |
| 收藏当前论文 | 阅读栏星标，或 `B` |
| 收起/展开列表 | 顶部侧栏按钮，或 `Ctrl+B`（macOS `⌘B`） |
| 本文大纲 | 顶部大纲按钮；点击小节跳转，滚动时高亮当前节 |

阅读状态（模式、已读、收藏、折叠的天、当前论文）保存在浏览器 `localStorage`，键为 `dsh-paper-reader:v1`。

## 设计要点

- **对照固定「原文 | 译文」**：每一行左原文、右译文，滚动天然同步；列的先后由条目的 `sourceLanguage` 决定——英文来源左英文右中文，中文来源左中文右英文。
- **「仅中文 / English」是目标语言视图**：不假定原文语言；中文来源的 English 模式读的是英文译文。
- **公式、图、代码整行跨栏**：不复制两份，避免对照模式里出现两个相同公式；它们的说明与图注仍按原文/译文成对显示。
- **切模式保持阅读位置**：从对照切到仅中文时，按当前段落锚点恢复滚动位置。
- **跟随 DSH 主题**：颜色使用宿主 `--dsw-*` 变量，亮/暗主题自动适配，不额外提供主题开关。
- **翻译缺失可见**：`translation: null` + `translationState: "pending"` 渲染骨架屏；缺失译文在单语模式下回退原文并标注「未翻译，显示原文」，不静默留白。

更多布局理由、状态矩阵与验收清单见 [docs/DESIGN.md](docs/DESIGN.md)。

## 开发

```powershell
pnpm install          # 安装 esbuild
pnpm build            # 生成 lib/index.js 与 lib/client.js
pnpm check            # 语法检查
pnpm test             # 宿主路由/契约测试 + jsdom 阅读页渲染测试
```

阅读页测试需要 jsdom 与 react（不在本包内）：

```powershell
$env:PAPER_READER_TEST_DEPS = 'C:\path\to\package-with-react-and-jsdom'
$env:ESBUILD_BIN = 'C:\path\to\esbuild.exe'   # 仅当 lib/client.js 缺失或过期
node test/client.test.mjs
```

没有本地 esbuild 时，可把 `ESBUILD_MODULE` 指向已有安装：

```powershell
$env:ESBUILD_MODULE = 'file:///path/to/node_modules/esbuild/lib/main.js'
node build.mjs
```

## 已知边界

- 抓取与翻译由外部 agent 完成；插件不内置模型调用、不保存密钥、不访问外网。
- `sample/digest.json` 是演示数据，不是真实抓取结果。
- 当前版本在 DSH `0.2.2-alpha.2` 的客户端契约上开发；`package.json` 的 `engines.dsh` 固定为该版本，升级 DSH 后需按新契约复验。
- 已在隔离的 DOM 环境验证列表、筛选、搜索、三种模式、折叠与收藏；尚未在运行中的 DSH 实例里做安装后的视觉验收。

## License

MIT
