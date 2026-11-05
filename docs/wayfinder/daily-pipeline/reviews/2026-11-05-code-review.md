# Code review（2026-11-05）

固定点 `619ff35`，分支 `integration/paper-reader-pipeline`，43 个提交，diff 89 文件 / +18,357 / -491。两轴分别由独立评审子代理完成，互不合并排序。

## Spec 轴

### (a) 缺失/部分实现

1. spec L146「左栏新增来源筛选，与方向、搜索、收藏叠加」未实现：client 只有方向/搜索/收藏；`DEFAULT_PREFS` 无 `source`。
2. spec L82「配额、来源权重、每源上限、关键词/机构白名单都在配置中」：只有 quota/categories/keywords/maxItems，无来源权重、无机构白名单；select 排序无权重。
3. spec L75 OpenAI：`src/sources/openai.js` 默认 `enabled:false`，默认运行不含 OpenAI。
4. spec L87「或插件配置中的代理 URL」不可用：run.js 无注入 transport 即 `proxy_transport_missing`；CLI 从不传 proxyFetch，生产只剩 env + `NODE_USE_ENV_PROXY`。

### (b) 超出 spec

- `state/sources.json` 跨天发现记忆（storage.js / run.js）超出 spec 的 digest/index/runs 契约。
- run 记录 1 MiB 上限；digest 条目扩展 `sourceId/authors/venue/readingMinutes/excerptReason` 超出 v2 示例字段。

### (c) 疑似实现错误

1. DeepSeek「免翻译」被破坏：run.js 对全部条目调用 `translateItems`，service 会把 DeepSeek 缺译块送 LLM；仅 env 为空时保持 pending。
2. HF 排序不是票数优先：select.js 先 heatTier、再关键词分、再票数。
3. 「每日 10 条」与「不足不凑数」表述冲突（select 不补足，11-05 为 9 条）。

### 通过项

6/4 配额骨架、去重优先级、HF 代理失败整源 skipped 且不落直连、OpenAI 节选降级、翻译缓存/预算/pending、按天文件+index+30 天+8 MiB+原子写、7 天加载、run 状态可见、页面不触发抓取。

## Standards 轴

无 CODING_STANDARDS/CONTRIBUTING/AGENTS；标准源为 README、docs/DESIGN.md、GLOSSARY.md、spec.md；tooling 仅 `node --check`。

### HARD

1. spec L159「run 入口注入 fetch、LLM、时钟、文件系统端口」：`runDaily` 只注入 fetch/clock/adapters；storage.js 直连 `node:fs`，测试用真实临时目录。
2. `registry.js` 自称「新增内置来源＝加一个模块＋一条 registry 条目」不成立：还需改 `run.js` 适配器表、`config.js` 默认值/校验；registry 的 list/extract/defaults/label/short 无消费者。

### Judgement calls

- Duplicated Code：`fetchText` ×5；原子写 ×2；`pruneExpired` ≅ `pruneRuns`；config 默认/校验复制 sources/validation；OpenAI walker 重复 blog walker；重试循环 ×2；`finishStats` 早退 ×4。
- Repeated Switches：block.type 判定散在 6 处；「翻译完成度」两套定义（schema 只算 heading/paragraph，service 还算 title/summary/caption/note）。
- Primitive Obsession：源语言裸串归一重复 4 处。
- Data Clumps：`source+sourceId`、`published+publishedAt` 双写；DESIGN 用 sourceId、spec 用 source。
- Speculative Generality：registry 元数据；`BLOCK_TYPES`（"for tests and future adapters"）。
- Mysterious Name：`extractVia` / `bodySourceOf`；`finalized`；三个 URL 归一器。
- Divergent Change：`run.js` 单函数 424–867；`client/index.jsx` 单组件 367–1630。
- 小重复：本地日历日期、`addDays` / `shiftDate`。

## 修复优先级

1. Spec 缺口：来源筛选、来源权重/机构白名单、proxy.url、DeepSeek 免翻译、HF 票数优先、OpenAI/spec 对齐、10 条措辞、state/extra fields 写入 spec。
2. HARD：registry 成为唯一来源元数据；runDaily 注入 storage 端口。
3. 重复聚合：fetchText、原子写、prune、config 合并、blog/openai walker、重试、block 类型、日期/URL 工具。
4. 命名与数据团：`extractVia`/`bodySourceOf`、source/sourceId、published/publishedAt。
5. 单函数/单组件拆分：至少拆 run.js 的阶段；client 拆分按剩余时间评估，行为不变。
