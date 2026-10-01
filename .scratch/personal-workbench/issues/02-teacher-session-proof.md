# 02: 窗口内真实老师会话验证

**What to build:** 最小可安装插件在窗口中呈现指定 DSH 会话，支持真实对话和恢复，不替换主聊天。

**Blocked by:** None (can start immediately).

**Status:** implemented candidate; live acceptance pending; dependent tickets blocked

- [ ] 能发送消息、呈现历史、流式回答、工具结果及授权或提问交互。
- [ ] 停止只作用于指定会话，关闭重开继续同一会话。
- [x] 通过官方公开扩展点，不移动主聊天 DOM，不使用假聊天。
- [ ] 若缺少公开接口，记录具体证据并阻止依赖任务宣称完成。

Evidence: `docs/teacher-session-proof.md`, commit `1295af1`. Ownership and built-artifact tests, public API checks and builds passed. These do not substitute for actual messages, approvals, scoped Stop and restart recovery. The early `ERR_BLOCKED_BY_CLIENT` and authentication observations concerned the in-app browser, not the user's authenticated Chrome page. Chrome-specific reads of the user-selected tab currently fail at the browser control transport (`nodeRepl.fetch request failed`), including after a fresh binding and REPL reset. Do not infer that Chrome blocks localhost or that DSH needs reauthentication. Live checks remain incomplete; tickets 03 onward stay blocked by the original gate unless the user explicitly changes implementation order.

Follow-up: `b263d6b` fixed authoritative archive gating and same-session Retry; 19 ownership tests and the artifact test passed, followed by focused re-review. `538bba1` and `573b149` reproduced the native Host import failure as absent Schemastery at the local link target. With the existing built dependency temporarily provisioned, unchanged-artifact import and built Host startup passed; all test children stopped and the temporary junction was removed. Offline archive installation and source/tsx startup (`FiberState` export mismatch before plugin evaluation) remain pending, independently of the live UI gate. No daily profile or Host/core code was changed.

Packaged follow-up: `18707ca` resolves the archive-install check. Official tarball installation with registry production dependencies passed; a second disposable profile installed offline with four reused packages and zero downloads. Installed bytes match the candidate, real installed Host import passes without junctions, and bounded built Host startup passes without activation warnings or outbound operations. All owned processes and ports are closed. The previous offline cache gap is resolved; source/tsx startup and live session interaction remain separate pending gates.
