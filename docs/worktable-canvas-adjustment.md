# 工作台模块画布调整

本轮基于 2026-10-03 会话方案：借鉴 Worktable 先布局后窗格配置，将四步集中表单降为高级设置。工作台仍是通用应用平台，考公只是接入应用。

DSH 原生菜单、开源 Worktable 代码、当前 Agent 管理改动和业务数据保持。只有现有管理入口建立的 Agent、Skills 可以跨应用复用；应用私有能力暂不迁移。工作台随插件提供应用搭建、模块生成、数据展示、页面调整 Skills。

应用内必须复用完整 DSH 原生会话，包含对话、轨迹、工具调用和审批。现有角色组件只嵌入 conversation.content，需通过原生已注册视图核实轨迹导航与执行交互，不能以占位模拟替代。

实施工单索引：[8 张本地工单](../.scratch/worktable-canvas/issues/README.md)。原型隔离在 codex/prototype-worktable-canvas，尚待用户确认，不进入正式插件。

本轮原型问题：选定布局后，能否直观在各模块里配置内容，同时看到 DSH 原生会话的使用位置？A 模块内配置；B 模块侧栏设置；C 聚焦模块设置。所有操作为内存演示；真实接入在工单03，拖动及持久布局在工单06。

原型启动：在原型分支运行 node plugins/personal-workbench/prototype/serve-worktable-canvas.mjs，打开 http://127.0.0.1:3086/?variant=A。

原型确认后再进入正式实现。暂未新增测试；实现测试边界将按 tdd 技能确认后执行。

## 原生接入调查

DSH 的 conversation.content 默认承载 conversation.session 与原生输入框；会话标题和已注册视图的切换按钮位于独立的 conversation.session.header。现有角色模块只挂载 content，需要核实并补齐原生 header/视图导航的受支持挂载方式，保持同一 SessionProvider 的会话作用域。不复制轨迹渲染实现。

## 保存验证

四个 Agent 管理修改文件、四个开源插件关键源文件及构建入口的 SHA-256 与本轮开始前一致。正式插件代码未修改或重建，正式 DSH 未重启。原型浏览器仅访问隔离 3086；没有真实模型、数据或会话写入。
