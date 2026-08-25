# Product roadmap

This roadmap is organized around user outcomes rather than release dates. Its
order may change as evidence from users, implementation constraints, and safety
reviews becomes available.

Status labels:

- **Available** — implemented in the current repository.
- **Next** — the nearest planned outcome.
- **Later** — valuable after the preceding foundations are proven.
- **Explore** — requires discovery before commitment.

## Available: repository-aware specification

**Outcome:** A product contributor can turn a plain-language request into a
structured plan grounded in an existing repository.

Current capabilities include:

- repository structure, entry-point, test, and relevant-file inspection;
- discovery and reporting of root and nested `AGENTS.md` instructions;
- Codex-assisted product reasoning with explicit clarifying questions;
- acceptance criteria, dependencies, implementation steps, risks, and test plans;
- interactive approve, modify, and reject choices;
- preservation of approved specifications without overwriting existing files;
- explicit output-file handling with safe failure behavior;
- creation of an isolated implementation branch after separate approval; and
- automated pull-request checks for type checking and tests.

## Available: approved plan to verified local change

**Outcome:** A user can authorize implementation of an approved specification
and inspect a verified local diff before anything is published.

Current capabilities:

- bind implementation to the exact approved specification and repository state;
- translate acceptance criteria into a scoped implementation checklist;
- apply changes only on the approved isolated branch;
- preserve pre-existing and unrelated working-tree changes;
- run repository-prescribed checks and targeted tests with explicit approval;
- report failures with actionable recovery guidance;
- compare the completed work against each acceptance criterion; and
- present the full diff, changed-file summary, and verification evidence before
  offering commit or publication actions.

Exit evidence:

- an end-to-end example proceeds from approved specification to reviewed local
  diff without modifying unrelated files;
- tests cover approval boundaries, dirty-tree handling, command failures, and
  acceptance-criteria reporting; and
- the user can stop after any stage with a useful local artifact and clear state.

## Available: review-ready pull request

**Outcome:** A user can turn an approved and verified local change into a pull
request that gives reviewers the context they need.

Current capabilities:

- propose a Conventional Commit message derived from the observable change;
- create a commit only after the user reviews the diff and approves committing;
- push only the approved branch and open a pull request only after separate
  approval;
- generate a pull-request description linking the request, product decisions,
  acceptance criteria, implementation summary, risks, and test evidence;
- incorporate continuous-integration results into the final status; and
- support revision loops without losing the approved specification or review
  history.
- repository-persisted Guide me, Build with me, and Take the lead modes that
  adjust routine pauses and explanation while preserving publication approvals.

Exit evidence:

- reviewers can trace every material change to the approved specification;
- publication actions are independently authorized and auditable; and
- failed pushes or pull-request operations leave the local branch recoverable.

## Next: quality, evaluation, and recovery

**Outcome:** Teams can understand whether Product-to-PR produces reliable plans
and changes, and can recover safely when it does not.

Candidate capabilities:

- richer autonomy policies for safe retries and repository-specific risk levels;
- evaluation fixtures for specification quality, repository grounding, scope
  control, and acceptance-criteria coverage;
- structured event logs with sensitive-data boundaries;
- bounded retries and resumable stages for transient failures;
- independent review of plans and diffs for contradictions, omissions, and
  unintended scope; and
- configurable policy gates for higher-risk repositories or changes.

## Explore: team workflows and integrations

**Outcome:** Product and engineering teams can adapt the workflow to their
existing systems without weakening its approval and evidence model.

Discovery areas:

- templates for organization-specific product briefs and acceptance criteria;
- issue-tracker and product-document imports;
- pull-request, continuous-integration, and code-review integrations;
- shared approval records and handoffs between product and engineering; and
- metrics that measure review quality, rework, cycle time, and safe completion
  rather than generated output volume.

These areas should advance only when the local, single-user workflow is reliable
and the integration preserves explicit authorization and repository boundaries.

## Roadmap decision rules

Prioritize work that:

1. completes a real user journey rather than adding an isolated capability;
2. reduces ungrounded assumptions or makes uncertainty easier to review;
3. strengthens scope control, reversibility, and recovery;
4. produces observable evidence of correctness; and
5. helps users and reviewers understand the change.

Defer work that primarily increases autonomy, integrations, or output volume
without first improving trust, verification, and control.
