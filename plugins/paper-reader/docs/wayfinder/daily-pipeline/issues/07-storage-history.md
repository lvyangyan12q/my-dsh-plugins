---
id: paper-reader-storage-history
title: 确定 digest 存储、历史保留与页面加载范围
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: []
---

## Question

多来源、每天多篇全文会让单文件迅速变大。需要决定：按天文件还是单文件、保留多久、页面加载范围、路由形态、体积上限。

## Resolution

用户确认按建议执行：

- **每天一个文件**：`paper-reader/digest/YYYY-MM-DD.json`，另有 `paper-reader/index.json` 记录日期、条数、各来源状态与最近运行。
- **保留 30 天**：过期文件由抓取任务清理；清理失败不阻塞当日写入。
- **页面先加载最近 7 天**，可继续加载更早（最多 30 天）；默认视图仍按天分组。
- 宿主路由按日期返回（`/api/paper-reader/digest?date=`），另提供 index 路由；单日文件上限沿用 8 MiB，超限时该日写入失败并保留上一份。
- 原子写入：临时文件 + rename；index 最后更新，避免页面看到半份数据。
- 阅读状态仍按条目 id 保存在浏览器，不随文件清理丢失收藏；30 天前的条目仅在历史里不可见。
