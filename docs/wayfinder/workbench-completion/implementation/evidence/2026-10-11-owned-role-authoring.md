# Existing application-private role authoring regression

The real unpatched-alpha Browser workflow successfully activated a third page, then its next-version authoring form incorrectly reported the existing module builder as missing. Management deliberately excludes application-owned presets from reusable choices. The editor previously inspected only that reusable catalog.

The editor now recognizes the existing role through the public management catalog's scoped application/role/preset projection (recipe roles have no subject). It keeps this preset out of new-role choices. Native Session IDs, bindings, Host admission, and reusable management remain unchanged. Unavailable projections and managed Agent disablement still show errors; a different application, role, or subject cannot authorize the declaration.

TDD: normal RecipeRolesEditor plus management HTTP boundary regression failed before the fix with an unexpected missing-Agent alert (2 passed / 1 failed), then passed. A second regression exercises the actual installManagement HTTP handler and real DomainFacility/JSON storage through normal React authoring, including broken-preset refresh.

Validation: recipe-role-editor, management-host, recipe-role-host: **15/15 passed**, against the independent stock-alpha native build. Existing tests verify private-role restart identity/history and explicit replacement admission. No Browser, model, native source, live data, formal runtime, or main compiled output was changed. Real Browser re-verification remains pending with the root owner; these regressions do not close the full original acceptance criteria.

Canonical independent-alpha source gate (`DSH_SOURCE` plus `scripts/check-source.mjs`): passed. Isolated Host/Client tsdown bundle: passed. An initial unconfigured plain tsc invocation hit duplicate Cordis declarations through the main dependency junction; the canonical source gate resolves the native type anchor. Root will run the integrated full release gates after merge.
