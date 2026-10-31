# 个人学习

独立 DSH 菜单入口，A 工作室样式。首片支持创建学习名称、目标和已有基础，通过 DSH storageDomain 持久保存；不依赖工作台，不读取考公数据。

运行 `npm test` 与 `npm run build`。安装包入口由 cordis patch 注册宿主，客户端使用公开 main/sidebar.panellist 插槽。

## 应用边界

`GET /api/personal-learning` 返回 `{instances,lastInstanceId}`。`POST` JSON `{action:'create',title,goal,priorKnowledge}` 返回新实例。所有请求通过 DSH connection admission。实例有稳定 UUID、名称、目标、已有基础和创建时间。持久化 domain 为 personal_learning，公开应用命令实现位于 application.mjs，UI 请求封装为 learningRequest。

## 工单 01 验证

- TDD：先运行恢复场景测试，因应用模块不存在失败；实现后通过。
- 测试通过公开应用命令边界验证创建、重开恢复、无效输入不产生实例；存储设施是内存替身，未证明真实磁盘重启。
- 宿主和客户端 bundle 构建通过。
- 独立菜单注册与 storageDomain 适配已实现；真实安装、浏览器菜单与重启持久化验收待整体集成环境。没有伪装教学或生成成功。
