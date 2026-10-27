---
id: worktable-legacy-pane-minimum
parent: worktable-project-layout-spec
title: 旧左列叠窗缺少最小宽度导致零宽度
status: closed
updated: 2026-10-27
delivery: source-and-package-fixed
---

用户报告bug-solver的窗口1、2消失。正式安装已升级rc.3.6，Chrome端口3080现场DOM两窗仍存在且未收起，宽度均为0、高度376；第三窗另已收起。两窗iframe引用仍在，内容没有被删除。页面同时提示旧布局结构无效，布局未保存。

根因：早期leftMore补丁保存的版本1中p1、p2省略min。leftMinimum计算得到NaN，leftColumnWidth把它视为不存在左列并返回0；严格旧格式迁移也拒绝缺失字段。不是几何缓存单独造成：保持所有其他输入，仅补p1.min/p2.min=200，公开SplitWorkspace原场景两窗宽度均恢复623。

修复bf41858：共用normalizeLegacyPaneMinimums，在分栏打开和版本1迁移入口仅补缺省min=200。保留ID、标签、内容和已有数值，不改用户布局文件或浏览器缓存；版本2/3主文件继续严格校验。

回归先红后绿：

- 实际公开组件DOM：旧布局p1宽0，断言失败；修复后p1/p2均有宽度、iframe引用及编号保留、输入对象不变。
- 真实存储：版本1缺省min原来返回invalid，修复后legacy候选、显式保存新版本3、旧文件字节不变；现代损坏文件仍拒绝且保留原字节。
- 最终bundle：rc.3.6旧bundle缺省min回归失败；rc.3.7打包在实际安装包上执行锚点12/12。

rc.3.7完整npm run pack通过：404项源码回归402通过/0失败/2可选跳过，官方rc.3契约9/9，9文件结构、独立实际安装导入及已安装工厂/UI门禁通过。双资产SHA-256为32dcbc641f4b2ad99305d24e2ef5bb8400faad441ef2aeea57ff18f71eb22ce4。

当前正式页面仍运行rc.3.6，未自动安装或重启。加载修复需将releases/v0.10.0-rc.3.7/dsh-worktable.tgz安装到web profile，然后由用户重启宿主并刷新页面；不需要删除项目、旧文件或清空浏览器缓存。新包未另做完整真实Chrome宿主验收，不借用rc.3.6的旧结果冒充。
