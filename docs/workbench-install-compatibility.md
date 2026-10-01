# Optional Workbench Package Boundary

Actual paired07 tarball installation rejected Kaogong because its optional peer `@deepseek-ai/dsh-personal-workbench: 0.1.0` was evaluated as a DSH core-runtime requirement. The official gate checks every `@deepseek-ai/dsh-*` peer against the Host version, including optional peers. No exemption was granted.

Kaogong imports the workbench only as TypeScript types. Its compiled Host/client make no runtime module import, and its Cordis service/factory integration is optional. Therefore the workbench belongs in development type dependencies, not runtime peers. Removing that false runtime requirement leaves the genuine Cordis and Host webserver peers unchanged. This is a correction to the actual dependency surface, not a widened core compatibility range or permission bypass.

`tests/runtime-compat.test.mjs` executes the official built app-boot compatibility evaluator: the old manifest fails, the corrected manifest passes, and mismatched Host peers remain denied without exemptions. Existing archive checks continue to reject runtime workbench imports and mandatory client injection. Normal profile policy remains hoisted linking with `autoInstallPeers:false` so first-party services share the Host runtime.

Paired final installation, cold recovery and Chrome acceptance remain separate gates. This metadata correction does not accept native conversation or materials UI by itself.
