# 课堂评审修复（2026-11-07）

对象：`feat/kaogong-classroom` 分支上的课堂讲义 / 当堂检测批次。本文件只记录实际跑过的结果。

## 本批 5 个提交

| 提交 | 内容 |
|---|---|
| `59f40d5` | feat(kaogong): classroom handout tab with data-driven lesson content |
| `1e32011` | feat(kaogong): interactive mixed-growth lab in classroom handout |
| `102cc18` | feat(kaogong): in-class quiz with instant grading in classroom panel |
| `861bc48` | feat(kaogong): return-to-section and quiz summary in classroom |
| `eac2a88` | feat(kaogong): post-class steps and reheat driven by quiz evidence |

评审修复本身随后的 `fix(kaogong): address classroom review findings` 提交进入。

## 测试

命令（PowerShell，工作目录 `plugins/kaogong`）：

```powershell
$env:TSX_TSCONFIG_PATH='D:\programming\workspace\my-dsh\plugins\kaogong\tsconfig.test-client.json'
node --import tsx/esm --test tests/quiz-tasks.test.tsx tests/quiz-summary.test.tsx tests/quiz-page.test.tsx tests/handout-page.test.tsx tests/handout-lab.test.tsx tests/closeout-page.test.tsx tests/learner-draft-page.test.tsx
```

结果：7 个测试文件、27 个用例全部通过（27/27），0 失败、0 跳过。

其中前五个文件是本批行为（讲义、实验台、当堂检测、小结与回跳、课后任务）；后两个是既有的 `closeout-page`、`learner-draft-page` 面板回归，用来确认课堂面板改动没有破坏收尾与草稿恢复。

类型检查：仓库的 `scripts/check-client-types.mjs` 需要 `DSH_SOURCE` 指向已构建的官方 rc.3 checkout，本次未设置、未运行；改用仓库根目录的 `tsc --noEmit` 检查改动文件，除测试文件缺少 `jsdom` 类型声明（TS7016）外无报错。

## 未完成项

- 票 05 的持久化 P2：关闭课堂再打开后恢复页签与检测进度未实现（没有新增接口，也没有写浏览器持久化），按 P2 止损。本批只把「读」完成状态收进插件级 `useBusinessState`，页面重载仍不恢复。
- 票 06（接入第二课《增长量比较》）未做。讲义匹配仍是「目标或限定考点包含关键词」的单课判断，第二课尚未加入。
