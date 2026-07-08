# AGENTS.md

Guidance for automated agents and reviewers working in the atlas-memory
repository (the knowledge-graph + conversation-history memory service).

## Review guidelines

Automated reviewers — including the GitHub Codex connector, which reads this
section — treat the code and diff as ground truth; the PR description, title, and
commit messages are unverified claims.

- Reconstruct the diff independently: state what each change actually does, change
  by change, in your own words. Do not read intent from the description. Report gaps
  between what the diff does, what a correct fix should do, and what the description
  claims.
- Cite `file:line` for every finding. Classify each as **BLOCKER / MAJOR / NIT /
  LGTM**; blockers must cite `file:line`. Lead with the blockers.
- Hunt these categories, clearing each only by trying to break it and failing (not
  by "did not notice a problem"):
  - **Data integrity** — graph writes, migrations, transactions, idempotency, and
    dedup keys. A memory store must not silently corrupt, drop, or duplicate
    facts/episodes; check that partial failures roll back and that re-ingesting the
    same input is a no-op.
  - **Contract** — function signatures, return shapes, schema and embedding
    dimensions, and API response shapes.
  - **Concurrency** — check-then-act, races, and await-ordering on shared graph/DB
    state.
  - **Security** — authn/authz, injection (including query/graph injection),
    secrets, SSRF, deserialization.
  - **Resource** — connection leaks, unbounded result sets, and missing
    timeout/limit on queries.
- Only BLOCKER (exploitable security / realistic data loss or corruption) and MAJOR
  (breaks a primary or plausible path, silent failure, broken contract, race under
  load) block; each must state the concrete failure path — exact input or sequence —
  or be downgraded. NITs are non-blocking, and "LGTM — no BLOCKER/MAJOR" is a valid,
  complete result.
