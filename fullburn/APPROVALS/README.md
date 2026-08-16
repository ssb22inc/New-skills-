# APPROVALS — human sign-off entries for Class-2 changes

Class-2 files (the Laws, caps, grade thresholds, the gates themselves — full
list in `engine/scripts/gate-lib.mjs`) may only change in a PR that also adds an
approval entry here, written by the human. CI (`class2-gate.mjs`) enforces it.

Entry format — one `.md` file per approval:

```
Approved-by: <name>
Date: <yyyy-mm-dd>
approves: <repo-relative path of the changed Class-2 file>
base-commit: <sha the pull request branches from — `git merge-base origin/main HEAD`>
from-content-hash: <sha256 of that file at the PR base, or "absent" for a new file>
content-hash: <sha256 of the new content, or "deleted" if the change removes it>
Reason: <one line>
```

An approval names a **transition**, not a state (adversary finding R2-05).
Pinning only the destination meant a superseded approval — say, one you signed
in January for a cap you later revoked — could be copied back into a new PR
verbatim and would re-authorize the old content forever, with no forgery
required. Naming the starting content as well means an approval can only be
used from the exact state you approved leaving — and naming the **base commit**
means it can only be used in the pull request you wrote it for. Content hashes
alone were still replayable: once a revert restored the earlier bytes, the tree
was back in the approved FROM state and every old approval was live again.

Get the hashes with `sha256sum <file>` from the repo root; for the base side,
`git show <base-ref>:<path> | sha256sum`.

A change that renames a Class-2 file needs approval for BOTH paths, and a
deletion needs one with `content-hash: deleted`.

Multiple `approves:` blocks may appear in one entry when a single decision
covers several files. Each block is parsed independently — a path cannot borrow
another block's hash (R2-32).

Entries are append-only history, like `reports/`.
