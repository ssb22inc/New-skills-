# APPROVALS — human sign-off entries for Class-2 changes

Class-2 files (the Laws, caps, grade thresholds, the gates themselves — full
list in `engine/scripts/gate-lib.mjs`) may only change in a PR that also adds an
approval entry here, written by the human. CI (`class2-gate.mjs`) enforces it.

Entry format — one `.md` file per approval:

```
Approved-by: <name>
Date: <yyyy-mm-dd>
approves: <repo-relative path of the changed Class-2 file>
base-commit: <the tip of the branch you are merging INTO — `git rev-parse origin/main`>
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

**Do not compute any of this by hand.** Run

```
cd fullburn && npm run owed-approvals -- . origin/main
```

and paste what it prints. It reads the same diff, through the same `isClass2()`
and the same hash functions, as the gate that will judge it — so what it prints
is what the gate demands, by construction. Hand-copied lists and hand-computed
hashes are the one part of this mechanism nothing can verify, and both have
already drifted once (adversary findings H-17, N-10).

`base-commit` is the **tip** of the target branch, not `git merge-base`, and
this README documented the wrong one (N-10): an approval written as documented
was rejected by CI, which computes `git rev-parse origin/<base-ref>`. The tip is
also the safe choice — binding to the merge base let an attacker branch from an
older commit, restore content a human had revoked, replay the approval that
first authorized it, and merge cleanly, because the revert had restored the
exact bytes the approval named. A commit sha distinguishes those two states;
content hashes cannot.

The cost is real and accepted: if `main` moves before CI runs, the approval no
longer names the tip and must be reissued. That is one re-run of the command
above, and it fails closed — an honest human is blocked, never an attacker
admitted.

A change that renames a Class-2 file needs approval for BOTH paths, and a
deletion needs one with `content-hash: deleted`.

Multiple `approves:` blocks may appear in one entry when a single decision
covers several files. Each block is parsed independently — a path cannot borrow
another block's hash (R2-32).

Entries are append-only history, like `reports/`.
