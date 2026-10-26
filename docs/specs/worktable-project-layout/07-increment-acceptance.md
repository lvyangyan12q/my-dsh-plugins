---
id: worktable-layout-increment-acceptance
parent: worktable-project-layout-spec
title: 新增范围最终包验收
labels: [ready-for-agent]
status: closed
assignee: root
blocked_by: [worktable-layout-custom-races, worktable-layout-region-minimize]
---

使用新版本最终包，在隔离官方宿主完成拖拽、单窗/区域收起、重开、清测试缓存后目录恢复、稳定归属和提交保护。实际安装并逐文件核对9文件、双资产哈希；两轴独立审查，修复后推送PR4并转为可审阅。

保留rc.3.4第一阶段证据，不覆盖冻结资产、不安装重启正式profile。仅全部要求证据完成才关闭父规格。

## Resolution

本地与远端交付完成。源码、测试、文档和rc.3.6双资产已推送至codex/worktable-project-layout；[PR #4](https://github.com/lvyangyan12q/my-dsh-plugins/pull/4)已更新最终标题/正文并转为可审阅。远端按资产提交ed623b9下载两份tgz，SHA均与本地验收SHA一致。父规格与全部工单关闭，main未合并。

rc.3.6来源9fdc30c，双资产SHA为ed01dc63394b1ebc2e8ba54fdf96b4673ab2683a48072ec15562594130e0a6da。402项源码回归400通过/0失败/2可选跳过，原生rc.3契约9/9，实际归档9文件、干净安装导入与安装逐文件字节比对通过。

在未改动的官方0.2.1-rc.3隔离home和专用浏览器，真实Pointer拖六类分隔条、单窗/整行/整列/全部收起、iframe/草稿保活、窄屏恢复、关闭重开、清7项专用缓存后目录恢复、隔离宿主冷重启均通过。实际表单双击只一次目录校验，中途关闭项目后创建0/发送0且中文错误与草稿保留；其余失败矩阵及创建后竞态通过公开协调器回归。未发模型消息，不把源码测试外推为真实模型任务成功。

Standards P3和Spec P2均集中修复、独立复查0剩余。最终包rc.3.5另发现CSSOM小数边距误判接管，保留冻结包，使用新rc.3.6修复重验；自身调整保持打开、真实外部17px改写仍让位。

证据：[宿主](evidence/increment-host-acceptance.json)、[打包](evidence/increment-pack-validation.json)、[规范复查](review-increment-standards.md)、[规格复查](review-increment-spec.md)、[集中修复](review-increment-fixes.md)。正式profile仍为rc.3.3，未安装/重启；未合并main，未创建远端tag/Release。

收尾：6个本任务实施工作树已清理，根依赖与验收日志保留；隔离宿主均已停止。远端回执见[increment-remote-verification.json](evidence/increment-remote-verification.json)。
