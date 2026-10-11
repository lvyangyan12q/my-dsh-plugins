# 04 — Explicit application instance entry (partial source checkpoint)

An installed application card previously offered only its default instance; the retained-window restore control could not open an instance that had not already been created. Application configuration now offers **Instance ID / 实例标识**, initially `default`, and **Open instance / 打开实例**. Existing and new IDs both use the existing public `openApp(appId, instanceId)` path. The ordinary card action still opens `default`.

The window/API entry, persisted recipe instance schema and managed role identity now share the existing 1–200 character instance boundary. IDs are kept verbatim: no trimming, truncation or implicit replacement. Invalid input is reported without opening a window. Host availability gates remain in force; the entry has no Session/model/data mutation dependency.

## Public seam checks

- Public Workspace DOM RED: application configuration had no instance identity input. GREEN: expanding the actual configuration control, opening `default` and `second`, reopening `second`, preserving the original instance page, rejecting empty/201-character IDs without truncation or API admission, and preventing opens for a disabled application.
- Public Workbench API RED: invalid IDs were admitted. GREEN: rejected before snapshot publication; a valid stable Unicode ID remains exact across repeat open and preference recovery.
- Focused regression: **24/24** checks across instance DOM, Workbench, lifecycle readiness, persisted recipe role/Agent replacement, and managed capability availability. These Host checks use the already-built official unpatched alpha.2 checkout.
- Owner-local Host/Client build, official-source configured type check, declaration emission and consumer check: exit 0. No main `lib`, official checkout, installed profile, model or Browser operation.

This is source/interface evidence only. Ticket 04 remains open. After a clean install, actual verification should expand the target recipe card's **应用配置**, enter `second`, click **打开实例**, explicitly open its role conversation, then return to `default` and verify distinct instance bindings, original history, same-instance reopening and refresh/Host restart. No actual cross-instance role session acceptance is claimed by the DOM fixture.
