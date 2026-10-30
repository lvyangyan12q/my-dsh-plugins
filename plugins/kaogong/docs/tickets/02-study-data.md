---
id: kaogong-standalone-02-study-data
title: 备考档案与当前数据承接
status: closed
assignee: native_exploration
blocked_by: [kaogong-standalone-01-native-standalone]
---

规格：[spec](../spec.md)；交接：[HANDOFF](../HANDOFF.md)。

## 工作
- 将当前实例ID、业务域、课堂/轮次、资料关系和Native绑定接入自有元数据；展示精确映射后写入。
- 页面改备考档案和首次设置；默认继续，不每次强制通用实例管理。
- 计划/复习用增量域；旧全局学习记录/会话不自动迁移，现有未保存表单处理后再切换。

## 验收
- [x] 两档案隔离，同档案多视图一致；当前记录/绑定保留，无重复导入或消息重发。
- [x] 异常/未知迁移不覆盖；刷新、重启能继续，保留精确回执。

## Resolution
已实现同Native home内、允许不同source/runtime profile的当前学习元数据承接。部署显式配置来源profile；受保护HTTP生成精确ID/来源SHA256预览，页面单独确认并明确选择继续档案后，增量写入自有元数据。原业务域及Native会话原位使用，旧全局default不接管。来源变化、歧义授权、未完成provision/迁移计划、目标身份冲突均拒绝，执行未知状态保留隔离回执。

已保留原生Session/cwd/standard预设/角色revision、资料grant及撤销、accepted/unknown教学回执。旧prepared上下文仅保留查看，不能编辑后重发；从当前授权重新准备新请求。承接前已由Native打开的同一空闲Agent，经精确绑定核验补挂私有Skill，不创建替代Session或发送消息。学习目标表单与未保存总结使用档案专属本地缓存恢复，Host仍是课稿/成绩权威。

测试：新增HTTP六项及设置确认/课堂草稿页面两项逐切片red→green；真实Native测试增加先于承接已激活Session的私有Skill恢复场景。现行Host28项、Client15项及发行内容1项通过，Host/Client官方公开声明检查通过。

真实同Native home、不同profile、无Worktable验收完成：页面预览5档案/5角色绑定/5资料关系/3已发送回执，明确选择当前档案后确认；准确最终包 SHA256 `072cb68639cac72f7cf5b80bcfd43eab82408857e0a8003d789d80f789526d87` 经官方CLI安装，编译入口冷重启及同一回执重复确认200/applied，未重复导入。浏览器冷恢复继续同一档案，原资料分析/通用老师的Session、standard预设、revision与cwd均保留，原轮次10题9对及1条反思、2课稿、已撤销授权和已发送回执均可读，原生右栏正常且无错误。未发送提示、调用模型或新建练习轮次。`agents`服务曾在准确包重试中暴露缺少inject，已显式声明，真实Native测试也改为使用生产注入边界回归。

保留核对24个原文件：23个整文件SHA256不变，包含5份来源元数据及当前评分/课稿业务域；1份既有原生空Session的390字节原始压缩前缀SHA256不变，仅追加80字节空`session/end-seed`帧，无消息事件。不能把这记作24份整文件不变。准确包、私有映射/回执/哈希和页面证据均保留仓库外；仅停止本票拥有进程并确认3152无监听。完整模型学习闭环仍由07验收。
