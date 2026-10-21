# Worktable 深度应用SDK v1（10真实双应用验收冻结）

只描述公开接缝。第二应用Project Notes与Reading已共同完成10真实最终安装验收；历史04/05文档中的候选“待验”段是实施记录，最终通过范围见各自installed证据。以下不是完整搭建器、通用数据转换器或高级网页桥接交付。

## 消费入口与版本

`dsh-worktable/sdk` 是浏览器安全的ESM子路径，导出 `PROTOCOL_VERSION`、`describeProtocol()`、`requireProtocol(descriptor,requiredFeatures)` 及独立 `.d.ts`。类型包含ApplicationDefinition/ApplicationViewProps/ResourceOwner/CapabilityRef/RoleDefinition及服务接口，提供公开Cordis服务augmentation。应用不得import平台src、实现类、全局React变量或旧personal-workbench声明。

运行期helper应由应用bundler纳入自己的产物，示例Notes的build.mjs已这样做；不能把 `dsh-worktable/sdk` 留作ModuleLoader外部require并假设存在同名工厂。只有类型的import会被正常擦除。独立消费者类型检查须安装SDK及官方Cordis/React公共peer types，不使用legacy路径映射。目录snapshot/resolveView的Application是Deep|Web判别联合，访问views前先检查kind；ApplicationViewProps的application仅为Deep。

Host注入 `worktableProtocol` 后调用 `.describe()`；Client注入 `worktableApplicationViews` 后调用 `.describe()`。返回 `{protocolVersion:1,features:string[]}` 的独立副本。先 `requireProtocol(actual,required)`；未知协议、错误shape、缺required feature明确拒绝，探测不建实例、不创建Session、不读业务资料、不发送。只有既有接口并不表示权限已授予。

当前feature：`application-registration-v1`、`instance-view-v1`、`resource-reference-v1`、`instance-role-v1`、`application-private-capability-v1`、`prepared-task-v1`、`application-lifecycle-v1`。09已合入，生命周期feature对应实际setEnabled合同。产品0.6.0首次发布./sdk；09产品0.5.0没有该子路径，Notes peer最低0.6.0，独立安装须拒绝错误组合。包范围仅作安装前依赖门槛，运行仍需协议与feature检查，不能从版本或应用配置schema猜实际能力。框架协议、应用包version、应用配置settingsVersion、业务domain version与平台私有存储schema分开处理。

SDK扩展采取同协议新增可选feature、消费者按所需feature检查；不兼容的必需字段/语义变化需新协议或明确迁移。没有“假定所有未来版本兼容”的承诺。公共声明描述公开合同，不暴露内部存储锁或lifecycle数组给应用写入。

0.6.0公开SDK必需两项替代旧7文件约束，保持唯一Worktable `npm run pack` 的**精确9文件白名单**：LICENSE、README.md、cordis.patch.yml、dsh.plugin.json、lib/client.js、lib/index.js、lib/sdk.js、lib/sdk.d.ts、package.json（归档均加package/前缀）。不是宽松匹配lib目录，源码和map仍拒绝。原生皮肤、ModuleLoader握手、React/native external、独立安装逐字节比对/导入、工厂和导航/DOM锚点/目录回归门禁继续保留；不修改AGENTS.md。Notes自己的唯一pack另用精确5文件：README.md、cordis.patch.yml、lib/client.js、lib/index.js、package.json。

## 最小Host贡献

```ts
import type { Context } from '@deepseek-ai/cordis'
import { requireProtocol, type ApplicationDefinition } from 'dsh-worktable/sdk'
const application: ApplicationDefinition = {
  id: 'my-app', title: '我的应用', version: '0.1.0', protocolVersion: 1, kind: 'deep',
  views: [{ id: 'page', title: '完整页' }, { id: 'summary', title: '摘要' }],
}
export function apply(ctx: Context) {
  ctx.inject(['worktableApplications', 'worktableProtocol'], child => child.effect(async function* () {
    requireProtocol(child.worktableProtocol.describe(), ['application-registration-v1'])
    const withdraw = await child.worktableApplications.contribute(application)
    yield withdraw
  }, 'my-app definition'))
}
```

