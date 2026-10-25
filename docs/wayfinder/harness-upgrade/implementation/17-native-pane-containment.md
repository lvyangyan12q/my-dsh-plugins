---
id: harness-rc3-native-pane-containment
title: 原生会话长路径焦点触发横向隐式滚动的工作台兼容
parent: harness-rc3-installed-acceptance
labels: [ready-for-agent]
status: in-progress
implementation_status: source-verified
acceptance_status: pending-new-archive-and-installed-cua
assignee: worktable-native-pane-clip
blocked_by: []
target: 0.2.1-rc.3
---

# Native 根容器溢出兼容 · 2026-10-25

## 实页问题

W.5/K.4 真实原生审批中出现长路径后，Native根 clientWidth1000、scrollWidth1190、scrollLeft190。内容body的marginLeft640和width360正确，但可视起点从应有920变成730，被左侧应用覆盖190。overflow:hidden仍是可编程滚动容器，focus可能推动该横向滚动。两轴原为hidden，单独x:clip会因CSS轴耦合重新计算成hidden，不能据内联x字段宣称修复。

## 最小兼容边界

工作台split在持有当前会话根期间，只租用该根的overflow-x和overflow-y两项，设clip!important；Native内层正文/代码滚动区域不改。根属性原内联值和优先级逐项保存，关闭、根替换（含脱离DOM的旧根）释放；同根重锚不把租用值保存成原值。重复释放无副作用，Native后来主动改写的对应属性保留。

不修改Native源码、私有Editor或正文节点，不增加MutationObserver，不读取/清零任何scroll offset，不改变会话/草稿/审批或模型状态。原冻结W.5及K.4不覆盖；后续应以新W.6/K.5组合验收。

## 已验证与尚未证明

- 实际client bundle锚点J在修改前红（旧9场景通过，J缺双轴clip），修改后10/10；验证挂载、同根重锚、detached旧根/新根替换和原样释放。
- 4项JSDOM样式lease回归纳入唯一pack源码清单：双轴/priority精确恢复、原样式表所有权、后来的Native属性修改、overflow shorthand；焦点/选区/草稿及inner scroll数值不变。
- 源码359项：357通过、0失败、2项既有旧环境检查跳过；构建及现有实际client factory的Native导航/窄屏焦点恢复、菜单离开/重开与标注回归通过。
- 这些DOM/样式字段测试不等于浏览器CSS计算或真实焦点滚动验证。

待root通过CUA在真实最终归档复验：双轴computed clip，长路径focus后root.scrollLeft0，body起点等于应用右边界，原生正文与审批按钮可用、内层竖滚/代码横滚正常、菜单/离开/关闭原样恢复。尚未pack或改3101，17/10保持开放。