# 独立学习页关闭重开保持偏好

实际安装 f20 的原生待答恢复验收发现：外层考公应用停在练习页，独立学习切到讲义后关闭重开，局部页面回到外层练习；原生待答/选择保留。本修复仅针对 completion US4/5 的页面显示偏好，不更改角色绑定、原生会话或业务证据。

公共 Client 回归使用 KaogongWorkbenchContent 的正常按钮：首次从外层练习打开应选择练习；切讲义→关闭→重开应保留讲义；再关闭并创建 fresh view owner 后打开仍保留讲义。RED 原行为在第二次打开时讲义 aria-pressed=false。launcher 每次覆写 study.page 是原因。

未选择学习页用 null 表示；第一次显式打开才按外层有效页初始化。后续使用已有学习页及现有五字段偏好恢复，准备真实教学任务的明确导航保持原行为。偏好保存仅接受四个已知页；不扩充存储schema。

验证：只重建本工作树考公Client，4项邻近公开回归通过；使用 KAOGONG_TEST_TOOLS 与 KAOGONG_TEST_RUNTIME 指向既有官方DSH运行时后，views.test.mjs 27/27通过。最初缺测试依赖/缺runtime环境错误保留为环境配置失败，不冒充行为RED。直接Client tsc缺可选工作台module；私有paths配置连接本地既有声明后仍缺 WorkbenchAppRegistration 导出（既有声明过旧），因此未宣称类型门禁通过；父层最终串行干净构建将生成匹配声明并复验。

真实安装关闭重开/刷新/冷恢复尚待父层；DOM fresh owner 不是Host冷重启。未启动Host/浏览器、未改main/3080/正式资料/成绩或原生等待状态；工单仍open。
