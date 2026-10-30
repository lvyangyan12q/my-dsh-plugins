# 目录与资料迁移约定

目标根为插件目录。真实旧来源为 D:/programming/workspace/my-dsh/materials/kaogong；D:/programming/workspace/kaogong 是指向它的junction，只盘点一次真实树，不递归复制链接目标两次。

## 资料目标
materials/保留讲义、题目、讲义_text、题目_text、题目_images、storage/mineru相对布局；materials/source-home/storages只接收原题库和知识库元数据快照；materials/manifests保存路径/字节/哈希/引用/迁移状态。
原生home凭据、Session、运行数据库与既有老师cwd留原位，不与资料文件混搬。
先更新Git忽略和npm发布白名单；materials/、archive/local/均不进入远程和发行包，历史已公开文档放archive/docs。

## 过程
1. 清点真实路径/links/文件种类/哈希/引用/占用和磁盘容量，形成可核验清单。
2. 备份并复制资料至新根，逐文件核哈希，不改原题/答案/评分快照；示例data不是原题库，不冒充真实数据。
3. 核查正式配置、题图索引、PDF源路径、MinerU manifests和已apply资料证明；无接入证明时更新明确配置并验证预览；有则用精确位置映射/回执接管，旧proof保留，禁止全局字符串替换。
4. 验证题目、原文、图片/表格、PDF、解析结果及练习评分。未验证前原址保持可用。
5. 切换引用后再归档/删除无剩余引用的旧副本。唯一/未知文件归archive/local，旧源码/角色/独有脚本先归档。有效发行/回退包保持不可变且保留有效路径。
6. 旧外部junction仅非递归移除。依赖、编译、临时缓存须确认可重建/无任务/不含独有产物后清理。

## 文档
现行spec与tickets以本目录为准。旧考公专属材料移archive/docs并保留编号/状态/版本，原址留迁移指引；共享Worktable/Harness文件不整体迁走。用户既有未提交文件保持原样。

## 证明与恢复
记录old logical/real path、new path、bytes、SHA256、被谁引用、处理结论。对已接入元数据先做预览与冲突检查，未知状态保留，不能重复导入/重复发送。
停机前保存当前表单/未交卷轮次，核对Native在用状态；只处理目标实例，不中断不相关会话。新位置读验失败时恢复配置指向仍保留的旧原件，不整库覆盖新学习。
