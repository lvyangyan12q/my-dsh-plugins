# Role selection focus ownership — source regression, actual acceptance pending

## Observed failure

The independent KG teacher subject selector changed the mounted native Session while the selector still owned keyboard focus. Native InputBar's public surface mount effect autofocuses its editor. The trailing selector-confirmation Enter consequently submitted the new subject's preserved draft without a Send-button click. This was observed in the isolated DSH, not the formal profile. The unexpected request remains a failed acceptance observation; no source test rewrites that result.

## Bounded fix

`RoleConversation` now wraps its native Session subtree in a plugin-owned standard focus boundary, keyed by role identity. On mount it remembers a focused external application control. A programmatic focus event from inside the mounted conversation restores that control. A deliberate pointer interaction or Tab navigation relinquishes this ownership, so ordinary editing and native submission remain possible. The wrapper neither queries native editor markup nor intercepts native submission or mutates drafts. No native menu, core source, private persistence, or Host configuration was changed.

The selected complete native source was inspected: InputBar mount/session effect invokes `focusDraftEditor`; the published conversation content and composer owner contracts currently expose no automatic-focus policy. Standard DOM focus ownership is enforced at the application embedding boundary.

## Verification

- Public RoleConversation UI regression: RED when a mounted content occupant takes focus from the subject select; GREEN after the boundary. It covers subject and role changes, confirmation Enter with no submission, initial unconstrained autofocus, explicit pointer entry and submission, and Tab entry.
- The content occupant deliberately models the observed mount-autofocus contract; this is **not** a real Lexical editor or an actual Host/model request.
- Existing public native Cordis/SlotRegistry role factory, built generic role view and role identity overlay tests: 4/4 with the new focus regression.
- Isolated single-plugin build and declaration generation: passed. Configured source typecheck and source compatibility check: passed.
- An initial test invocation from repository cwd used the wrong JSX configuration; a subsequent failure came from omitted required DSH_SOURCE in native-factory setup. Both were setup failures, separately corrected. The behavioral RED was the subject select losing focus.

## Actual installed DSH acceptance still required

Install the official new archive in the isolated DSH. Seed an unsent distinct draft in the target subject. Focus teacher subject select, Home, ArrowDown to the target subject, Enter. Assert the select retains focus, native history/request count does not grow, and the draft is unchanged. Repeat a role switch and a delayed role hydration. Then deliberately click the native composer and confirm normal typing/submission is still available. Verify narrow/independent window behavior and preserved role/session identity. Tickets remain open until that real flow is observed.
