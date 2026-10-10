# 04: Prepared task recovery slice

Status: implementation slice verified; ticket remains open pending actual installed browser/Host acceptance and native-history/permission execution evidence.

## Defect and change

PreparedTasks previously retained edited task/context only in memory. A public task-service test using actual JSDOM localStorage restarted the service and observed zero tasks instead of two independently keyed app instances (RED).

The installed client task service now persists bounded, versioned preparation state in browser localStorage. A refresh restores the exact application/instance/role/subject key, source, edited task and remaining contexts without creating a Session or sending a command. Explicit successful send and discard remove their cached preparation. The role service remains responsible for Host/native Session identity and availability checks; this slice changes no Agent management behavior.

Tasks that were sending, reserve an output identity, or require code-owned hooks restore with an explicit recovery error and disabled send. The user must explicitly prepare that workflow again to reacquire its trusted callbacks. Edits retain the recovery explanation. Callback-free ordinary tasks remain directly editable and explicitly sendable. A malformed, future, duplicated-key or oversized cache is ignored. Restricted browser storage falls back to current in-memory editing.

The generation reservation itself is not recreated by deserializing a task. Existing module reservation/status/cancel flows still own Host output lifecycle; restored code-owned tasks do not claim that lifecycle was recovered. Actual model execution and cancelled/reprepared output flows require their downstream acceptance tickets.

## Verification

- task-client.test.mjs: 14 passing tests, including 4 new external behavior tests with actual browser storage.
- A second RED demonstrated that editing a blocked recovered task removed its visible recovery explanation; corrected and green.
- scripts/build-release.mjs passed all three source/Client builds, declarations and official Client module resolution checks.
- scripts/check-platform-tests.mjs: 324 passed, 0 failed, 0 skipped.
- No real model call, actual Chrome acceptance, formal 3080 profile change, private material mutation, or native history/permission-denied acceptance is claimed.

## Parent browser acceptance path

In an isolated installed DSH, open a runtime application with a role task action. Prepare a task, edit its goal/context and remove one context. Reload the browser, reopen that application, and verify the same edited preparation, source and role remain visible without a new Session or message. Cold-restart the Host while retaining the same browser origin and verify again. Use a second app instance/subject to verify isolation. Cancel a callback-free preparation and reload to verify it stays absent. For module generation preparation, reload and verify the task remains visible with an explicit recovery explanation and disabled send; preparing again must go through its existing reservation endpoint. Real send/Stop/history checks belong to ticket 05.
