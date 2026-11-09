# 工作台模块画布原型

隔离分支：codex/prototype-worktable-canvas。一次性原型，不进入正式插件。

运行：node plugins/personal-workbench/prototype/serve-worktable-canvas.mjs

打开 http://127.0.0.1:3086/?variant=A。A 模块内配置；B 模块设置侧栏；C 聚焦配置。切换保留同一份内存草稿。

所有数据和会话均为占位示意；不会调用模型、访问业务目录或修改正式数据。DSH 原生对话/轨迹仅展示挂载位置，真实接入属于工单03；布局拖动与尺寸持久化属于工单06。

尚待用户确认。验证步骤：创建四宫格 → 自定义模块填写需求 → 生成演示 → 完成配置 → 保存草稿 → 预览 → 显式启用 → 新页面 → 返回首页。
