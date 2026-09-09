# Product-to-PR

**Product-to-PR turns a plain-language feature request into a review-ready pull
request while keeping you in control of every consequential step.**

[![Product-to-PR in 80 seconds](https://vstewardgroup.com/video/product-to-pr-demo-poster.jpg)](https://vstewardgroup.com/products/product-to-pr/#see-it)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/vworld26/product-to-pr)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Watch the 80-second guided demo](https://vstewardgroup.com/products/product-to-pr/#see-it) ·
[Explore the practice repository](https://github.com/vworld26/product-to-pr-demo) ·
[Review the demonstration pull request](https://github.com/vworld26/product-to-pr-demo/pull/2)

## Start here

Product-to-PR begins with two things: a repository and a plain-language feature
idea. It checks the setup, reads the repository, restates the request in clear
language, and creates a specification for you to approve before it changes
code. It then stops at separate approvals for testing, committing, pushing,
and opening a review-ready pull request. It never merges the pull request.

### Use it on your computer

Best when the code is already in a local folder or you want to use your
existing development setup.

```bash
git clone https://github.com/vworld26/product-to-pr
cd product-to-pr
npm install
npm run dev -- . "Add a way to export a project plan as Markdown"
```

Point it at any local folder or GitHub URL:

```bash
npm run dev -- https://github.com/owner/repository "Add a greeting command"
```

Requirements: Node 20 or newer, Git, and the Codex CLI installed and signed in.
Product-to-PR currently uses Codex for product planning and acceptance review.
To work from a GitHub URL or create a pull request, you also need the GitHub CLI
(`gh`) signed in. Implementation can use Codex, Claude Code, or a prompt you
hand to another coding agent yourself.

### Try it in your browser — GitHub Codespaces

Best when the project is on GitHub and you do not want to install development
tools locally. The Codespaces badge opens a browser-based Linux workspace with
Node, Git, and the GitHub CLI, then installs Product-to-PR's dependencies. You
must still install and sign in to your selected AI coding tool, such as Codex,
before running Product-to-PR. Codespaces use is subject to your GitHub account's
included allowance and any spending limits.

Product-to-PR currently supports macOS and Linux environments. Windows has not
yet been verified as a supported environment; Codespaces is one browser-based
Linux alternative.

## Why this exists

I am a product person, not an engineer. I have led builds for decades without
becoming very technical, and AI has changed what that means: product managers
can now contribute directly instead of writing a spec and waiting. The problem
is that most of us do not know where to start, or how to get safely from a
feature idea to code on GitHub.

Product-to-PR is the process I wanted when I started. It guides me step by step,
and it grows with me as I learn.

## How it works

Ten steps from idea to pull request. It explains each one and stops for your
approval before anything that matters.

1. **Preflight** checks the repository, Git, GitHub, the required Codex planning service, and your selected implementation provider, then asks for one confirmation of the risks.
2. **Inspect** reads the codebase: structure, entry points, tests, and any instructions the repo already carries for AI agents.
3. **Restate** turns your one-line request into plain language you confirm or correct.
4. **Discover** asks focused product questions. Small reversible decisions are grouped; anything touching scope, users, data, safety, or outcomes gets its own question.
5. **Specify** writes the spec, labelling every decision by where it came from: something you confirmed, evidence in the code, a recommended default, or an assumption still open. Approved specs are saved so you can stop and resume.
6. **Branch** creates a working branch, after you approve, so nothing touches your main code.
7. **Implement** hands the approved spec to Codex, Claude Code, or a written prompt. During this stage, the agent can edit only the local implementation and cannot run checks or publish anything.
8. **Verify** runs only the checks the repository has declared safe, and tells you how much confidence the evidence gives.
9. **Review** shows the full diff and how the result measures up against each acceptance criterion.
10. **Publish** treats commit, push, and pull request as three separate approvals, and always stops before merge.

Every approval is a real stop. After the specification is approved, you can end
at each major checkpoint with saved work and a clear record of where you are.
Guide me introduces every stage before it begins, explains why it matters and
what it can change, then recaps what happened and what comes next.

## Who it is for

- Product managers and founders working with a coding agent on a real codebase
- Small teams that want a paper trail from request to PR
- Anyone who wants an agent to do the work without giving it the keys

## What it produces

- Feature summary
- Clarifying questions
- Acceptance criteria
- Implementation steps
- Risks
- Test plan
- Approved local implementation on an isolated branch
- Verification and acceptance evidence
- Reviewable commits and pull requests after separate approval

## Preflight and readiness

Before the first interactive planning session for a repository, Product-to-PR
asks which AI should implement the change and runs a guided readiness check.
The check uses safe, read-only commands to explain whether Git, GitHub, the
repository, and Codex are ready. Codex is always checked because this version
uses it for product planning and acceptance review. If Claude Code is selected
for implementation, it is checked too. Core workflow blockers must be fixed; a
blocker affecting only the implementation provider can be handled by choosing
another provider. Non-blocking risks are accepted together in one confirmation.
Product-to-PR never installs tools or changes settings during preflight.

Use `--preflight` to request a fresh check. Use
`--clear-preflight-history` to clear the small readiness record and run again:

```bash
npm run dev -- . "Add a greeting command" --preflight
npm run dev -- . "Add a greeting command" --clear-preflight-history
```

Readiness history is stored in the operating system's application-data folder,
not in the repository. It contains hashed repository and session identifiers,
provider choices, and counts. It does not contain credentials, tokens,
repository contents, specifications, or AI conversations. A fresh check is
offered after five more completed sessions; reruns and resumed copies do not
increase the count.

For a GitHub URL, Product-to-PR uses your existing `gh` authentication and
explains before creating an isolated temporary working folder. This supports
public repositories and private repositories you can access. At the end, you
choose whether to keep or delete that folder; it is never silently deleted.
The folder is a real Git checkout, and you can start from the default branch or
another branch containing work already pushed by you or another coding agent.
If it contains the only resumable session, Product-to-PR says so before asking
whether to delete the managed folder.

Choose a collaboration level for one run:

```bash
npm run dev -- . "Add a greeting command" --mode guide
npm run dev -- . "Add a greeting command" --mode build-with-me
npm run dev -- . "Add a greeting command" --mode take-the-lead
```

Use `--mode choose` to choose again and save a new preference for that
repository. Repository instructions and publication approvals apply in every
mode.

Choose which AI makes the local implementation changes. Codex remains required
for planning and acceptance review in every case:

```bash
npm run dev -- . "Add a greeting command" --provider codex
npm run dev -- . "Add a greeting command" --provider claude
npm run dev -- . "Add a greeting command" --provider manual
```

When `--provider` is omitted, Product-to-PR asks before it inspects and plans
against the repository. Codex and Claude Code receive the same approved scope
and cannot run verification or publish changes during implementation. Another
AI uses a manual checklist and provider-neutral handoff; Product-to-PR never
executes a command supplied for an unknown tool.

Manual handoff saves and displays the complete provider-neutral prompt. Give it
to another AI working in the same repository, then return to Product-to-PR so
the same repository checks, verification, review, and publication approvals can
continue. If Product-to-PR is already running inside Claude Code, use manual
handoff instead of trying to start a nested Claude Code session.

This provider choice applies to implementation only. Product reasoning and the
automated acceptance review remain Codex-backed in this version. After a plan
or local implementation review is displayed, Product-to-PR offers an optional
independent critique. Codex-produced work is reviewed by Claude Code and
Claude-produced work is reviewed by Codex. A manual implementation uses a
manual review handoff because Product-to-PR cannot prove which model produced
it.

Before an independent model runs, Product-to-PR explains which artifact and
repository evidence would be shared and asks once for consent. The reviewer
runs without edit tools and may only report contradictions, omissions,
unsupported claims, scope risks, and verification gaps. It cannot edit,
approve, publish, or merge. If an independent provider cannot run, the same
review instructions are saved and displayed for a different model instead of
silently reusing the original provider.

After a specification is approved, Product-to-PR saves a resumable session in
`.product-to-pr/sessions/`. Continue later from the same unchanged repository,
branch, and commit:

```bash
npm run dev -- /path/to/repository --resume /path/to/repository/.product-to-pr/sessions/session.json
```

Resume validates the approved specification and repository state, displays the
stored plan, and continues without repeating completed work. Version 2 adds
checkpoints after local implementation and after verification plus critique.
It validates the branch, commit, specification, implementation package,
changed-file list, diff content, and any manual critique prompt before it skips
a completed stage. Existing Version 1 approved-specification sessions remain
supported.

Clearly transient failures in read-only model work—product reasoning,
acceptance review, and independent critique—may be retried up to two times
after the first attempt. Product-to-PR explains each retry. Invalid input,
authentication failures, malformed responses, verification commands, commits,
pushes, pull requests, and other consequential actions are never retried
automatically.

Before implementation, Product-to-PR shows a baseline change-risk policy:

- **Standard** uses the existing approval sequence.
- **Elevated** adds one explicit confirmation before implementation and another
  before commit.
- **Restricted** stops after the approved specification and requires qualified
  maintainer or specialist review before implementation or publication.

The policy recognizes sensitive product wording and changed paths. A repository
can raise its minimum policy in `AGENTS.md` or `SKILL.md` with
`Product-to-PR risk: elevated` or `Product-to-PR risk: restricted`. A configured
standard level cannot lower a risk recognized from the plan or completed diff.
Operating modes and provider choices cannot bypass these gates.

## Verify it

```bash
npm run typecheck
npm test
```

Run the deterministic quality fixtures without contacting an AI service:

```bash
npm run evaluate
```

The canonical rubric evaluates beginner clarity, repository grounding,
requirement discipline, observable acceptance criteria, verification evidence,
scope control, reviewability, and recovery guidance. Product-to-PR shows the
finding and evidence behind every score. These heuristic evaluations are
advisory; they do not silently approve or reject work.

Quality events are recorded outside the repository in the operating system's
application-data folder. The append-only record contains timestamps, hashed
repository identifiers, artifact types, outcomes, scores, provider names, and
finding counts, plus bounded retry and risk-level metadata. It never contains
repository paths or contents, prompts, diffs, credentials, or tokens. A logging
failure is reported but does not block the workflow.

Live evaluation is always a separate opt-in action:

```bash
npm run evaluate:live
```

The live harness sends synthetic fixture content to Codex from an isolated
temporary folder. Normal tests and `npm run evaluate` never invoke an AI.

## Supported repositories

Product-to-PR inspects Node repositories with `package.json` and mixed-language
repositories containing JavaScript, TypeScript, Python, Ruby, Shell, Markdown,
or `SKILL.md` files. It can infer skill entry points and config-backed pytest
commands without requiring npm.

When no safe automated verification command is configured, Product-to-PR says
so explicitly and does not offer to commit. When possible check scripts exist
but are not configured as trusted commands, it reports that distinction. It
never guesses that an arbitrary Shell script is safe to execute.

Repositories can explicitly trust a supported command by adding a line to
`AGENTS.md` or `SKILL.md`, for example:

```text
Product-to-PR verification: npm test
```

Supported declarations are deliberately narrow: `npm test`, `npm run <script>`,
and `python -m pytest` (including `python3`). Shell operators and arbitrary
commands are rejected. Product-to-PR shows high, medium, or low verification
confidence based on the automated evidence available and calls out checks that
still require manual review.

Product-to-PR records the trusted verification setup before implementation
begins. If an implementation changes `package.json`, `pyproject.toml`,
`pytest.ini`, `AGENTS.md`, or `SKILL.md`, it will not automatically run newly
discovered commands. This guards against configuration changes during a run; it
does not make an untrusted starting repository safe. Review a repository before
approving dependency installation or any command it defines.

Approved specifications and recovery checkpoints are stored locally in
`.product-to-pr/`. Product-to-PR never stages them for its own commits. Add
`.product-to-pr/` to the repository's `.gitignore` if it is not already there,
so an unrelated manual commit does not accidentally include local session data.

## Collaboration levels

- **Guide me** — Introduce every stage, explain unfamiliar terms, and ask before implementation and verification.
- **Build with me** — Show concise stage transitions, handle routine implementation and verification, then bring back the review.
- **Take the lead** — Move through routine work with less explanation while preserving safety stops.

Collaboration level controls how often Product-to-PR pauses. Implementation
provider controls which AI edits the code. They are separate choices.

While Guide me is active, an explicit request such as “go faster” or “use fewer
pauses” can trigger one informed offer to switch to Build with me. Product-to-PR
does not infer frustration, never switches automatically, and does not repeat
the offer during that session after it is declined.

Commit, push, pull-request, merge, deletion, and material scope decisions remain
separately controlled in every level.

Before opening a pull request, Product-to-PR asks whether the operator is also
the repository maintainer or is handing review to another maintainer. It can
request an optional GitHub reviewer, then stops. Reviewing and merging remain
separate maintainer decisions in both situations.

## Learning milestones

1. Run the tool and inspect its output.
2. Change one output section and add a test.
3. Create a Git branch and commit the change.
4. Open a pull request explaining what changed and why.
5. Trace one feature from its approved specification through a review-ready pull
   request.

## Product direction

- [Product vision](docs/product-vision.md) describes who Product-to-PR serves,
  the outcome it aims to create, and the principles that guide decisions.
- [Roadmap](docs/roadmap.md) shows the outcome-based path from the current
  planning workflow toward safe, reviewable implementation.
- [Product brief](docs/product-brief.md) records the original Version 1 scope.
- [Learning guide](docs/learning-guide.md) explains the concepts behind the
  code.
