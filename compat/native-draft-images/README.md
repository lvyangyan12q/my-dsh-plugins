# 历史原生补丁归档：native-draft-images

2026-10-11：用户已恢复原生仓库，本目录仅保留历史实现及证据。当前工作台发布不依赖、不安装这些补丁。不得按下文旧命令修改原生仓库；所有旧安装建议均已撤销。原生公开接口适配与独立无补丁验收以当前规格及11/12工单为准。

---

# Native image draft adapter

Adds optional IConversation.stageImages(sessionId, files), staging only browser-owned images on an existing native Session without sending, replacing text or starting file uploads. Its idempotent rollback removes only this call's unsent images. Native Session/menu behavior is unchanged.

With DSH_SOURCE set to the official rc.2 checkout, run node scripts/check-native-draft-images.mjs --apply after the existing Session chrome adapter. Exact before/after hashes protect local changes; originals are backed up. Build packages/client/ui-conversation Client bundle and declarations, then build-release and restart DSH. The release build verifies this adaptation rather than silently reaching private APIs.

Screenshot bytes remain native browser draft attachments until the user sends; annotation history stores text and coordinates. Unsupported runtimes report the missing API.

