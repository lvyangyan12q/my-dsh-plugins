---
id: worktable-framework-06
title: 角色会话隔离与能力复用
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: role_capabilities
blocked_by: [worktable-framework-04]
---

# 06: 角色会话隔离与能力复用

**What to build:** 应用实例的角色通过稳定身份关联原生会话，读取/创建/重试/替换语义分开。

**Blocked by:** [深度应用接入与同实例多视图](04-deep-views.md)。

**Status:** closed

- [x] 应用实例的角色通过稳定身份关联原生会话，读取/创建/重试/替换语义分开。
- [x] 重复和真实并发创建收敛到同一角色绑定；不同项目或实例默认隔离，替换保留旧历史并需明确操作。
- [x] 公共Agent/Skills可供应用复用；应用私有能力保持所有权，教学专用逻辑不成为所有应用的必选接口。
- [x] 禁用、缺失或不可调用能力明确反馈，不自动替换Agent、不新建Session掩盖失败。
- [x] 原生会话可重新打开并查看历史；未发送文字、编辑器归属不跨实例混用。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。

## 2026-10-19 实施准备与辅助证据（不关单）

role_capabilities工作树从集成ed6ca9dda80523ea735c3e1b9260e86cfbc1005d干净起步。按已确认role lifecycle / capability provenance / rc.2 native adapter / passive role panel公开边界逐片RED→GREEN：首次缺失模块；显式retry/replace/attach尚未实现；公共管理目录尚未实现；native adapter尚未实现；React role panel尚未实现（先补齐lockfile依赖，再确认缺失目标模块的RED）；ensure错误忽略Agent更换选择的真实断言RED，修复后GREEN。

`npm run test:roles`覆盖10项行为：只读零创建与真实Promise并发收敛、实例隔离和关联项目保留Session、intent跨重开同ID retry、revision guard与replace历史、反向current/history ownership、显式Agent替换语义、真实临时文件系统导致ready提交失败仍按同intent恢复、intent写失败零native create和第二Host owner拒绝、公共管理来源/私有owner/停用、rc.2显式Workspace+预分配ID+flush、角色面板只读/同ID原生导航/卸载不Stop、resolve原生复验期间replace不得超越。测试中的native authority是受控边界，不作为真实模型或正式Host验收。

交付入口仍仅 `01_content/npm run pack`，新增role回归纳入该门禁。真实UI操作由主验收Host进行：应用目录打开Agent/Skills管理，建立reading-helper；阅读应用视图展开应用角色，首次若应用声明的cwd未登记原生Workspace明确拒绝且无Session创建；用户显式登记该工作区后创建；多视图重开同ID、跨实例不同ID、重启恢复空白Session、未发送草稿恢复及替换历史、停用拒绝逐项实页核实后才可勾选。

当前06不包含发送、上下文准备、审批或Stop；没有嵌入composer，原生导航继续使用唯一原生输入席位。未验证跨浏览器文本协作、原personal-workbench记录迁移。没有修改正式原生DSH、3080、旧Worktable及旧数据。

### 独立复审修正，未提前验收

ready gate、Skill实际调用许可、显式最小原生基础能力与旧Agent不增权兼容已分别出现公开行为断言RED并修复GREEN。管理UI追加显式基础能力选择，保留旧reading-helper指令/ID/关联；旧记录须用户保存后才可作为角色Agent使用。新增官方rc.2源码契约测试（非mock register），运行时公开compositionInventory检查真实激活模块。最终新包证据随后以06-prepared.json为准；已安装旧候选不会据此关闭工单。真实文件执行/提问/审批仍待07主Host验收。

### restore P1修正（续工，不关单）

公开mountRoles lifecycle + HTTP测试真实复现诊断等待Host-settle造成owner无法provide的RED；register-only逐项恢复后GREEN。坏Agent仍可列出原数据、明确显示原因并显式修复/停用；保存及rollback双失败、同名私有能力隔离、原生register返回broken后显式validate诊断均已覆盖。管理UI原因显示、Skill上下文失败不全局污染分别RED→GREEN。启动恢复不诊断、不改旧管理记录、不自动增权。新增测试纳入唯一pack门禁；真实Host/模型验收仍交由root。

### 与已验收05合并的候选（不关闭06）

角色分支已合入集成54b68960db4c2097ed0e6e2ad4035c41e4b8e7b6。唯一冲突为release-prep测试名单，取05资料授权与06角色回归并集；无生产行为冲突。combined pack140/140、0skip，精确7文件和独立安装/产物门禁通过；reading源码与已验收05完全一致，公开owner与React UI5项回归通过。独立review追加角色19项、资源5项与互操作probe通过；仅修正06测试一行LF格式，无产品包变更。最终包证据见06-combined-prepared.json。

