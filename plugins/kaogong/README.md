# kaogong —— 武汉公务员考试学习套件

一个给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 使用的插件，
面向备考 **武汉市公务员考试**（行测 + 申论）的学习者。它在 **错题本** 的基础上加入了
**倒排学习计划与进度**，持久化走 DSH 规范的 `storageDomain`（`dsh-storage-json` 后端），
让错题本、学习计划成为可跨会话、可被多个 agent 共享的领域数据。

## 它解决什么问题

| 能力 | 工具 | 说明 |
| --- | --- | --- |
| 记录题目 | `kaogong_record_question` | 结构化录入题目、对错、考点、错因、笔记 |
| 归纳问题点 | `kaogong_analyze_errors` | 错题按 科目→考点→错因 聚合，算出错误率与薄弱点 |
| 总结问题 | `kaogong_summarize_weaknesses` | 薄弱考点排名 + 错因分布 + 学习建议 + 可读总结 |
| 设置计划 | `kaogong_plan_set` | 指定考试日期 + 每天模块数 + 科目权重，倒排生成日程 |
| 查看计划 | `kaogong_plan_view` | 查看某天（默认今天）的学习项与整体进度 |
| 打卡 | `kaogong_plan_done` | 把某天某学习项标记完成 |
| 进度总览 | `kaogong_progress_status` | 剩余天数、完成度、正确率、薄弱考点 |
| 题库维护 | `kaogong_bank_add` / `kaogong_bank_list` / `kaogong_bank_delete` | 维护题库（含答案与解析） |
| 专项训练 | `kaogong_practice` / `kaogong_practice_submit` | 按考点或薄弱点抽题练习，判分并记入错题本 |
| 知识库 | `kaogong_knowledge_add` / `kaogong_knowledge_search` / `kaogong_knowledge_delete` | 把资料整理成结构化笔记，按科目/考点/关键词检索 |
| 查询/删除/大纲 | `kaogong_list_questions` / `kaogong_delete_question` / `kaogong_taxonomy` | 数据管理 |

### Web 看板

插件同时提供一个 Web 客户端入口：启动 `dsh web` 后，侧边栏底部会出现「考公学习」入口。
点击后可以查看考试倒计时、今日计划、计划完成率、做题正确率、薄弱考点，以及最近收录的讲义/笔记；
今日计划可以直接勾选打卡，数据仍写入同一份 `storageDomain`。

客户端 bundle 需要在 Web 启动前生成：

```sh
pnpm exec tsdown -c kaogong/tsdown.config.ts
```

如果使用 junction 引用源码，修改 `kaogong/src/*` 后重新执行上面的命令，再重启 `pnpm dsh web` 即可。

## 设计

### 两个持久化领域（storageDomain）

- `kaogong_notebook`：一张 `questions` 表（key = 题目 id），存错题。
- `kaogong_progress`：一个 global 计划配置 + 一张 `days` 表（key = 日期），存倒排日程。

记录 schema 用 zod 声明（`src/domain.ts`），在 durable 边界校验；zod 类型是唯一真源。
持久化后端由 DSH 的 storage 栈提供（默认 `json`，可改 `sqlite`），插件自身不碰介质。

### 倒排计划（2027 年 3 月考试）

`kaogong_plan_set` 从今天倒排到考试日，按 基础 60% / 强化 25% / 冲刺 15% 三阶段排满：

- **基础**：把内置考点大纲（73 个考点）按科目权重轮询排到每一天；
- **强化**：逐科 复习 + 专项练习；
- **冲刺**：全真模考 + 错题巩固。

`kaogong_progress_status` 会同时读错题本，把薄弱考点带进进度总览——这是后续班主任按薄弱点
动态调整路线的接口。

### 代码结构

```
src/
  types.ts      # 纯类型（QuestionRecord / Question），零依赖
  taxonomy.ts   # 考点大纲 + 错因分类 + flattenTaxonomy，零依赖
  analyze.ts    # 归纳 + 总结的纯函数，零依赖
  schedule.ts   # 倒排日程纯函数，零依赖
  practice.ts   # 专项训练抽题纯函数，零依赖
  knowledge.ts  # 知识库检索纯函数，零依赖
  schemas.ts    # 纯 zod 记录 schema，零 DSH 依赖
  domain.ts     # 四个 storageDomain 的 spec（依赖 dsh-storage-domain）
  index.ts      # DSH 插件适配层：打开域 + 注册 18 个工具
scripts/
  demo.ts       # 可运行示例（node scripts/demo.ts，无需 DSH）
data/
  sample-questions.json  # 10 道示例题
```

纯核心（types/taxonomy/analyze/schedule）与 DSH 解耦，可单独用 Node 验证；
`domain.ts` + `index.ts` 只做领域声明与工具装配。

