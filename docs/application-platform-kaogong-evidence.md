# Ticket 06: Kaogong application platform integration

Implementation baseline: `74ee380` (tickets 03 and 04 already integrated). Worktree: `codex/platform-kaogong`.

## Delivered behavior

- Kaogong registers its own `kaogong/knowledge` source, backed by its existing knowledge endpoint and business storage. The knowledge page uses the shared `DisplayStore` and all four real `DisplayModule` types: filter, stats, list and detail. Reading statistics uses these same public components.
- Search includes the complete document body and tags, subject/type filters update the displayed material count and list, and selection drives full `DocumentMarkdown` details. Original material/document image routes and paths are retained.
- The platform receives a generic optional `renderDetail(record)` extension and `clearSelection()` operation; no Kaogong condition or business rule enters platform core. The Client artifact imports the actual shared package instead of bundling a copied registry/component runtime.
- Lectures, committed reviews and continuation prepare editable/removable contexts under the stable `kaogong/default` role keys. Preparation does not call the old immediate `teach`, ensure a Session, or send to a model. Every business evidence chunk appears once and can be removed; the prepared task holds no hidden evidence payload.
- Only explicit send selects the trusted teaching driver. Existing `kaogong-teach`, provider/body validation, packaged teaching assets, persona/preset definitions and scoped native conversation ownership are preserved. The prepared editor displays the subject discriminator and retains drafts across pages.
- A code-owned `beforeSend` callback claims a committed review round at the durable Host boundary, so racing owners cannot both send it. Native admission failure keeps the original callback/reservation retryable without a second claim. Uncertain reservations after refresh remain fail-closed.
- `afterSend` records actual admission locally and only then marks the Host review complete. Completion failure cannot restore a sent draft or trigger another send. The recovery control retries only completion, and a new view restores the local admission marker.
- Classroom continuation no longer pre-ensures a role during preparation. It rechecks the original lesson binding before explicit send and captures the same ready binding afterward. Existing missing/stale binding rejection remains authoritative.

## Validation

The clean root release build passed for personal-workbench, Kaogong and reading-statistics, including Host/Client bundles, declarations and installed public consumers:

```powershell
$env:DSH_SOURCE='D:/programming/workspace/deepseek-harness'
& 'D:/programming/nodejs/node.exe' scripts/build-release.mjs
```

With `DSH_SOURCE` and `KAOGONG_TEST_RUNTIME` pointing to the built official checkout, and `KAOGONG_TEST_TOOLS` pointing to its `packages/client/ui-renderer`, **72 focused checks passed**:

```powershell
& 'D:/programming/nodejs/node.exe' --import tsx --test plugins/kaogong/tests/platform-integration.test.mjs plugins/kaogong/tests/views.test.mjs plugins/kaogong/tests/practice-rounds.test.mjs plugins/kaogong/tests/lessons.test.mjs plugins/kaogong/tests/role-presets.test.mjs plugins/kaogong/tests/runtime-compat.test.mjs plugins/kaogong/tests/release-assets.test.mjs plugins/kaogong/tests/package.test.mjs plugins/personal-workbench/tests/task-client.test.mjs plugins/personal-workbench/tests/task-ui.test.mjs plugins/personal-workbench/tests/role-client.test.mjs plugins/personal-workbench/tests/role-host.test.mjs plugins/personal-workbench/tests/native-skill.test.mjs
```

The reading application's actual adapter/rendering, independent storage and normal draft/preview/activation/lifecycle suite passed **3 additional checks**:

```powershell
& 'D:/programming/nodejs/node.exe' --import tsx --test plugins/reading-statistics/tests/reading-platform.test.mjs
```

The new built Client integration checks prove full-body filtering beyond the old 180-character preview, real public stats/list/detail reuse, historical image URL preservation, exact subject teacher scoped native send, edited and removed context, zero implicit teaching calls, two-owner durable claim contention, original-reservation admission retry, and completion-only recovery across a new view.

Trusted teaching negative checks refuse foreign providers, unreadable/empty bodies and non-user-invocable skills before Session creation, and preserve existing durable IDs after refusal. Native SkillRegistry/pre-step tests load the real packaged body without a model request. Existing JSON restart tests preserve practice results, reflections, classroom IDs and bindings.

## Preservation and limits

No production learning storage, credentials, native sessions, menu configuration, material files or formal service process were modified. All mutating tests use independent synthetic fixtures in temporary directories. Notebook, progress, bank, knowledge, practice and lesson domain schemas and paths are unchanged. No live model call, parser request, deployment or service restart was performed.

Browser rendering and live-provider acceptance are owned by the integrating parent task. JSDOM, exact Session-controller boundary fixtures and actual native SkillRegistry tests are deterministic integration evidence, not a claim of a completed real-provider turn or screenshot-based visual acceptance.
