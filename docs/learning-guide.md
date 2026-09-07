# Learning guide

## Files in this project

- `src/cli.ts` is the command-line entry point. It reads what the user typed.
- `src/plan.ts` contains the product logic. It turns an input into a plan.
- `src/format.ts` converts the plan object into readable Markdown.
- `src/implementation.ts` ties an approved plan to a branch, commit, and checklist.
- `src/provider.ts` defines the canonical Codex, Claude Code, and manual
  implementation choices and checks automated-provider availability.
- `src/execute.ts` safely asks the selected automated provider to make the
  approved local changes.
- `src/verify.ts` previews and runs known repository checks after approval.
- `src/review.ts` explains the diff, test evidence, and acceptance status.
- `src/publication.ts` commits and publishes only after separate approvals.
- `src/repository.ts` prepares an approved temporary folder for a GitHub URL.
- `src/handoff.ts` records who is responsible for pull-request review.
- `src/mode.ts` stores how much routine guidance the user wants.
- `src/preflight.ts` performs fixed, read-only readiness checks and explains the
  evidence.
- `src/preflight-flow.ts` guides provider choice, remediation, reruns, and one
  combined risk confirmation.
- `src/readiness-history.ts` keeps privacy-conscious device-level readiness and
  completed-session counts outside repositories.
- `src/evaluation.ts` defines the canonical specification and implementation
  rubrics and explains the evidence behind each score.
- `src/evaluation-fixtures.ts` contains deterministic examples that should pass
  or need improvement.
- `src/evaluation-live.ts` runs explicitly requested model checks against
  synthetic evidence in a temporary folder.
- `src/critique.ts` gives a different, read-only model the evidence needed to
  identify contradictions, omissions, unsupported claims, scope risks, and
  verification gaps.
- `src/critique-flow.ts` obtains sharing consent or creates a manual review
  handoff without treating it as a completed critique.
- `src/event-log.ts` records allowlisted quality metadata outside the
  repository without retaining prompts, repository contents, or credentials.
- `src/plan.test.ts` verifies important behavior automatically.
- `package.json` defines project commands and development dependencies.
- `tsconfig.json` configures the TypeScript compiler.

## Concepts to learn

### Type

A type describes the allowed shape of data. `ProductPlan` is the contract shared by the planner and formatter.

### Function

A function accepts inputs and returns an output. Small functions are easier to understand and test.

### Command-line interface

A CLI lets someone operate a program by typing a command. The words following the command are its arguments.

### Product discovery before technical planning

Product-to-PR first turns the short request into a plain-language description
of what the feature does, who it helps, and why it matters. The user confirms
or corrects that interpretation before answering adaptive product questions.
Decisions are labeled as user-confirmed, repository evidence, recommended
defaults, or assumptions to confirm so suggestions do not silently become
requirements.

Low-risk and reversible defaults are grouped to reduce unnecessary question
fatigue. The user can accept the group, review each recommendation, or decline
the group. Accepted items remain labeled as recommended defaults; they are not
rewritten as ideas the user originally supplied. Declined or unanswered items
stay unresolved and cannot silently enter acceptance criteria or implementation
steps. Choices that materially change scope, users, data, safety, or outcomes
are always asked separately.

### Test

A test runs code with a known input and checks the result. Tests help detect accidental behavior changes.

### Evaluation

A test proves that code behaves as expected for a known case. An evaluation
measures a quality judgment that can have degrees, such as whether a summary is
clear to a beginner or whether a plan is grounded in repository evidence.

Product-to-PR uses canonical rubrics so the same standards apply to every plan
and implementation review. Every result includes a zero-to-two rating, the
standard being measured, and concrete evidence. The total is only a summary;
one zero-score safety or quality finding still prevents the evaluation from
passing.

Deterministic fixtures run offline during normal testing. The live harness is a
separate opt-in command, uses synthetic repository evidence, and runs from an
isolated temporary folder so evaluating model behavior does not expose the
working repository.

### Independent critique and privacy-safe evidence

A rubric applies consistent standards; an independent critique asks a different
model to challenge the first model's work. Product-to-PR uses Claude Code to
critique Codex output and Codex to critique Claude Code output. The reviewer
runs in a temporary folder without editing tools. It can report structured
findings, but cannot change the artifact or make approval, publication, or merge
decisions.

Model independence cannot be inferred for work completed through an unknown
manual handoff. In that case—or when the independent provider cannot run—the
product saves and displays a provider-neutral prompt for the user to give to a
known different model. A handoff is labeled as a handoff, not as a completed
review.

Sending an artifact to a second provider is optional and requires an informed
choice at runtime. Product-to-PR states that the displayed plan or diff,
included repository evidence, and evaluation will be shared. Credentials and
tokens are never added. Its separate quality-event log stores only allowlisted
metadata: timestamps, hashes, artifact types, outcomes, scores, provider names,
and counts. That gives later evaluations useful trend evidence without creating
a second store of source code or model conversations.

### Build

TypeScript is checked and converted into JavaScript that Node.js can run.

### Implementation package

An implementation package records the approved specification, starting Git
commit, relevant files, repository instructions, and work to verify. It gives a
beginner a visible checklist and gives reviewers evidence that later changes
started from the approved scope.

### Resumable approved specifications