定义没有创建实例的副作用；用户显式新建，重复继续保留instance/view身份。完整page必需；重复ID、网页/深度身份冲突或未知协议拒绝。撤销定义使其不可用，不删业务/实例/原生历史。实例是业务身份，view是显示身份；projectId可为null，明确关联不能搬资料或重建Session。

## Client与状态

```tsx
import type { ApplicationViewProps } from 'dsh-worktable/sdk'
function Page({instance,view}: ApplicationViewProps) { /* 应用自己的有界UI/订阅 */ }
// 在可选注入的child effect内：
requireProtocol(child.worktableApplicationViews.describe(), ['instance-view-v1'])
const remove=child.worktableApplicationViews.register('my-app',{page:Page,summary:Summary})
// effect释放时先撤销，再释放应用自己的store/订阅；不Stop、不删业务记录。
```

这些不是可直接复制执行的完整产品代码，Summary由应用实现。平台提供通用角色/任务面板和布局承载，**没有已发布的通用Stats/List/Detail React组件库**。两个应用复用同一平台合同，不冒称复用了不存在的统计组件。业务state/store及专用组件归应用，Host业务记录与浏览器展示偏好分开。同实例视图订阅同owner；原生composer唯一，不在模块另造聊天。

`ApplicationViewProps` 是显式application/instance/view及可选roles/tasks。应用自行检查晚响应归属和释放代际；跨浏览器没有默认实时推送。旧编辑表单固定开始时的业务revision，刷新不能把旧稿升级成最新可覆盖稿。

## 资源与任务

`worktableResources.register(ResourceOwner)` 注册appId/resourceId/actions/read/mutate，及可选taskContext/withTaskLease。action稳定有界，read不是可授予写动作。Host从登记deep view推导consumer；HTTP不得传任意owner实例，Operator认证不是跨实例授权。

认证POST `/api/worktable/resources` 的 `operation:'call'` 仅传viewId/resourceId/action/payload/expectedRevision/expectedConnectionRevision；owner验证业务schema与revision，在队列及最后持久写前await authorize。写已提交但权限随后改变可能返回committed:true/value:null，必须清楚反馈，不自动重试或发布迟到数据。

共享管理snapshot/share/permissions/revoke是显式平台管理动作；默认只读，引用不复制整库，撤销挡后续访问、不删除进入原生历史的资料。未知resource/schema不能当成自有记录，若应用只支持自己schema就明确拒绝；一般资源目录不等于全业务自动适配。

`tasks.prepare({roleId,text,contexts:[{resourceId,selection}]})` 已绑定当前view。selection只是有界引用，Host owner重新解释为title/text，固定owner/grant/业务revision指纹；准备和发送均复验。每组16000字符、共8组/32000字符，selection4096字符，正文24000字符；应用可更小。edit可修改展示文字/移除原上下文，不能扩大授权。

owner的 `withTaskLease(operation)` 是稳定闭包，同一业务写队列中的资源必须复用相同函数身份，不依赖this。lease包住最后检查、耐久intent及一次native prompt准入，不等待模型完成，不能在lease里再等待自己队列。平台准入gate复验角色替换、授权与来源实例改变；旧prepared需重新准备。

显式TaskPanel submit才发送一次，固定requestId和历史Session；unknown无自动重放、无备用通道。Task历史open/Stop不通过当前角色替代会话。Stop是会话当前回合，保留排队消息，不是取消某个历史request或回滚写入。实际控制沿平台配置的既有导航marker，应用不复制私有导航代码。

## 角色和能力来源

`worktableRoles.contribute(appId,RoleDefinition[])` 的creation.cwd须为原生已登记Workspace绝对路径，角色按instance+roleId绑定。读取/打开与ensure/retry/replace分开；只有明确手势创建/替换。公共managed记录仅来自管理入口；应用不得把任意原生Preset/文件Skill伪造成公共目录。

私有能力通过 `worktableCapabilities.contribute(appId,PrivateCapability[])` 只贡献owner目录，**不代装原生能力**。应用负责原生公开注册/精确provider/自己持有的disposer；同名native first-wins时不能冒领或移除别人的winner。平台引用私有项必须 `source:'application',ownerAppId:appId`；原生可信插件运行环境不是恶意代码沙箱。

