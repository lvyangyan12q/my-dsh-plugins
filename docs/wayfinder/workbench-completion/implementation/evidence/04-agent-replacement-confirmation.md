# 04: Changed Agent confirmation and retained current history

Status: verified implementation slice; full ticket remains open.

## Defects

The recipe-role Host admission path accepted an updated running Agent automatically: register(key,true), invoked by ordinary ensure/send, called setPreset and created a replacement native identity. The public Host/storage test reproduced two created identities where opening/sending was required to leave the existing single identity untouched (RED).

Removing this implicit adoption leaves the original binding unchanged. Ordinary ensure reports the preset mismatch. The existing role UI confirmed replacement command adopts the new declaration, retains the old identity in history and preserves other instances. No Agent management catalog behavior changes.

The role UI also hid the original current Session after the declared Agent changed, while its history list included only previous identities. A public DOM test reproduced the missing history entrance (RED). The same official history factory now accepts that preserved current identity from More before replacement. The standard current composer remains hidden for the mismatched declaration; viewing history does not mutate the role binding or issue ensure/replace/send.

## Verification scope

- 40 targeted tests passed: recipe-role Host, role Host, bindings, role client and the new current-history UI test.
- Source type gate passed.
- Host tests use the actual official DomainFacility and JSON storage and close/reopen that medium, with native creation authority at its agreed boundary. They do not prove actual native controller execution, model generation or completed historical messages.
- UI test uses the public RoleConversation component and actual DOM button interaction. It proves routing to the official history factory and unchanged binding, not actual historical message retrieval.
- No formal profile, parent Chrome/3089 environment, private materials or Agent management files were changed. No work item is closed by these tests.

## Installed browser acceptance required

Create a recipe role and its real native Session. Activate a new recipe version changing that role to a second managed Agent. Reopen the app and prepare/send only when authorised: mismatch must retain the old ID and create no substitute. Open More and inspect the old current history in-app/native. Cancel the existing new-role confirmation and verify no mutation; accept it and verify exactly one new Session using the selected Agent, old identity retained and a second application instance unchanged. Refresh and Host cold-restart must restore the replacement. Actual completed history, archive/missing/permission failures and model/Stop/approval execution remain downstream acceptance requirements.
