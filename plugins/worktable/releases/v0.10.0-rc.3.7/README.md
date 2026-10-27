# Worktable 0.10.0-rc.3.7

来源：`bf41858`。修复旧浏览器/版本1布局缺少pane.min导致左列窗口宽度为0的问题；仅为缺省字段补200，现代版本2/3主文件仍严格校验。保留窗格身份、标签及旧文件字节。

双资产SHA-256：`32dcbc641f4b2ad99305d24e2ef5bb8400faad441ef2aeea57ff18f71eb22ce4`。

唯一npm run pack入口通过：404项源码回归中402通过、0失败、2可选旧宿主测试跳过；官方rc.3契约9/9；精确9文件、干净实际安装/导入和安装bundle门禁通过，锚点含旧布局回归12/12。

用户Chrome现场rc.3.6的窗口1/2均为0px；同结构公开SplitWorkspace DOM测试先红，修复后均623px。新增包未在用户当前正式宿主安装或重启；未宣称新的完整Chrome宿主验收。

[诊断与回归记录](../../../../docs/specs/worktable-project-layout/11-legacy-pane-minimum.md)。rc.3.6及更早冻结包未覆盖。