## 安装与接入

### 从多插件 GitHub 仓库安装

本插件位于仓库的 `plugins/kaogong/` 目录，仓库可以继续添加其他插件。推荐直接从 GitHub
仓库安装这个子目录：

```sh
git clone https://github.com/lvyangyan12q/my-dsh-plugins.git
dsh plugin --profile web add ./my-dsh-plugins/plugins/kaogong
```

安装时会执行 `prepare`，自动构建 host/client bundle；pnpm 若提示允许该包执行构建脚本，选择允许
`@deepseek-ai/dsh-tool-kaogong` 即可。安装完成后重启 `dsh web`，侧边栏底部会出现「考公学习」。
本目录的 `cordis.patch.yml` 会自动接入存储栈与插件本体，不需要再手工复制到 `~/.dsh/`。

### 源码开发接入

插件通过 `cordis.yml` 接入，需要先挂 DSH 的存储栈。**一键接入**（拷贝 + 幂等合并，带 dry-run）：

```sh
node scripts/install.mjs --dsh ../deepseek-harness            # 拷贝 + 生成 overlay
node scripts/install.mjs --dsh ../deepseek-harness --cordis <你的 cordis.yml>  # 并合并
node scripts/install.mjs --dsh ../deepseek-harness --dry-run  # 先看会做什么
```

手动做法（与脚本等价）：

1. 把本目录拷贝进你的 DeepSeek Harness 仓库（例如仓库根下的 `kaogong/`）。
2. 在现有 `cordis.yml` 中追加（完整片段见 `cordis.example.yml`）：

```yaml
- id: storage
  name: '@deepseek-ai/dsh-storage'

- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: './.kaogong/storage'

- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: 'json'

- id: kaogong
  name: './kaogong/src/index.ts'
  config:
    topN: 8
```

3. 用源码启动方式运行（`pnpm dsh --profile <你的 profile> ...` 走 tsx），
   或把本目录加入 workspace 后 `pnpm run build`，再把 `name` 改为
   `@deepseek-ai/dsh-tool-kaogong`。

### 配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `topN` | `8` | 总结/进度里返回的薄弱考点数量 |

存储后端（json 的 `root`、是否改用 sqlite）由 storage 栈的条目配置，不在本插件内。

## 使用示例

**录错题**：

```
「这道题我选 C 但答案是 B：片段阅读题，问主旨……」
```

模型调用 `kaogong_record_question` 录入，再问「归纳一下问题点 / 总结薄弱环节」，
得到 `kaogong_analyze_errors` / `kaogong_summarize_weaknesses` 的结果。

**定计划**：

```
「我 2027 年 3 月考试，每天学 2 个模块，帮我倒排一份学习计划」
```

模型调用 `kaogong_plan_set` 生成日程；每天问「今天学什么」用 `kaogong_plan_view`，
学完用 `kaogong_plan_done` 打卡；问「我现在的学习进度如何」用 `kaogong_progress_status`。

## 先本地跑一遍（无需 DSH）

```sh
node scripts/demo.ts
```

需要 Node ≥ 23.6（原生类型剥离）。它会加载示例题，打印归纳结果、总结与一份到 2027-03 的
倒排计划。

## 测试

```sh
node --test --test-isolation=none tests/core.test.ts    # 纯核心（无需依赖）
node --test --test-isolation=none tests/schemas.test.ts  # zod schema（需 zod 可解析，如放入 DSH 仓库）
```

`core.test.ts` 覆盖归纳/总结、倒排计划、专项训练抽题与考点大纲；`schemas.test.ts` 用样例数据
校验 zod schema。`--test-isolation=none` 用于在受限沙箱里避免测试运行器的子进程 spawn；普通机器上
可去掉该参数。

## 角色层（班主任 + 老师/辅导员）

角色层不写插件代码，用人设 + subagent 委派把 18 个工具组织成学习助手，详见
[`roles/README.md`](roles/README.md)：`roles/cordis.yml`（接线）、`roles/personas/`（班主任/老师/辅导员人设）、
`roles/skills/kaogong-teach/`（各科讲授法 skill）。

## 后续可扩展

- **题库已就绪**：`kaogong_bank` 领域 + `kaogong_practice`/`kaogong_practice_submit` 已实现；
  下一步可让 `kaogong_plan_done` 打卡后自动从题库抽该考点练习。
- **知识库已就绪**：`kaogong_knowledge` 领域 + `kaogong_knowledge_add/search/delete` 已实现（关键词检索，不依赖 embedding）。
- **角色层已就绪**：1 班主任 + 按需 subagent 的老师/辅导员（见 `roles/`）；可选升级是改用 preset 做严格的按角色工具隔离。