已读取root的05安装实页证据，但它不代替06实页验收。后续由root安装combined候选验证真实角色、原生草稿/重启/替换历史；本实现者未启动Host、浏览器或模型，未合主线，06继续in-progress。

### 原生配置完整性修正（06实页尚未完成）

root在combined741f真实安装中显式升级旧Agent失败；诊断候选3d5e返回5模块enabled=true、无fiberState，原生broken准确指向tool-fs-search的sampleOverCapGlobResults必选配置缺失。失败代整体未挂载，inventory退回声明行；不能把无state解释成可绕过的延迟激活。旧管理记录和角色0保留。

最小修复仅给workspace-basic-v1的dsh-tool-fs-search显式配置sampleOverCapGlobResults=false，与官方standard一致。新增测试逐一调用官方rc.2五模块真实Config schema：修前出现相同required错误RED，修后全部GREEN，省略该值的负向控制仍拒绝。仅声明形状测试不能替代插件Config完整性检查。原生ACTIVE/诊断、来源、调用许可等门禁保持；后续由root重新安装验证真实保存和角色路径。

### 角色原生导航保留工作台布局（待root续草稿实页）

root在884b实际完成旧Agent显式升级、同实例两视图同Session、A并发ensure收敛、C冷重启同ID重开；随后发现“打开原生对话”被既有session联动当成外部切换而关闭Worktable。修复仅在角色导航回调中复用现有markPluginSessionOpen后再openHostSession，不更改native或项目binding。源码与旧最终产物的真实回调/helper/sync函数均出现close=1的相同RED；补标记后源码GREEN。回归同时检查项目/布局/实例view对象身份、binding保持和普通手动导航仍可关闭，标记一次消费。唯一pack入口会再次对独立安装产物执行这段接线/函数回归；它不代替root最终浏览器草稿验收。

## 2026-10-19 最终安装验收与独立复审（关闭06）

最终实现 `f37ab1c083016295f807d852fdb48b8e3e5cec13` 经独立复审及 root 精确批准守护合入。工作台双包 SHA-256 `09ad25544ce8cc7e8baeba0a8133a162bcdae66ae7ac8c7aee498b14793f3458`，由官方 CLI 安装至隔离3091并核对最终7文件；阅读沿用已验收05的 `07e6193925911a177f03e9bbb6367375f77383ea6f6af09bfb7fefc2d1d90c10`。以[最终实页记录](evidence/06-installed.json)为本轮关闭依据；上文准备候选和失败诊断仅保留过程证据。

真实阅读资料保持。角色初次读取无Session；工作目录未登记时创建明确拒绝且耐久绑定仍为0，用户显式登记已有工作目录后再创建。旧reading-helper保留身份、指令与Skill，显式选择基础能力保存成功；同实例两视图共用C角色，A的两个真实并发ensure收敛同ID，A/C独立。未发送任何角色消息即冷重启，原空白会话可恢复并显示正确Agent和模型。A/C分别保留未发送草稿，切换不串位；Skill停用明确阻止使用，恢复后沿同绑定继续，未静默换Agent。

导航复用既有插件切换标记后，真实原生打开和历史打开保持Worktable分栏、项目及视图身份。Chrome D实际取消替换保留旧ID，接受替换产生新ID并保留历史；历史按钮打开旧会话而不改变当前绑定，页面保持唯一原生可编辑composer。IAB确认框先阻塞自动化，随后用户明确点击“确认”；Host实读C为revision4的新绑定，打开当前会话为空输入，打开旧历史恢复原C草稿，分栏保持且A/D绑定未变。该用户确认后的事实与Chrome D取消/接受分别记录，未重放IAB请求或声称此前自动化未阻塞。

独立复审补齐intent就绪、私有owner与管理来源、模型Skill许可、restore可修复诊断及回滚、上下文隔离、真实官方插件Config必填校验。检索配置缺失由实际Host诊断与官方compiled Config复现定位，仅补公开必填值，未放松原生激活门禁。唯一pack入口143项回归及独立安装导航产物门禁通过；reviewer另外离线安装最终tgz并运行安装lib/client.js导航回归，通过布局/视图/binding保持、标记消费与普通手动导航行为断言。资料授权与角色互操作仍不共享会话身份。

本工单角色消息数为0；任务上下文、模型执行、问题、审批和Stop由07另行验收。未承诺跨浏览器草稿实时协作、完整多进程恢复或旧personal-workbench记录迁移。六个历史改动文件受guard保护，原生与原Worktable前后快照保持，未改正式3080或远端。07由root领取，本次仅关闭06。
