# 角色层：班主任 + 任课老师 / 辅导员

这一层不写插件代码，用「人设（persona）+ 工具 + subagent 委派」把上面 18 个工具组织成可用的学习助手。
按「先少后多」的决策：**1 个班主任（主 agent）+ 按需拉起的老师/辅导员（subagent）**，不常驻 12 个 agent。

## 文件

```
roles/
  cordis.yml                  # 角色层接线（subagent + 班主任主 agent）
  personas/
    班主任.md                 # 班主任人设（协调 + 派活）
    老师.md                   # 任课老师人设模板（{科目} 占位）
    辅导员.md                 # 辅导员人设模板（{科目} 占位）
  skills/
    kaogong-teach/SKILL.md    # 各科讲授法 skill
```

## 怎么接

也可以用脚本一键做前两步：`node scripts/install.mjs --dsh ../deepseek-harness --dry-run`。手动做法：把两段合并进你现有的 `cordis.yml`：

1. 存储栈 + kaogong 插件（`cordis.example.yml`）。
2. 角色层（`roles/cordis.yml`）。

`roles/cordis.yml` 做了两件事：挂 `subagent`/`tool-subagent`（班主任能派活），并把主 agent 设为
「班主任」（persona 内联在文件里，与 `roles/personas/班主任.md` 同内容）。

## 工作流

```
你：「我今天学什么？」
班主任：kaogong_plan_view → 报今日任务（基础期学某考点）
你：「学图形推理吧」
班主任：read roles/personas/老师.md → subagent(prompt = 老师人设 + 行测-判断推理 图形推理)
老师子代理：kaogong_taxonomy + kaogong_knowledge_search 备课 → 讲考点 → kaogong_practice 随堂检测
你：「做完题了」
班主任/辅导员：kaogong_practice_submit 判分 → 讲错题 → 记入错题本
你：「我最近问题在哪？」
班主任：kaogong_analyze_errors + kaogong_summarize_weaknesses → 报薄弱点 + 建议
```

老师/辅导员都是 subagent，人设模板放在 `roles/personas/`，班主任用 read 工具读出来、把 `{科目}` 替换后写进 subagent 的 prompt。

## 各科讲授法 skill

`roles/skills/kaogong-teach/SKILL.md` 是「各科怎么讲」的方法论。老师讲课时可通过 `skill` 工具加载它；
把它所在的 `roles/skills` 目录加进 skill 提供方的扫描根即可（本仓库默认扫描 `<dshHome>/skills`，
可把该目录软链/拷贝过去，或在组合里配置 `dsh-skill-filesystem` 的根目录）。

## 验证清单（这层是配置，需要 boot 后确认）

与前面插件层的纯函数/typecheck 不同，角色层必须在真实 DSH 运行时里验证。boot 后请依次确认：

1. 班主任 agent 能 `kaogong_plan_set` 生成计划、`kaogong_plan_view` 看今日任务。
2. 班主任能用 `subagent` 拉起老师子代理，子代理能调用 `kaogong_taxonomy`/`kaogong_knowledge_search`。
3. 练习闭环：`kaogong_practice` → 用户作答 → `kaogong_practice_submit` 判分 → `kaogong_analyze_errors` 能看到新增错题。
4. 数据持久化：重启后 `kaogong_plan_view`/`kaogong_list_questions` 仍能读到之前的数据（storage-json 落盘）。
5. 讲授法 skill 能被 `skill` 工具加载。

若第 1 步就失败，先查存储栈三件套（storage / storage-json / storage-domain）是否都在组合里且 backend 名一致。

## 后续：更细的工具隔离（可选）

当前所有角色共用全部 18 个工具，靠人设约定各司其职。若要严格隔离（班主任只见进度/计划，老师只见知识库/题库），
可改用 DSH 的 preset：每个角色一个 preset 目录（内含 `agent.cordis.yml`），在其 scope 里注册该角色专用的工具与 persona，
agent 通过 `dsh-agent-presets` 加入对应 preset。需要时我可以再搭这一版。