角色Skills的引用验证包括实际Agent scope/provider/complete/modelInvocable；用户直接调用检查userInvocable。**引用验证不是模型已加载的证明，也不会自动把所有引用拼进persona。** 应用任务可显式请求加载，实际tool-skill轨迹仍须最终实页验证。缺公共或私有能力显示原因，禁止换Agent/通道继续。

Project Notes例子：managedAgentId/managedSkillId/roleWorkspace默认空，由用户在原生“插件”→Project Notes→project-notes行“配置”明确填写并保存；私有project-notes-format由应用注册、model-only、provider project-notes。公共能力可以跨应用复用，但原生历史按实例隔离。项目便签不自动回写AI回复。

## 必须拒绝的反例

- app要求协议2、缺prepared-task feature或客户端无describe：明确兼容错误，不按版本号猜测/降权绕过。
- 普通网页传view/app/owner ID请求原生上下文；深度请求夹带任意instanceId；无grant写或已撤销引用：拒绝，不隐藏UI冒充授权。
- Reading记录/未知schema伪装便签响应，或返回owner/consumer不匹配：拒绝，不复制/重标到当前实例。
- agent未显式配置、Skill provider冲突/model调用禁用、cwd未登记：角色不可用，业务浏览可保留，不偷偷ensure其他Session。
- 角色更换/资料变化后继续旧prepared，或unknown/重启遗留intent自动重发：拒绝/保留unknown，历史仍可查看。
- 关闭视图、卸载订阅或注销贡献时删除业务表/Stop；后台刷新覆盖旧编辑版本：不允许。

## 生命周期与证据

已合入[09最终合同](../09-lifecycle-protocol.md)：描述符enabled/lifecycleRevision，`setEnabled(appId,enabled,expectedRevision)`返回 `{appId,enabled,revision}`，陈旧版本拒绝。SDK保持该方法可选以便调用方检测feature及方法存在；不把内部schema写入权交给应用。停用阻止新实例/prepare/尚未准入submit及角色新建/替换，保留既有原生控制和旧task/role身份交接；组件缺失也不改历史Session。平台应用配置只有显式停用时schema2、全部显式启用后才回schema1，应用不直接读写它。无业务域迁移。

原生plugin-manager没有live卸载否决hook，平台不能声称拦住直接停用/移除。卸载应用前利用平台交接目录处理原生问题/审批/Stop；整个Worktable被移除时仍可使用原生会话列表和控制。清单不是任务已完成/安全交接的证明。09真实安装/失败降版/兼容回退证据只证明09组合，不能代替包含Notes/SDK的10实页验收。08持久所有权/排空及进程终止后原生TOOL_OUTCOME_UNKNOWN边界继续适用，不重建未恢复的pending问题，业务Domain不承诺任意多Host共享backend写。

10辅助测试使用公开服务/真实React/官方StorageDomain与SkillRegistry；native prompt故障及准入并发是系统边界受控替身，不等于真实模型执行。最终独立包安装、精确文件/类型消费、两个应用同时运行、应用私有与managed Skill真实加载、实例隔离/恢复已由root在3091验收，见下方最终证据。仅冻结本合同声明的v1范围，完整framework spec仍OPEN，待11最终验收。

10发布前发现Windows死所有者回收目录rename可瞬态EPERM，使两个竞争者本次均拒绝（未发生双写）。本阶段最薄修复仅Win32、仅dead-lock→stale的EPERM/EBUSY：持回收门闩进行10/25/50ms有界等待，最多4次，每次复验门闩token/PID与旧锁格式/token/PID且PID仍dead；EACCES、未知、换代立即拒绝，永久失败保留原锁与业务字节并释放自己的门闩。确定性公开fs.rename故障RED→GREEN及200轮真实directory/legacy双进程竞争均保持恰一个owner、下一次acquire和原字节。故障句柄来源未确定，不能归因为某个进程；这不是放松保守PID复用拒绝或自动重放业务操作。

