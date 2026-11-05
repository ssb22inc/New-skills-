Approved-by: Sheldon
Date: 2026-10-24
approves: fullburn/engine/scripts/gate-lib.mjs
base-commit: 14d43dcb9a71e0765c6ba7a97ba499b7a8c48d3e
from-content-hash: de18892f23a2606e06c346e729ca7c490b865e4f0bd799bcf2650effe3f1ed8d
content-hash: 72672b7adcf114a0f82a3081361c5f44e0d85640ac0b1b3de9f6c5dfbd193b08
Reason: checkReportProvenance takes the signer workflow, so the completion checker can verify the live check's attestation (fullburn-live.yml) and a review signature cannot pass as a live one (ledger L81)
