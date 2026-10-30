# bug-solver-dispatch 0.1.1

DSH Host bridge for the bug-solver dispatch page. Install this directory or its packed archive into the DSH web profile.

Supported runtime declarations: `0.2.1-rc.3 || 0.2.2-alpha.2`. Other versions remain blocked; no compatibility exemptions are installed.

For DSH 0.2.2-alpha.2, the repository's Worktable native-contract gate checks the official fixed runtime revision. The bridge suite has 147 passing tests. Archive boot checks with the matching Worktable candidate use an isolated official web profile: authenticated run listing must succeed and unauthenticated access must be denied. See the release evidence for the exact tested archive versions.

This verifies loading and API admission, not a model-driven production fix, SSH access, or a full review cycle. Configure projectDir, dataDir and allowedRoots for the target environment through the profile patch; the bundled patch retains the existing local deployment defaults. Never copy credentials or runtime data into Git.

Run tests with `npm test`. For keyless final-archive boot verification, use `../scripts/verify-alpha2-boot.cjs` with the DSH source directory, Worktable archive, bridge archive and evidence output path.
