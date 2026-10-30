# DSH 0.2.2-alpha.2 compatibility delivery

Worktable 0.10.0-rc.3.9 and bug-solver-dispatch 0.1.1 admit the explicitly verified runtime in addition to the existing rc.3 contract; no exact-version exemption is used. Other runtimes remain blocked.

Validation: fixed official source f3803c96974ad4a94195fb97e5c637e9c2a3afe3 (9 native contract checks); Worktable 402 passes, 2 existing skips, 0 failures; bridge 147 passes, no skips. Release preparation verifies archive contents, clean npm installation/import, client factory, installed UI callbacks, layout anchors and server home resolution. Final tgz boot in a fresh DSH_HOME verifies Worktable health, authenticated bridge listing and rejection without login. See host-boot-evidence.json.

Windows gate fixes canonicalize the temp path used by filesystem fault injection, resolve jsdom from the package owning the dependency, and replace the 80ms deadlock timing assumption with bounded detection. The full gate remains mandatory.

The earlier rc.3.8 package was a local validation candidate before package documentation was aligned; no remote release of that candidate is part of this delivery.

This is loading/API and regression evidence, not a new model-driven production fix/review, SSH or complete user-workflow acceptance. No official source, session data, credentials or business data were changed.

Install the two archives into the selected web profile using its official dsh plugin add command, then restart DSH from the original terminal and refresh the browser. No GitHub Release or tag is created by this main-branch delivery.
