# my-dsh

DSH 的本地插件仓库。

- `plugins/personal-workbench`：工作台、Agent 和 Skill 管理。
- `plugins/kaogong`：新版考公学习插件。
- 插件来源：原 my-dsh-plugins 的 release-verification 提交 e8f01d3。

## 本地运行

```powershell
pnpm install
$env:DSH_SOURCE = "D:/programming/workspace/deepseek-harness"
pnpm run build
node "$env:DSH_SOURCE/apps/cli/lib/bin.js" plugin --profile web add "link:D:/programming/workspace/my-dsh/plugins/personal-workbench" "link:D:/programming/workspace/my-dsh/plugins/kaogong"
pnpm start
```

地址：http://127.0.0.1:3082/ 。3081 为原合成测试实例，与真实学习数据分开。

## 数据和资料

代码已归入本仓库；既有学习数据仍使用 `C:/Users/pc-zzy/.dsh/storages`。旧考公目录保留为资料工作目录，原始 PDF、讲义、题目及历史解析结果不搬动、不提交到 Git。

- 教师工作目录：`D:/programming/workspace/kaogong`
- 历史图片：`D:/programming/workspace/kaogong/题目_images`
- MinerU 结果：`D:/programming/workspace/kaogong/storage/mineru`
- 凭据继续由原 DSH profile 管理，不放入仓库。
- `.local/backups` 保存切换前的 profile 和学习数据备份；本机路径记录见 `.local/paths.json`，均已忽略。

旧目录中的插件代码作为回退副本保留；正式 profile 只启用本仓库的考公插件。菜单层级调整与真实教师对话验收尚需继续。
