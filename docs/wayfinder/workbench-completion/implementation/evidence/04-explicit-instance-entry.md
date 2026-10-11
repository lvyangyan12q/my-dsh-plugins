# 04 — Explicit application instance entry (partial source checkpoint)

An installed application card previously offered only its default instance; the retained-window restore control could not open an instance that had not already been created. Application configuration now offers **Instance ID / 实例标识**, initially `default`, and **Open instance / 打开实例**. Existing and new IDs both use the existing public `openApp(appId, instanceId)` path. The ordinary card action still opens `default`.

The window/API entry, persisted recipe instance schema and managed role identity now share the existing 1–200 character instance boundary. IDs are kept verbatim: no trimming, truncation or implicit replacement. Invalid input is reported without opening a window. Host availability gates remain in force; the entry has no Session/model/data mutation dependency.

## Public seam checks

- Public Workspace DOM RED: application configuration had no instance identity input. GREEN: expanding the actual configuration control, opening `default` and `second`, reopening `second`, preserving the original instance page, rejecting empty/201-character IDs without truncation or API admission, and preventing opens for a disabled application.
- Public Workbench API RED: invalid IDs were admitted. GREEN: rejected before snapshot publication; a valid stable Unicode ID remains exact across repeat open and preference recovery.
- Focused regression: **24/24** checks across instance DOM, Workbench, lifecycle readiness, persisted recipe role/Agent replacement, and managed capability availability. These Host checks use the already-built official unpatched alpha.2 checkout.
- Owner-local Host/Client build, official-source configured type check, declaration emission and consumer check: exit 0. No main `lib`, official checkout, installed profile, model or Browser operation.

This is source/interface evidence only. Ticket 04 remains open. After a clean install, actual verification should expand the target recipe card's **应用配置**, enter `second`, click **打开实例**, explicitly open its role conversation, then return to `default` and verify distinct instance bindings, original history, same-instance reopening and refresh/Host restart. No actual cross-instance role session acceptance is claimed by the DOM fixture.

## Review repair and complete module gate

The first complete release check rejected the Client factory: importing the shared Zod instance schema introduced `require("zod")`, which the official browser module table does not expose. Owner-local reproduction used the existing canonical `check-client-module-artifacts.mjs` gate and failed at that exact public materialization boundary. The shared Client validation is now a dependency-free type guard with a shared maximum length. Host schemas keep their original string/minimum/maximum validation and strict objects. No seed, native module override, third-party fallback or bundled fake service was added.

After rebuilding owner-local artifacts, the canonical gate passed both with Workbench and without Workbench, using the official unpatched alpha.2 module resolver and seed, with Node require fallback disabled and no model calls. Focused checks remain **24/24**; configured types, declarations, consumer checks and the owner-local Workbench build exit 0. The owner-local reading artifact was rebuilt to reflect its already-merged missing-platform fix; its source was not changed in this repair.

Review also found that the management overlay's absolute-position rule matched its inner directory. Root-agent execution of the file-only headless native-layout regression first returned RED: the directory was `absolute` and could not scroll; the instance input was 21px tall. The rule now targets only the overlay root (`.pwb-project-shell.pwb-independent-management`), and the instance input uses the scoped standard field style.

An intermediate regression response omitted the public management catalog's `version: 1` field, so no long catalog could render. That fixture failure is retained as a test setup failure, not an additional product defect. The corrected public response explicitly renders 80 actual capability cards before measuring. Root-agent execution then returned GREEN: inner directory `static`, height 769px, scroll height 6747px, actual scroll offset 50px; instance input height 38px and width 394px equal to its label width. Existing native center, maximize, right-sidebar and narrow-canvas checks also pass. These are real browser layout measurements in an isolated temporary, file-only profile, not installed DSH or role execution acceptance.

The implementer did not launch Chrome: automatic review rejected that operation because Browser control belongs to root. Root executed the regression, and the implementer only edited its source and built owner-local artifacts. Ticket 04 and installed cross-instance role acceptance remain open.
