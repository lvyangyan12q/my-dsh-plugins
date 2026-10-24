---
id: harness-rc3-installed-acceptance
title: 新包真实安装与工作台考公完整用户验收
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [harness-rc3-host-consumers, harness-rc3-classroom-application, harness-rc3-kaogong-instances, harness-rc3-legacy-adoption, harness-upgrade-acceptance-cutover]
target: 0.2.1-rc.3
---

按 HU01—HU08 与原 F01—F14，在独立的未经补丁 rc.3 原生实例安装准确新版本归档。3097 开发 link 点测仅为前置，不替代本票。

- [ ] 新版本经规定 pack 入口、精确文件清单、独立安装、客户端工厂/SDK 消费者验证，记录 SHA 与真实加载来源。
- [ ] 工作台创建修改启用、模块/数据/角色、标注生成追改、两实例隔离与共享撤销通过。
- [ ] native Session 创建/恢复、plain/reference/command/quote 草稿、焦点、撤销、原生问题/审批/Stop 真实核对。
- [ ] Notes/Reading 与考公真实教学/练习评分/课堂完成/统计/资料引用连续可用。
- [ ] 热停用卸载重装、浏览器刷新与 Host 重启恢复，终端/路由/持有释放且原生菜单完整。
- [ ] 物理 IME 单列实际人工证据；未提供的范围不宣称通过。真实模型未配置/失败不得写完成。
- [ ] 正式资料接管及正式切换按已审具体预览，不借本票自动改3080或读取凭据用于别处。

## 2026-10-24 开发 link 准备（不是最终包验收）

隔离分支以 `10e1781446f5b5b3e0cbca55dda1ceb3a9700740` 构建 Worktable 与考公，随后同步 `2ae9f24cb8cad4c86a32473e7e546abf2ba59170`。Worktable package/manifest 由 `0.10.0-rc.3.1` 前进到 `0.10.0-rc.3.2`，lock 根与根包原滞留 `0.9.6` 同步为 `.2`；未执行 pack、未冻结 `.2`、未修改冻结 `.1` 资产。此处只变版本元数据，不改功能代码。

官方未补丁 rc.3 CLI 在既有独立 3097 home 注册该工作树的两个 development link；Node25.2.0 从原生 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60` 入口隐藏启动，owned PID29288 真实监听127.0.0.1:3097。启动警告一度显示考公等待服务，root随后真实IAB看见考公及资料库应用目录，不能将瞬时警告直接写成持续失败。未重启/停止其他宿主，未读取3091凭据或复制模型；原有文件写前hash清单保存在私有验收目录。

辅助验证：Worktable实际host/client构建及node语法通过；考公host/client构建、客户端声明、实际原生公开host声明通过。运行依赖独立解析确认 Worktable/考公 `@deepseek-ai/cordis` 均为该原生 `vendor/cordis/lib/index.js` 且 Context 严格同一；考公storage-domain和agent-preset-registry解析至该原生公开lib。构建工具通过本工作树自有junction引用既有依赖，不改目标目录；该运行中工作树暂不清理。

浏览器证据由root继续：本子任务CUA只有Chrome/Edge扩展，隐藏IAB不可用，未擅自换浏览器，也没有创建实例、角色、模型消息。root报告原有两条未发送标注保留、原生模型选择器仍显示“请选择模型”。角色创建前还须通过公开配置设置 `roleCwd` 为隔离 acceptance/project，并在原生UI登记对应工作区；子任务尚未执行这两项。真实课堂、两实例、多视图、资料库及单composer点测留给root记录，不在这里提前勾选。

注意同步integration后未在root活动点测期间覆盖运行bundle：当前3097运行构建来源仍为 `10e1781 + .2元数据`，不能把随后同步的源码当成已加载/已验版本。最终冻结包必须重建并重新独立安装与验收；本票全部复选框仍保持未勾选。
