# .4 撤销来源后的自有记录修复

真实 .3 浏览器复现：撤销共享题库后，dashboard/errors 在来源预读阶段 403；自己的评分与历史文件未丢失，但页面无法读取。

production Host 回归先复现已提交轮次 read 403。现仅识别明确 StudySourceRevoked 错误：dashboard 返回 unavailableSources 并保留自有统计；errors/history 不依赖共享题库；read/submit/reflection 在撤销时先检查当前所属档案轮次已评分，未知和未提交轮次拒绝。新发题、源资源及图片读取仍保留授权门禁，已交相同答案重交幂等、异答拒绝。撤销后不创建外部显示投影，不修改旧快照。

已验证 Host 66、client 40 + integration 5、Host/client 官方声明、构建通过。公开 HTTP 覆盖新题/未交拒绝、自有已交成绩与错误历史/订正、重复提交、跨档案、恢复授权；真实 Native role 工具验证已交读取及普通 Session/另档案拒绝。模型写工具仍需要学习者页面，不新增模型确认权限。UI 来源撤销提示先红后绿。

新版本计划 0.4.0-alpha.3.4，旧候选不可覆盖。准确包门禁与实装结果待补。
