# Native main-panel geometry regression

The stock-alpha installed browser reported an assigned native center width of 1640 at a 1920 viewport, but the Workbench project shell shrank to content width (276), hiding a wide split-page divider. The main entry now participates directly in the native center column flex flow. Its inherited independent-overlay absolute positioning (`inset:auto`, no width/height) had left the main panel shrink-to-fit.

## Public geometry seam and RED → GREEN

Run from repository root:

`node plugins/personal-workbench/tests/native-panel-layout.browser.mjs`

The explicit browser regression bundles the actual Workspace, Workbench and RecipePage public components and the installed native AppFrame CSS module. A display-contents slot wrapper places the public panel in the native center flex column. A fresh headless Chrome profile renders file-only synthetic layout content; no DSH Host, user browser profile, provider, source materials or business data are used. The fixture checks rendered bounding boxes, not CSS text. Set CHROME_EXECUTABLE when Chrome is installed elsewhere. It is an explicit browser check, rather than silently adding a Chrome prerequisite to the regular Node test suite.

Before changing product CSS, the test observed center 1640×900 versus panel 296.90625×436; maximized panel 172×434. Both wide split dividers were hidden. This reproduces the installed failure pattern (synthetic content has a different intrinsic width from the installed application).

After the scoped CSS fix:

| Assigned native center | Actual panel | Split divider |
| --- | --- | --- |
| Normal 1640×900 | 1640×900 | Visible |
| Maximized 1640×900 | 1640×900 | Visible |
| Rightbar present 1440×900 | 1440×900 | Visible |
| Narrow assigned center 480×900 | 480×900 | Hidden |

All panels start at the center's x=280 and y=0; the native left sidebar remains width 280. Initial independent management overlay geometry also equals the native center, retaining its separate absolute-positioned owner. Its existing ResizeObserver mechanism is unchanged; live management-overlay resizing is not certified by this focused headless test.

## Change and checks

Only plugin-owned selectors change: project shell becomes relative flex content, full width/height, border-box. Independent Agent/Skills management retains absolute positioning and its measured native-center bounds. No native or Better Sidebar selectors change.

- Actual headless DOM geometry regression: GREEN.
- Runtime layout and recipe-workspace public tests: 2/2.
- Built Client workbench-ui tests: 16/16.
- Isolated Workbench Host/Client tsdown build: successful.
- Public declaration compilation (`tsc -p tsconfig.types.json`): successful before build; final compilation rerun after build.

The initial generic tsx command without the plugin tsconfig failed with React-not-defined in two existing tests; the correct plugin-tsconfig command passed. This is not hidden as a product failure. Full release gates and installed stock-alpha browser recheck remain parent-owned; this evidence does not close the runtime or release tickets.
