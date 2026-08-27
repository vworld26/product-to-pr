# Product vision

## Vision

Product-to-PR helps product contributors move from a customer or business
outcome to a safe, repository-aware change that an engineering team can review
with confidence.

The product should make technical delivery more accessible without hiding the
decisions, evidence, and safeguards that responsible software changes require.

## Who it serves

The primary user is a product contributor who understands the customer and
business problem but is still developing technical fluency. They need help
turning intent into implementation-ready work while remaining in control of
product decisions and repository changes.

Engineering collaborators are an important secondary audience. They should be
able to understand what was requested, which assumptions were made, how the
repository informed the plan, and how the proposed change will be verified.

## Product promise

Given a plain-language outcome and an existing repository, Product-to-PR will:

1. inspect the repository and surface the evidence and instructions that matter;
2. identify material product questions instead of silently inventing answers;
3. produce a structured, testable specification for review;
4. preserve explicit approval boundaries before changing repository state; and
5. prepare implementation work that is isolated, verifiable, and easy to review.

## Guiding principles

### Product intent leads

Start with the user outcome and the reason it matters. Technical details should
support that outcome rather than substitute for a product decision.

### Evidence over assumption

Ground recommendations in repository structure, existing behavior, tests, and
local instructions. Clearly label uncertainty and ask only questions whose
answers materially change the product or implementation.

### Approval is specific and reversible

Treat specification approval, file changes, testing, committing, pushing, and
opening a pull request as distinct decisions. Prefer isolated branches,
non-destructive operations, and checkpoints that are easy to inspect.

### Plans are observable contracts

Acceptance criteria should describe behavior a person or automated check can
observe. Risks, dependencies, and verification should be part of the plan, not
follow-up details left for implementation.

### Teach while doing

Explain important decisions in plain language so users build technical fluency
and can challenge the plan. The product should augment judgment, not ask for
blind trust.

### Small complete journeys beat broad automation

Deliver the smallest end-to-end workflow that is useful and safe. Add autonomy
only when its boundaries, failure modes, and review experience are clear.

## Intended experience

The long-term workflow is a sequence of visible, user-controlled stages:

1. **Understand** — capture the requested outcome, inspect the repository, and
   discover applicable instructions.
2. **Decide** — ask material questions and record explicit product decisions.
3. **Specify** — generate a repository-aware plan with acceptance criteria,
   implementation steps, risks, and verification.
4. **Approve** — let the user approve, revise, or reject the specification and
   preserve the approved version.
5. **Implement** — make the approved change on an isolated branch, within the
   repository's instructions and the agreed scope.
6. **Verify** — run relevant checks and compare the result with every acceptance
   criterion.
7. **Review** — present the diff and evidence before any commit, push, or pull
   request, then create reviewable artifacts only with explicit approval.

## Product boundaries

Product-to-PR should not:

- conceal assumptions or resolve material ambiguity without the user;
- modify unrelated work or bypass repository instructions;
- treat a generated plan as approval to implement, publish, or merge;
- claim success without verification evidence;
- optimize for the volume of generated code or pull requests; or
- replace accountable product, engineering, security, or compliance judgment.

## Measures of success

The product is succeeding when:

- users can reach an approved, implementation-ready specification without
  needing to translate their request into engineering jargon;
- specifications make material unknowns, decisions, repository evidence, and
  verification requirements easy to review;
- implemented changes remain within approved scope and preserve unrelated work;
- reviewers can trace a change from the requested outcome through acceptance
  criteria, diff, and test evidence;
- users understand what will happen before each repository-changing action; and
- failures stop safely and provide a clear recovery path.

## Current focus

The current product supports the complete local journey from repository-aware
discovery and specification through approved implementation, verification,
review evidence, and a review-ready pull request. It preserves explicit control
over consequential actions and can use Codex, Claude Code, or a provider-neutral
manual handoff for implementation.

The current focus is proving that journey through real dogfooding, quality
evaluation, stronger recovery, and independent critique. Team integrations and
launch-and-adoption work should follow after the core workflow demonstrates
consistent, recoverable results.
