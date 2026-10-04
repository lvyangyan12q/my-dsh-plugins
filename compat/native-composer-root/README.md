# Native composer root ownership

A Session owns one native Lexical editor. Previously, unmounting any composer called setRootElement(null), even after another view had taken its root. This adaptation detaches only the root owned by the unmounting surface. It retains the native editor, input commands, attachments and submission engine.

With DSH_SOURCE set to an absolute official checkout, run node scripts/check-native-composer-root.mjs --apply. The verifier accepts only the reviewed before/after hashes and backs up existing files. Rebuild the native client before runtime acceptance.

Regression: two real React ComposerContentEditable surfaces share a real Lexical editor; removing an inactive surface must preserve the active root and subsequent document updates. The owner still detaches its own root. Both regressions failed before the fix. The root tests plus native focus and InputBar suites pass: 3 files, 105 tests.

This fixes teardown ownership only. Draft synchronization and focus transfer between simultaneously mounted main and application composers remain pending; this is not evidence that the complete two-view workflow is finished.
