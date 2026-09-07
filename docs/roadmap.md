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

- plain-language interpretation confirmation and adaptive product discovery
  before technical planning;
- decision-source labels that distinguish confirmed needs, repository evidence,
  recommended defaults, and assumptions;
- grouped accept, review, and decline choices for low-risk reversible defaults,
  while material product decisions remain separate questions;
- Node and mixed-language repository structure, entry-point, test, and
  relevant-file inspection without requiring `package.json`;
- discovery and reporting of root and nested `AGENTS.md` instructions;
- Codex-assisted product reasoning with explicit clarifying questions;
- acceptance criteria, dependencies, implementation steps, risks, and test plans;
- interactive approve, modify, and reject choices;
- preservation of approved specifications without overwriting existing files;
- inline display of the complete approved specification after it is saved;
- versioned approved-specification session handoffs that resume without
  repeating discovery and refuse changed repository or specification state;
- explicit output-file handling with safe failure behavior;
- creation of an isolated implementation branch after separate approval;
- automated pull-request checks for type checking and tests; and
- trusted, candidate, and unavailable verification classification with
  confidence and safe command-declaration guidance;
- canonical, evidence-backed rubrics for specification and implementation
  quality;
- deterministic evaluation fixtures plus a separate opt-in live-model harness
  that uses synthetic repository evidence;
- optional, explicitly consented critique of plans and implementations by a
  different read-only model, with provider-neutral fallback instructions; and
- privacy-conscious quality event logs containing hashes and bounded metadata,
  never repository contents, prompts, diffs, credentials, or tokens.

## Available: approved plan to verified local change

**Outcome:** A user can authorize implementation of an approved specification
and inspect a verified local diff before anything is published.

Current capabilities:

- run a guided, read-only readiness check before the first planning session for
  each repository, the required Codex planning and review dependency, and any
  different selected implementation provider;
- distinguish workflow blockers, accepted non-blocking risks, unavailable
  evidence, and user-confirmed checks with beginner-friendly next actions;
- support Codex and Claude Code automatic checks plus a non-executing manual
  checklist for other AI tools;
- keep privacy-conscious readiness and completed-session history outside
  repositories, without credentials, tokens, repository content, or
  conversations;
- offer another readiness check after five qualifying sessions without
  double-counting reruns or resumed sessions; and
- offer Build with me only after an explicit request for fewer routine pauses,
  requiring confirmation and preserving every consequential approval.

- bind implementation to the exact approved specification and repository state;
- translate acceptance criteria into a scoped implementation checklist;
- offer Codex, Claude Code, and provider-neutral manual implementation choices
  that preserve the same scope and evidence checks;
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

- accept either an existing local repository path or an approved managed
  working folder created from a public or accessible private GitHub URL;
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
- record whether the operator or another repository maintainer owns review,
  optionally request that reviewer, and always stop before merge.

Exit evidence:

- reviewers can trace every material change to the approved specification;
- publication actions are independently authorized and auditable; and
- failed pushes or pull-request operations leave the local branch recoverable.

## Available: quality, evaluation, and recovery

**Outcome:** Teams can understand whether Product-to-PR produces reliable plans
and changes, and can recover safely when it does not.

Current capabilities:

- Version 2 recovery checkpoints after implementation and after verification
  plus critique, with Version 1 specification-session compatibility;
- content-digest validation for repository state, specifications,
  implementation packages, local diffs, reviews, and manual critique prompts;
- no more than two retries after the first attempt for recognized transient
  failures in read-only model operations, never verification or publication;
- privacy-conscious events for retry attempts and plan or implementation risk
  levels; and
- standard, elevated, and restricted risk policies derived from plan evidence,
  completed changed paths, and repository instructions, with additional gates
  that operating modes cannot bypass.

## Next: launch and adoption

**Outcome:** New product contributors can understand Product-to-PR, learn the
workflow through practice, and decide confidently whether it fits their work.

Current launch work:

- prepare the repository, license, onboarding, practice path, and public website
  for a reviewable first release;
- explain the product, its safety model, and the learning journey on the public
  website;
- tutorials, exercises, and worked examples for users with limited technical
  experience;
- blog posts and reusable learning content derived from shipped features and
  dogfooding lessons;
- structured feedback channels and community participation; and
- responsible promotion and adoption experiments grounded in demonstrated
  product outcomes rather than generated-output volume.

This workstream should reuse evidence from real product use. It should not
present proposed capabilities as available or accelerate adoption ahead of
reliable implementation, verification, and recovery.

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