真实安装发现仅导出普通Config不会自动生成原生表单。Notes0.1.1新增官方plugins.row.config页面，使用原生传入ConfigPageForm一次提交三个路径与编辑起点revision；只有该三个字段为volatile，Host读取get并处理loader/volatile-update，序列更新本应用角色声明，不重挂业务Domain、不ensure或替换已有Session。Settings→内置插件仍是只读清单。配置页失败保留草稿，未知settingsVersion保留原fail-closed门禁。更正包与官方配置链路辅助证据见[evidence/10-config-prepared.json](evidence/10-config-prepared.json)，保留为辅助过程记录；真实表单及Skill结果见下方最终证据。

## 2026-10-20 最终冻结范围与实测边界

最终源码 `4e7df6f830b7096f2a8a41738ccd17b30900278a`、Worktable0.6.0 SHA256 `bb645b7cc3afd3e9919ab5f0ee570ea04296c2fe4b4294bbc4e5032f79aa8aa9`、Notes0.1.1 SHA256 `adb9271b63828a8614efb6d44435564dc5d7b0f9bc3390a9e6e6a50cc66abe0d` 经官方CLI精确9/5安装、真实双应用与独立复审后批准保护合入。[最终实际记录](evidence/10-installed.json)与[关闭说明](10-protocol.md)为本版冻结依据。

实际原生行配置保存不创建Session或任务；N1显式发送后，原生轨迹同时加载project-notes provider的私有Skill及worktable-managed provider的公共Skill，所选便签整理不自动写业务。N2为独立空Session；冷启动、Notes贡献开关与历史交接保持业务hash/身份/原生计数。旧0.1.0缺配置页的实际失败及0.1.1修复保留，不用辅助测试覆盖真实缺口。

Notes额外跨实例共享案例被自动审核在变更前拒绝，具体用户授权仍待提供，未建grant、未宣称通过；05 Reading共享主验收已过。普通网页、通用schema适配/组件库、任意多Host业务backend均不在本版承诺。两项原生菜单/项目导航缺陷交11修复，最终UI及Standards/Spec两轴审查仍待11，以用户指定485b38c基线执行；完整framework spec保持OPEN。


## 13后续候选：可选公共展示（尚待实际安装验收）

`dsh-worktable/sdk`新增`createPresentation(React)`及可选feature `presentation-components-v1`。应用bundler继续内联SDK，显式传入自己使用的React模块；SDK顶层没有React import、全局React、Host服务或网络副作用，服务端import仍安全。保持精确9文件与同一./sdk入口，无新增ModuleLoader外部依赖。

返回`Surface`、`State`、`Stats`、`List`、`Detail`、`Filters`。全部只消费调用者props；无fetch、数据目录、跨实例状态、授权或Session。数据与筛选、选中值仍由应用owner决定；展示控件的回调不等于资源写权限。

- `Stats`：`records`及`metrics[{id,label,aggregate:'count'|'sum'|'average',field?}]`。仅使用有限number，不把数字字符串当业务数值；缺失/溢出显示“未提供”，未知聚合或缺必需映射明确错误。
- `List`：`records`及`mapping{id,title,description?,selectionLabel?}`，`selectedId/onSelect(id)`受控；标识缺失或重复拒绝渲染可选行。字段名为直属字段，不解释路径或执行表达式。
- `Detail`：`record`及`fields[{field,label}]`；缺失字段显示“未提供”，对象不序列化为HTML或执行。
- `Filters`：`fields[{id,label,maxLength?,options?:[{value,label}]}]`及`values/onChange(values)`。控件只提交受控值；业务过滤仍由调用者执行，不替应用猜分类或数据范围。
- `State`或各数据控件的`phase:'loading'|'ready'|'error'`、`error/onRetry`和空态：错误/加载不展示上一次records伪装成功。
- `Surface`：可选`theme:'inherit'|'light'|'dark'`，只作用本section；控件采用局部网格/换行、minWidth与长文本换行，无全局CSS或原生皮肤覆盖。真实浏览器窄屏几何与深浅色最终以13安装证据为准。

Reading的page/stats/list与Notes的page/summary已作为源码消费者接入；两者仍拥有原数据、共享撤销处理、偏好、任务上下文及写入规则。无personal-workbench运行导入，也不要求独立应用转换为配方。当前为后续候选，不能反向扩大01—11不可变证据。
