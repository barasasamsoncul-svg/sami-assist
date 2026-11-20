SaMi Runner Dashboard Refresh v4
================================

This is the same approved dashboard refresh, with a correction to the compact
earnings-eye replacement anchor. The earlier script changed the online/location
condition before trying to match that same condition as part of a later anchor.
Version 4 targets the unique 18px eye icon itself, avoiding that ordering conflict.
It also normalizes CRLF/LF while matching and restores each file's original
line-ending style when writing. Backups and pre-write validation are retained.

Target baseline: main commit 05e7e25316350ed7cba8f4989f2d09523eba8004

Apply from the repository root:

1. Extract this ZIP into C:\dev\sami-assist-web.
2. Copy Apply-SaMiRunnerDashboardRefresh.mjs into:
     apps\runner\scripts\Apply-SaMiRunnerDashboardRefresh.mjs
3. Run:
     node .\apps\runner\scripts\Apply-SaMiRunnerDashboardRefresh.mjs
4. Validate:
     git diff --check
     cd .\apps\runner
     npm run typecheck
     cd ..\..
     npm run build
     git status --short
     git --no-pager diff --stat

Review the four changed files before pushing. Build the signed production APK
locally through the existing Android Gradle project and existing keystore only
after source validation. Do not use EAS to build the APK.

The patch does not change app.json, eas.json, package.json, package-lock.json,
Android versionCode, package IDs, EAS IDs/channels, tokens, credentials,
keystore files, native signing config, or signing identities.


Version 4 correction: the compact earnings eye replacement now targets the unique 18px eye icon itself. The previous script changed the nearby online-location condition earlier in the same transform, then incorrectly depended on the old condition in a later search anchor. This was an internal replacement-order bug, not a line-ending problem.
