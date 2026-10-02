# Kaogong

DSH Web `0.2.0-rc.2` learning application: notebook, plan/progress, question bank, knowledge reader, durable practice and lessons. Install the prebuilt bundle through the [official release instructions](../../README.md#prebuilt-installation).

## Configuration And Preservation

Edit the native profile's `kaogong` entry:

```yaml
config:
  roleCwd: /absolute/existing/work-directory
  questionImageRoot: /absolute/existing/question-images
  mineru:
    outputDir: /absolute/durable/mineru-results
```

Use absolute native paths on your platform. These are examples, not defaults. `roleCwd` is required before creating new native role Sessions; persisted Sessions keep their original identity/cwd. `topN` defaults to 8.

`questionImageRoot` reads historical image assets without copying or changing them. Only safe relative image paths beneath its real directory are served; traversal, unsupported extensions and escaping symlinks are rejected. The two reviewed bundled material images remain available when the historical root is absent.

`mineru.outputDir` is explicitly required for document reads and new parser work. There is no package-relative, current-directory or home-directory write fallback. Preserve the exact old absolute result path when upgrading. Missing or relative optional roots leave bank, practice, notebook, plan and lessons usable; affected image/document operations report local unavailability. Startup skips parser migration/import until an absolute result root is configured. A configured missing image returns not-found, never fabricated content.

MinerU token/model/output settings and the historical image root use rc.2's native live configuration references. Token fields are secret-redacted; an update that omits the token preserves it. A live root change affects later reads without remounting the business-domain owner. Do not change output roots while parse jobs are outstanding. Existing results are not moved.

The optional parser calls an external service only when explicitly invoked with an authorized PDF and configured durable output root. Token fallback remains `MINERU_TOKEN`; keep secrets on the Host, outside archives and client data. No PDF parsing, upload or network request is performed by the release checks.

Image GET/HEAD routes use the official same-origin/platform and browser-cookie guards. A normal same-origin image request needs no Origin header; absent cookies and cross-site/foreign/null origins remain denied.

For transition from a manual source/junction entry, follow the [preservation steps](../../README.md#existing-manual-installation). Keep the same business storage and credential references; disable the old entry through official configuration instead of activating both or deleting old material.

## Learning Contracts

Practice issues real rounds of ten approved questions (or the explicit available remainder), cycling by original question IDs. Answers/analysis are concealed before submission. Host-issued membership and full answers determine the trusted score; model prose and Client values do not. Durable identical submissions return the same result; conflicting retries are explicit. Notebook projection recovery preserves newer attempts and reflections.

Lessons capture objectives, material links, authoritative submitted rounds and explicit completion. Summary prose cannot complete tasks. Review hands off to native counselor key `kaogong/default/counselor` without a subject; teaching uses a subject-explicit teacher key. Native Sessions and assignments remain workbench-owned. Without workbench, business records and standalone learning remain available; role preparation reports unavailable.

Host and Client have separate real declaration entries. `Config` describes resolved runtime values: `questionImageRoot` and `mineru` are native `Volatile` references, read with `.get()`; raw profile YAML remains plain data. Client `KaogongView` can be hosted by the workbench or standalone shell, with one owner for the default instance.

## Verification

The package declares dev-only UI/test tools; production archives contain neither fixtures nor test dependencies. Build/test scripts are in `package.json`. Set `KAOGONG_TEST_RUNTIME` to the built official checkout, and optionally `KAOGONG_TEST_TOOLS` to an explicit compatible development tool anchor. The root combined build compiles workbench first and Kaogong against its newly emitted declarations.

See [ticket11 evidence](../../docs/ticket11-release-evidence.md) for archive, installed consumer, data preservation and runtime checks. Native completed turns, interactive controls, desktop/narrow screenshots and rendered image pixels remain pending; passing synthetic DOM or PNG-byte checks is not visual acceptance.