Specification approval creates a versioned session handoff containing the
approved plan, its integrity digest, repository source, branch, commit,
operating mode, and remaining actions. `--resume` reloads that checkpoint and
continues without repeating discovery only when the specification and
repository state still match. This conservative boundary prevents Product-to-PR
from applying an old plan to code that changed while the session was paused.

Version 1 resumes at the approved-specification stage. Once implementation
changes the branch or commit, a later recovery model is needed; the product does
not claim that partially completed implementation is resumable yet. Managed
workspace cleanup warns when it would remove the only saved session.

### Controlled local implementation

After the user separately chooses to build, Product-to-PR checks that the
branch, commit, specification, and working tree still match the approved
package. Only then does it ask the selected implementation provider to edit the
necessary files. Codex and Claude Code use separate command adapters but receive
the same prompt. Manual handoff saves and displays that prompt, waits while the
user gives it to another AI, and then rejoins the same validation flow. It
stops before tests, commits, pushes, or pull requests so each later action
remains a separate decision.

### Readiness before repository planning

The interactive workflow selects the intended implementation provider and runs
preflight before inspecting or sending repository context for planning. Fixed
checks can inspect Codex or Claude Code, but an unknown AI tool is never
executed. Instead, the user confirms a manual checklist and later receives the
same provider-neutral implementation handoff.

Readiness has four evidence labels: Passed, Needs attention, Could not verify,
and User confirmed. A blocker means the selected workflow cannot safely work;
other risks are explained and accepted together. Rerunning repeats only the
same read-only checks and never installs software or changes settings.

The small global history file uses hashes instead of repository paths or
specification text. An approved specification, completed local review, and
authorized pull-request handoff all refer to the same session identifier, so
the earliest milestone counts once and later milestones or resumed copies do
not count again. Repository-specific checks still run for a newly encountered
repository, and another check is offered after five more completed sessions.

### Verification and review

Product-to-PR shows the exact repository commands it can run and waits for a
separate verification choice. It records every pass or failure, compares the
local diff with the acceptance criteria, and explains what needs human review
before offering any commit or publication action.

### Commit and publication

After successful verification, Product-to-PR proposes a Conventional Commit
message. Committing, pushing, and opening a pull request each require a new
choice. The pull request carries the product outcome, changed files, acceptance
evidence, and verification results so reviewers can trace why the change exists.

The person operating Product-to-PR may also be the repository maintainer, or
may hand the pull request to a different maintainer. The tool records that
choice, can request a named GitHub reviewer, and stops before merge in either
case. Opening a pull request proposes work; merging accepts it into the main
codebase, so those remain separate decisions.

### Local paths and GitHub URLs

A local repository path lets Product-to-PR work directly in an existing folder.
A GitHub URL first needs a local working copy because code inspection, branches,
edits, and tests operate on files. Product-to-PR calls this a temporary working
folder, but explains that it is a real Git checkout. It shows the location,
asks before creating it, and allows the default branch or another existing
GitHub branch to be selected. Private repositories use the operator's existing
GitHub CLI authentication. Before deletion, the product warns that locally
saved specifications and unpushed work will also be removed.

### Graduated autonomy

An operating mode changes how often Product-to-PR pauses during routine work;
it does not remove repository rules or safety boundaries.

The implementation provider is a different choice. It selects who makes the
local code edits—Codex, Claude Code, or another AI through manual handoff—without
changing branch isolation, verification evidence, or approval boundaries.

- **Guide me** — Explain each stage and ask before implementation and verification.
- **Build with me** — Handle routine implementation and verification, then bring back the review.
- **Take the lead** — Move through routine work with less explanation while preserving safety stops.

Consequential actions remain separate choices in every mode.

An explicit request for faster progress or fewer routine pauses may produce one
informed Build with me offer during a Guide me session. Product-to-PR does not
infer emotion from writing style, does not switch automatically, and does not
repeat a declined offer during that session.

The product asks about this after specification approval, when the user has
enough context to understand what they are authorizing. A saved repository
preference can be overridden for one run, and `--mode choose` reopens the choice.

### Mixed-language inspection

Repository metadata is evidence, not a requirement. A Node repository can
describe itself through `package.json`; a skill repository may use `SKILL.md`;
and other repositories can be understood from their file types and structure.
Product-to-PR searches JavaScript, TypeScript, Python, Ruby, Shell, Markdown,
and common configuration files without pretending every repository uses npm.

Verification remains conservative. Recognized npm scripts and config-backed
pytest commands may be offered, but arbitrary Shell files are never executed
just because their names sound like checks. If no safe command is found, the
product reports that limitation and blocks publication.

Verification discovery separates three states: trusted commands that may run
after approval, possible checks that remain visible but cannot run, and no
available automated evidence. A repository can declare a supported trusted
command with `Product-to-PR verification:` in `AGENTS.md` or `SKILL.md`.
Declarations pass through a narrow parser, so adding shell operators or an
arbitrary executable does not grant execution authority. The resulting high,
medium, or low confidence describes automated evidence—not overall product
quality—and manual review remains necessary where evidence is incomplete.

## First exercise

Add a `Dependencies` section to `ProductPlan`, populate it in `createProductPlan`, render it in `formatPlan`, and update the test. Make the work on a new Git branch.
