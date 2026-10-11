# Reading statistics

Independent example application for Workbench display modules. Its `reading_statistics`
Host storage domain owns reading records by instance ID. Recipes only declare an owned
`reading-records` connection; the platform contains no reading business conditions.

Build with the repository `scripts/build-release.mjs` and `DSH_SOURCE` pointing to the
already-built official runtime. Register/install `@deepseek-ai/dsh-personal-workbench`
before this package, add this package to the profile and apply its `cordis.patch.yml`.
The Client manifest injects the Workbench package; Host storage and authenticated
connection services are required. Installation creates no Session or model request.
Workbench is an independent optional package dependency (`0.1.0`), with a local
development reference matching Kaogong. It is installed explicitly before this
package; the Client injection and Host service requirement still require it.
Only native DSH runtime packages belong in the runtime peer compatibility check.

In the application center open the recipe editor, choose **阅读统计应用 / Reading statistics app**.
This explicitly initializes public-domain example reading records for the default
instance only, idempotently. Save the draft, preview its filters/statistics/list/detail,
then explicitly activate. A template selection never changes the running recipe.
The ordinary data connection form can remove, add and reconnect the owned source.
Disabled apps retain their recipes and reading records and can be restored normally.

Other instances start empty. The authenticated `/api/reading-statistics/data` route
accepts `initialize` with an instance ID and `seed: "examples" | "empty"`; each instance
initializes independently. `read` never creates records. Preview reads a snapshot of
default data, stores its interaction state separately, and cannot initialize records.
The route uses the native authenticated same-origin request gate and bounded JSON.
No map service, credentials, private-app reads or AI invocation is included.
