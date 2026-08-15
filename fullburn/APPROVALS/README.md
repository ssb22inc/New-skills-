# APPROVALS — human sign-off entries for Class-2 changes

Class-2 files (the Laws, caps, grade thresholds, the gates themselves — full
list in `engine/scripts/gate-lib.mjs`) may only change in a PR that also adds an
approval entry here, written by the human. CI (`class2-gate.mjs`) enforces it.

Entry format — one `.md` file per approval:

```
Approved-by: <name>
Date: <yyyy-mm-dd>
approves: <repo-relative path of the changed Class-2 file>
content-hash: <sha256 of the new file content>
Reason: <one line>
```

The `content-hash` pins the approval to the exact new content
(`sha256sum <file>` from the repo root), so an approval can never be reused for
a different change. Multiple `approves:`/`content-hash:` pairs may appear in one
entry when one decision covers several files.

Entries are append-only history, like `reports/`.
