---
id: worktable-framework-14
title: 模块内编辑与模板搭建
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: continuation_authoring
blocked_by: [worktable-framework-12, worktable-framework-13]
---

# 14: 模块内编辑与模板搭建

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

沿现有项目布局和窗格配置实现组合应用草稿编辑、模板选择、页面与模块配置、资源/角色绑定、预览和显式启用；保留网站/原生会话/资源/动画/自定义内容承载。简化入口/视图标签与错误文案，身份详情折叠；不新增第二套窗口或聊天。

## Acceptance

- [ ] 已确认模块内UI用户流程；从空项目新建→模块配置→预览→启用→改草稿，运行版本和Session身份稳定，键盘/窄屏可操作。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

- [12](12-composed-authoring.md)
- [13](13-presentation.md)

## 2026-10-21源码实施（真实安装UI待验，保持open）

- 窗格空态新增组合应用/模板，应用目录可继续草稿；Editor在当前模块卡片内选类型/来源/映射/角色/主题，保存、预览和显式启用分离。composition:true走同一DeepApplicationView/实例模型的通用renderer，复用原RolePanel/TaskPanel，保留原窗格网页/动画/资源/终端/自定义入口。
- 新公开composition-state-v1：state-read/state-save由已登记consumer view推导instance，按稳定connectionId或moduleId作用域共享筛选/选择；OCC、冷恢复、未知view/scope拒绝。首次状态写入才用applications schema4；schema1/2/3继续读，旧0.8不支持4应拒绝而非覆盖。配置保存/停用后保持schema4，未移动业务数据。
- 资源catalog只返回登记owner/view/resource标识和可选ResourceDescriptor(title/recordsField)，不读业务记录或建grant。未声明元数据者只显示引用标识，手工配置记录字段，不猜应用schema。运行请求以当前consumer view调用resource，复验grant consumer与所选来源所属实例匹配；缺权限时由用户显式read-share，未授写权。模块筛选在卡片中编辑并显式应用，同实例其余视图刷新同一Host状态。
- website保留sandbox/no-referrer与外部打开；custom仅载入用户选定既有HTML为opaque srcDoc（allow-scripts且无same-origin）；animation实际图片/GIF/video；resources卡片内真实目录/文件列表与局部导航；conversation显示绑定事实并显式创建/打开同一原生会话，无另建输入框。AI生成/追改、附件和完整内嵌标题栏不由此票宣称完成。
- 公开copyCompositionTemplate只复制结构/展示映射，清除connections、roles、运行身份、HTML/URL与路径。稳定page/module/instance/view保持；旧异步preview不能覆盖后来目标；后端先存后发布。已登记合法70字符资源与公共Agent引用通过实际owner/能力校验，组合自身id仍64，外部引用沿80字符合同。
- 折叠原生侧栏时插件自身创建项目/自定义布局弹窗提到rail/wide共享分支，不改原生/强展开；窄屏尺寸钳制，组合输入Escape不关闭。自动composition事件仅辅助，未新增物理IME通过声明。

### RED/GREEN与当前验证范围

1. 公开CompositionDirectory state-read缺方法RED→同实例两view共享/跨项目隔离/OCC/冷恢复GREEN。
2. SDK模板复制缺函数RED→去权限/路径/原生身份与feature GREEN。
3. 实际客户端工厂折叠菜单点击添加项目不渲染RED→共享插件弹窗GREEN，并验证组合Escape不关闭、正常Escape关闭。
4. 模块Editor缺入口RED→模块原位网站配置/保存/preview无启用/显式启用GREEN；迟到旧app preview可覆盖新app先RED→代际复验GREEN。
5. 合法长外部资源引用被误拒绝RED→沿公开80字符身份及真实资源/公共Agent依赖校验GREEN。
6. 实际bundle factory曾因顶层createPresentation在求值阶段触发React要求而RED；改为实际组件挂载才惰性初始化控制组件，严格ModuleLoader/external门禁GREEN，未放宽门禁。

npm ci按锁安装58项；源码全部204项GREEN、零skip（WORKTABLE_NATIVE_RC2_ROOT指向独立未经补丁rc.2源码，首轮2项未设该变量的skip不计已验，正确变量复跑后均执行）。开发bundle build/check、实际工厂、现有project-navigation-installed及collapsed-project回归通过。这些是源码/模拟原生DOM辅助证据，未打包/部署/重启3091/改3080，正式UI仍由root最终唯一pack安装后验收。新版本候选曾预留0.8.1；如18先冻结0.8.2，按集成最终分配更高版本，冻结资产不覆盖。

唯一pack门禁新增12的compositions/composition-http、16的storage-refusal-http及14公开state/template/source/reference/editor/runtime测试；collapsed-project针对安装后的最终bundle追加门禁，不以源码字符串测试数组。完整framework spec与15/17/19保持原未验范围。

2026-10-21合并18：集成4ae55729d43a581413bb1cc31d8839c549e0f188已合入本工单分支，冲突按双方已验证意图保留schema4实例状态与readiness、CompositionView与MigrationPanel、SDK可选features及全部pack门禁。统一候选0.8.3；0.8.1/0.8.2均未由本分支打包或冻结，既有0.8.0不覆盖。合并后仅补实际冲突涉及的46项应用/资源/SDK/组合/迁移回归，全部通过且零skip；build/check、真实工厂求值与折叠菜单/中文组合Escape、现有导航窄屏标注回调通过。未重复声称204源码全量属于新合并版，未pack或部署，14/18仍待root最终产物实际用户流程。
