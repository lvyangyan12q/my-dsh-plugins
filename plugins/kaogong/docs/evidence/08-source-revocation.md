# .4 撤销来源后的自有记录修复

真实 .3 浏览器复现：撤销共享题库后，dashboard/errors 在来源预读阶段 403；自己的评分与历史文件未丢失，但页面无法读取。

production Host 回归先复现已提交轮次 read 403。现仅识别明确 StudySourceRevoked 错误：dashboard 返回 unavailableSources 并保留自有统计；errors/history 不依赖共享题库；read/submit/reflection 在撤销时先检查当前所属档案轮次已评分，未知和未提交轮次拒绝。新发题、源资源及图片读取仍保留授权门禁，已交相同答案重交幂等、异答拒绝。撤销后不创建外部显示投影，不修改旧快照。

已验证 Host 66、client 40 + integration 5、Host/client 官方声明、构建通过。公开 HTTP 覆盖新题/未交拒绝、自有已交成绩与错误历史/订正、重复提交、跨档案、恢复授权；真实 Native role 工具验证已交读取及普通 Session/另档案拒绝。模型写工具仍需要学习者页面，不新增模型确认权限。UI 来源撤销提示先红后绿。

新版本计划 0.4.0-alpha.3.4，旧候选不可覆盖。准确包门禁与实装结果待补。

材料撤销复审补充：route/recall 对明确撤销仅使用自有资料与已存队列；GET 不再暴露已撤销共享参考文本，返回 referenceChanged；无参考时 reveal/confirm 拒绝。knowledge/document 新读取仍严格拒绝，恢复授权延续原 cycle。公开 Host 红绿测试和独立 delta 复审通过。

0.4.0-alpha.3.4 已冻结，源码 afb2f2a，SHA256 `4c072cf2336e73b31e67e9aa170a58dd3a45532a2b482511e0506af3f948e57f`。完整 pack 门禁：Host 66、client 40 + integration 5、domain 21、artifact 1、构建及双声明、官方 CLI 无 Worktable 独立安装/Scope 身份通过。准确包实装与业务文件保护验证由 08 后续执行，此处不声称已完成。
