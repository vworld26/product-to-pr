# Product-to-PR

Product-to-PR helps a product contributor turn a plain-language feature request and an existing codebase into a structured, reviewable implementation plan.

Product-to-PR guides a user from product intent to a verified, reviewable pull
request. It keeps specification approval, implementation, verification,
committing, pushing, and pull-request creation as separate decisions.

It begins by restating a short request in plain language, then asks focused
questions about the user, desired behavior, configurable choices, outputs, and
boundaries before turning those decisions into technical implementation work.
Low-risk, reversible recommendations are shown together so the user can accept
all, review them individually, or decline them. Material scope, user, data,
safety, and outcome decisions remain separate questions.

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

## Run it

```bash
npm install
npm run dev -- . "Add a way to export a project plan as Markdown"
```

You can also start from a GitHub repository URL:

```bash
npm run dev -- https://github.com/owner/repository "Add a greeting command"
```

Before the first interactive planning session for a repository, Product-to-PR asks which AI
coding tool you intend to use and runs a guided readiness check. The check uses
safe, read-only commands to explain whether Git, GitHub, the repository, and the
selected provider are ready. Workflow blockers must be fixed or handled by
choosing another provider. Non-blocking risks are accepted together in one
confirmation. Product-to-PR never installs tools or changes settings during
preflight.

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

Choose which AI makes the local implementation changes:

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
stored plan, and continues at the operating-mode choice without repeating
discovery. Version 1 resumes only from the approved-specification checkpoint.

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
finding and evidence behind every score. These evaluations are advisory; they
do not silently approve or reject work.

Quality events are recorded outside the repository in the operating system's
application-data folder. The append-only record contains timestamps, hashed
repository identifiers, artifact types, outcomes, scores, provider names, and
finding counts. It never contains repository paths or contents, prompts, diffs,
credentials, or tokens. A logging failure is reported but does not block the
workflow.

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

## Collaboration levels

- **Guide me** — Explain each stage and ask before implementation and verification.
- **Build with me** — Handle routine implementation and verification, then bring back the review.
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
5. Add repository inspection in version 2.

## Product direction

- [Product vision](docs/product-vision.md) describes who Product-to-PR serves,
  the outcome it aims to create, and the principles that guide decisions.
- [Roadmap](docs/roadmap.md) shows the outcome-based path from the current
  planning workflow toward safe, reviewable implementation.
- [Product brief](docs/product-brief.md) records the original Version 1 scope.
- [Learning guide](docs/learning-guide.md) explains the concepts behind the
  code.
