---
id: worktable-layout-storage
parent: worktable-project-layout-spec
title: 固定布局文件与持久化接口
labels: [ready-for-agent]
status: closed
assignee: storage
blocked_by: []
---

实现规格中的版本2格式、严格校验、分类读取、旧格式转换、同目录原子替换、跨进程互斥与修订冲突保护。新增受认证布局接口；共享 Node 存储模块供 CLI 使用。接口以本目录 README 为准。

用已确认的实际布局存储和受认证接口接缝做 TDD；覆盖首次创建、重读、坏文件字节保留、旧文件候选、跨进程冲突及准入拒绝。不得修改通用文件 API 的语义。

## Resolution

实现固定版本2文件、按窗格身份保存几何、有限大小及内容/身份校验、旧文件只读候选、坏文件与未知版本保留、原子替换、跨进程独占锁和预期修订冲突保护。布局入口独立复用原生认证准入，通用文件 API 未修改。

TDD 记录：先运行固定文件恢复用例，因模块不存在失败；实现后通过。再加入非法内容/尺寸/身份拒绝用例，原实现错误接受而失败，补校验后通过。旧文件候选用例原返回 missing 而失败，实现候选分类后通过。受认证接口先因缺模块失败，接入后通过。后续覆盖坏/未知/过大文件保字节、两轮真实子进程竞争以及内容引用回读。

验证：`node --test plugins/worktable/04_test/project-layout.test.mjs plugins/worktable/04_test/project-layout-http.test.mjs`，7项通过。原子 rename 在 Windows 沙箱临时目录受 EPERM 限制，测试在获准的隔离临时目录权限下运行，未将写入实现退化为原地覆盖。

锁文件不会按时间擅自回收；进程异常遗留锁时返回错误并保留数据。任意编辑器绕过协议的并发修改不在保证范围内。真实宿主与最终包安装验收由04记录，本票关闭不代表全规格通过。
