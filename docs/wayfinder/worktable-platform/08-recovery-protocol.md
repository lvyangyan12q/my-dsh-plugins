# 08：持久所有权与恢复边界

本轮只修改派生 Worktable 和 Reading 的公开接入，不修改原生 DSH、上游 Worktable、运行目录或凭据。真实安装验收由独立 3091 实例执行，源码回归不能代替该验收。

## 状态归属

- 当前 profile 的 worktable-platform/applications.v1.json 保存网站登记、深度应用身份预留、实例、项目关联和视图。
- resources.v1.json 保存显式共享引用、授权版本和撤销状态；业务记录继续归应用的 StorageDomain。
- roles.v1.json 保存公共管理能力和角色会话引用；tasks.v1.json 保存准备任务和单次原生提交意图。
- 项目布局与浏览器偏好仍由现有 localStorage 管理。模块卸载不能重建实例；原生会话和轨迹仍由 DSH 持久化。没有清理浏览器存储或复制凭据的恢复路径。

## 单个文件的所有权

所有平台文件共用 ProfileFileStore。首次打开规范化真实路径，使用独占 <file>.lock 目录及带 PID、随机 token 的 owner.json。第二个存活所有者显式 owner-conflict。每次发布前验证 token；同一对象 close 幂等，排空已经接受的工作后才释放锁。释放先将自己的锁原子改名为 .released-token，再尽力清理改名后的目录；清理失败不会删除下一代所有者的锁。

只有有效 PID 被确认已退出时，才允许在独占 .lock.recovery 门闩中复核并将旧锁改名为 .stale-UUID。兼容识别旧版本的普通 .lock 文件及 {pid} 格式；不删除旧锁和业务记录。无效锁、无法验证 PID 或已有恢复门闩都会明确阻断，不能推断为可安全抢占。进程活着但 PID 已复用也会保守拒绝。多进程公开回归验证两个竞争恢复进程最多一个成为写者。

这是合作式唯一写者约束，不保证对绕开锁的外部程序提供原子 CAS。读取时记录原文件字节摘要，发布前发现已观察到的外部变更会报 storage-conflict；不能宣称阻止非合作程序在最后检查与 rename 之间写入。

## 发布与错误

状态与初始化标记都使用同目录独占临时文件，写入、sync、关闭、校验 owner，然后 rename；POSIX 还同步父目录，Windows 不声称额外目录 fsync。未发布失败保留原文件，报 storage-unavailable；发布后耐久未确认报 storage-uncertain，不自动重放。

初始化 .initialized 标记区分新 profile 与已初始化文件丢失。首次标记发布失败不会留下截断的有效标记；存储恢复后可普通重开。已初始化文件缺失、损坏 JSON、重复身份、无效关联或不支持的 schema 都阻断相关写入，保留源字节；不能用空列表覆盖。未知版本必须升级到兼容插件或恢复已验证副本后重试。

schema 仍为 1，业务字段与旧实例/视图/授权身份保持原形。新增 sidecar 是所有权和初始化元数据，可能保留 .stale-*、.released-* 或失败临时文件作为诊断；本轮不提供自动递归删除或自动修复损坏记录。

## 代际、排空与原生任务

HTTP 在进入时捕获当前 runtime，认证、正文解析和动作使用同一代。退出先阻止新请求，取消未完成正文，排空已入队工作，最后关闭状态 owner。正文有 15 秒读取期限，保留原 UTF-8 字节上限。退出期间旧请求返回 generation-changed，不能投递给新实例。清理各原生注册/业务域使用 allSettled，失败不会跳过后续清理；启动与清理同时失败保留合并诊断。

任务的准备、requestId、不可变 payload 与原生 sessionId 沿用 07。退出不会调用 Stop、复制会话或再次发送；native prompt 尚未结算时所有权保留，不能为加速退出而允许两个写者。冷启动看到 submitting 会显示 unknown，并沿历史 sessionId 查看与 Stop；accepted 只代表原生准入，不代表模型成功。Stop 只请求该原生会话当前回合，队列保留，既有写入不回滚。

SplitWorkspace 订阅外部布局状态后立即同步当前值，修复已选项目在覆盖层重挂时没有内容、重复点击无效的问题。同一 active project 重挂应恢复其保存视图，不能依赖切换到另一个项目触发通知。

## Reading 与升级边界

Reading 业务记录和版本继续走官方 StorageDomain；关闭排空业务队列和 HTTP 后，即使一个域关闭失败，也会处理另一个域，重复 dispose 不会关闭下一代对象。公开 SDK 没有暴露后端物理路径身份，因此本轮只支持单个官方 facility/domain 所有权；不支持两个独立 Host 共享任意同一个业务后端并发写入，不能借私有字段猜测目录。

07 旧版本不能理解 08 的目录锁，尤其进程终止留下的目录。回退到 07 是不兼容的负例，应明确阻断并保留全部状态与锁；不能自动删除 08 元数据以伪造成功。09 可使用 08 最终包作为兼容回退基线，并验证 07 负例。不得声称旧新版本可以并发占用同一 profile。

## 可复现辅助验证

Worktable 唯一发布命令 npm run pack 包含公开 applications/resources/roles/tasks、代际 HTTP、真实 React SplitWorkspace、两个真实进程竞争和故障恢复回归，并对最终 7 文件进行临时目录安装、导入、客户端工厂、保留布局导航、DOM 8 场景和目录解析 3 场景验收。

Reading 使用未改的官方 rc.2 StorageDomain 与实际页面回归，另外验证两个域都被清理。check-types.mjs 使用 DSH_SOURCE 指向官方运行目录，READING_LEGACY_ROOT 指向主仓库已有生成声明；该项仅为辅助类型检查，不是独立从零生成旧适配器声明，也不加载旧前台。最终 Reading 包须在另一临时目录安装、逐文件比对并导入，不能依赖该类型映射。
