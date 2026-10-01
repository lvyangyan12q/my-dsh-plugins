# 02: 窗口内真实老师会话验证

**What to build:** 最小可安装插件在窗口中呈现指定 DSH 会话，支持真实对话和恢复，不替换主聊天。

**Blocked by:** None (can start immediately).

**Status:** implemented candidate; live acceptance pending; dependent tickets blocked

- [ ] 能发送消息、呈现历史、流式回答、工具结果及授权或提问交互。
- [ ] 停止只作用于指定会话，关闭重开继续同一会话。
- [x] 通过官方公开扩展点，不移动主聊天 DOM，不使用假聊天。
- [ ] 若缺少公开接口，记录具体证据并阻止依赖任务宣称完成。

Evidence: `docs/teacher-session-proof.md`, commit `1295af1`. Ownership and built-artifact tests, public API checks and builds passed. These do not substitute for actual messages, approvals, scoped Stop and restart recovery. The current browser cannot access the local host (`ERR_BLOCKED_BY_CLIENT`); do not bypass that boundary or mark live checks complete. Tickets 03 onward stay blocked by this gate.
