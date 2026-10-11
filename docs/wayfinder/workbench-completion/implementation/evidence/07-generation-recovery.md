# 07: Active generation recovery implementation slice

Status: targeted implementation verified; actual installed browser/model/Host acceptance and the full ticket remain open.

## Behaviors

The browser editor now keeps a bounded, versioned local preference containing the edited requirement, selected workspace, and the original job/native Session identity and status. Generated recipes, model credentials, providers and callbacks are not serialized into this browser state. A remounted editor queries the original status rather than starting generation again, restores cancel/native-history controls for a live job, and delivers a completed existing draft once per mounted job. The same Host recipe remains the authoritative saved result.

Generation owns a dedicated StorageDomain for job summaries/outcomes. The native Session identity is persisted after native creation and before model admission; saving state is persisted before the existing CAS commit. Completed, failed and cancelled summaries remain readable after owner/Host recovery. Incomplete running/saving checkpoints become explicit failed interruption outcomes without scheduling or replaying a native model request. Graceful service shutdown retains the existing cancellation behavior but explicitly explains Host interruption rather than reporting a user cancellation. Native Session and saved draft identities remain available for inspection.

Unknown/unavailable restored jobs show a terminal error, stop polling and preserve an already-known native Session entrance. There is no automatic retry, replacement Session or model start. The browser recovery retains metadata only; missing output is never fabricated or silently accepted. Existing model tool guards, trusted workspace checks, output validation, explicit activation, four-active-job limit and CAS remain intact. Terminal summary retention is bounded by the existing 100-job policy, and domain closure drains admitted job persistence.

## RED/GREEN and evidence scope

- Public DOM remount first lost the edited requirement and active controls (RED), now restores them with exactly one start and cancellation of the original job.
- Public generation status after owner restart first returned job not found (RED), now restores completed summary, exact native Session and recipe record with no model replay.
- Host service shutdown originally reported only Generation cancelled (RED); it now gives an explicit Host interruption reason.
- 20 generation-native tests, 3 generation UI tests and source types pass. Native tests run the official Session controller/Agent loop with a declared model adapter fixture and actual DomainFacility/JSON persistence. Persisted crash checkpoint fixtures exercise recovery policy, not a claim of an actual killed model process.
- DOM/API-boundary tests verify missing-job polling termination and idempotent existing-draft delivery. They do not demonstrate actual model completion or physical browser/Host restart.
- No formal profile, parent browser/model, private materials or Agent management files were changed. No complete-spec or ticket closure is claimed.

## Parent installed acceptance

While actual generation is running, reload the browser and reopen the application builder: edited requirement, workspace, original job/native Session, status and cancel must remain; no second start may be sent. After real completion, reopen/reload and verify the existing saved draft is delivered without duplicate saves or activation. Stop/restart the isolated Host with an active job: status must explicitly show cancellation/interruption and retain native history, or turn a durable running/saving checkpoint into interruption after an abrupt stop. Confirm status polling terminates and inspect the preserved native Session. Recovered outcomes must not automatically call the model. Actual retry remains a deliberate generation gesture.
