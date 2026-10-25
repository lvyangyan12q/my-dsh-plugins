---
id: kaogong-standalone-02-study-data
title: 备考档案与当前数据承接
status: open
assignee: null
blocked_by: [kaogong-standalone-01-native-standalone]
---

规格：[spec](../spec.md)；交接：[HANDOFF](../HANDOFF.md)。

## 工作
- 将当前实例ID、业务域、课堂/轮次、资料关系和Native绑定接入自有元数据；展示精确映射后写入。
- 页面改备考档案和首次设置；默认继续，不每次强制通用实例管理。
- 计划/复习用增量域；旧全局学习记录/会话不自动迁移，现有未保存表单处理后再切换。

## 验收
- [ ] 两档案隔离，同档案多视图一致；当前记录/绑定保留，无重复导入或消息重发。
- [ ] 异常/未知迁移不覆盖；刷新、重启能继续，保留精确回执。

## Resolution
尚未实施。记录准确源码/包、实际结果和仍缺项后才能关闭。
