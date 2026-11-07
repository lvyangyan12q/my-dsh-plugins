# 07 安全边界：只读服务器与不自动合入

Type: grilling
Status: resolved
Blocked by: —

## Question

哪些边界是硬的，靠什么强制执行：

- 服务器侧只读：只允许 `hostname` / `docker ps` / `docker inspect` / `docker logs` / 只读文件查看；用 `ssh-connect` skill + 包装脚本白名单，还是只靠提示词？
- 明文密码：bug 描述里有服务器密码，提示词、日志、artifact 怎么脱敏？哪些字段根本不进会话？
- 本地：修复只落新分支；不自动合入、不自动 commit 到基线；仓库脏时拒绝还是 stash？
- 权限 preset：会话用什么权限跑（workspace-write / 其他）？SSH 出网是否受沙箱限制？
- 失败与越权：agent 尝试禁止操作时，窗口3 / 审核会话怎么发现并提示。

## Answer

决策已并入 [窗口3 规格](../spec.md)：服务器只读用 `ssh-connect` + 只读 SSH 包装脚本白名单；密码/令牌在 prompt、日志、产物、对话镜像里脱敏；修复只落本地新分支；审核会话 read-only sandbox；不自动合入、不重启服务；桥只接受 `allowedRoots` 内的绝对路径。只读 sandbox 的实际运行约束并入 09 验收。
