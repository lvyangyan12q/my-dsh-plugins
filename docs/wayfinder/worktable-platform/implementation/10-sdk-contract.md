# Worktable 深度应用SDK v1（10候选，待真实双应用验收冻结）

只描述公开接缝。当前第二应用Project Notes与Reading共同验证，10尚未通过真实最终安装；历史04/05文档中的候选“待验”段是实施记录，最终通过范围见各自installed证据。以下不是完整搭建器、通用数据转换器或高级网页桥接交付。

## 消费入口与版本

`dsh-worktable/sdk` 是浏览器安全的ESM子路径，导出 `PROTOCOL_VERSION`、`describeProtocol()`、`requireProtocol(descriptor,requiredFeatures)` 及独立 `.d.ts`。类型包含ApplicationDefinition/ApplicationViewProps/ResourceOwner/CapabilityRef/RoleDefinition及服务接口，提供公开Cordis服务augmentation。应用不得import平台src、实现类、全局React变量或旧personal-workbench声明。

运行期helper应由应用bundler纳入自己的产物，示例Notes的build.mjs已这样做；不能把 `dsh-worktable/sdk` 留作ModuleLoader外部require并假设存在同名工厂。只有类型的import会被正常擦除。独立消费者类型检查须安装SDK及官方Cordis/React公共peer types，不使用legacy路径映射。目录snapshot/resolveView的Application是Deep|Web判别联合，访问views前先检查kind；ApplicationViewProps的application仅为Deep。

Host注入 `worktableProtocol` 后调用 `.describe()`；Client注入 `worktableApplicationViews` 后调用 `.describe()`。返回 `{protocolVersion:1,features:string[]}` 的独立副本。先 `requireProtocol(actual,required)`；未知协议、错误shape、缺required feature明确拒绝，探测不建实例、不创建Session、不读业务资料、不发送。只有既有接口并不表示权限已授予。

当前feature：`application-registration-v1`、`instance-view-v1`、`resource-reference-v1`、`instance-role-v1`、`application-private-capability-v1`、`prepared-task-v1`。应用生命周期feature须等09实际实现合入后按合同补充，不凭包版本或应用配置schema猜能力。框架协议、应用包version、应用配置settingsVersion、业务domain version与平台私有存储schema分开处理。

SDK扩展采取同协议新增可选feature、消费者按所需feature检查；不兼容的必需字段/语义变化需新协议或明确迁移。没有“假定所有未来版本兼容”的承诺。公共声明描述公开合同，不暴露内部存储锁或lifecycle数组给应用写入。

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

Project Notes例子：managedAgentId/managedSkillId/roleWorkspace默认空，由用户在原生插件配置明确填写；私有project-notes-format由应用注册、model-only、provider project-notes。公共能力可以跨应用复用，但原生历史按实例隔离。项目便签不自动回写AI回复。

## 必须拒绝的反例

- app要求协议2、缺prepared-task feature或客户端无describe：明确兼容错误，不按版本号猜测/降权绕过。
- 普通网页传view/app/owner ID请求原生上下文；深度请求夹带任意instanceId；无grant写或已撤销引用：拒绝，不隐藏UI冒充授权。
- Reading记录/未知schema伪装便签响应，或返回owner/consumer不匹配：拒绝，不复制/重标到当前实例。
- agent未显式配置、Skill provider冲突/model调用禁用、cwd未登记：角色不可用，业务浏览可保留，不偷偷ensure其他Session。
- 角色更换/资料变化后继续旧prepared，或unknown/重启遗留intent自动重发：拒绝/保留unknown，历史仍可查看。
- 关闭视图、卸载订阅或注销贡献时删除业务表/Stop；后台刷新覆盖旧编辑版本：不允许。

## 生命周期与证据

09的公开enabled/lifecycleRevision/setEnabled及历史handoff语义由09最终合同承接；不把内部schema写入权交给应用。停用阻止新实例/新任务，保留既有原生控制；移除插件前需有序交接。08持久所有权/排空和原生未知结果边界继续适用，业务Domain不承诺任意多Host共享backend写。

10辅助测试使用公开服务/真实React/官方StorageDomain与SkillRegistry；native prompt故障及准入并发是系统边界受控替身，不等于真实模型执行。最终独立包安装、精确文件/类型消费、两个应用同时运行、应用私有与managed Skill真实加载、实例隔离/恢复由root验收。未完成前本合同仍候选，不关闭10或完整framework spec。
