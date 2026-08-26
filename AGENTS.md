# Product-to-PR Agent Guidelines

## Learning-first collaboration protocol

For Product-to-PR work:

1. Before substantial implementation, explain the bounded feature scope,
   approach, acceptance criteria, and meaningful tradeoffs.
2. Ask for explicit approval of that feature scope and wait before proceeding.
3. After scope approval, routine inspection, branch creation, editing, and
   testing may proceed without additional approval stops.
4. Briefly teach important concepts and report meaningful milestones while
   work is in progress.
5. Stop and request direction if new information would materially expand or
   change the approved scope.
6. Unless accelerated delivery is explicitly enabled, treat committing,
   pushing, opening a pull request, merging, deleting, and other consequential
   actions as separately approved steps.
7. Finish each implementation batch with the diff, tests, typechecking,
   decisions, unresolved questions, and recommended next checkpoint.

## Accelerated delivery protocol

The user may explicitly enable accelerated delivery for a named feature batch
or sequence of batches. Once enabled, the approved scope authorizes the agent
to proceed without additional approval stops through:

1. synchronizing the base branch and creating an isolated feature branch;
2. inspection, implementation, documentation, and verification;
3. reviewing the finished diff and creating a Conventional Commit;
4. pushing the feature branch and opening a pull request;
5. waiting for required continuous-integration checks; and
6. merging only after all required checks pass, then synchronizing the local
   base branch.

Provide concise progress updates at meaningful milestones. Stop and request
direction when:

- work would materially expand or change the approved scope;
- tests or continuous integration fail and the fix is not routine and bounded;
- the change affects secrets, production systems, billing, data migrations,
  external users, or another sensitive boundary not included in the scope;
- repository policy requires human review or another approval; or
- a meaningful product, technical, or safety decision remains unresolved.

Accelerated delivery never authorizes deleting branches, working folders,
specifications, or other artifacts. It also never authorizes bypassing failed
or missing required checks, force-pushing, weakening protections, or merging
unreviewable work. Those actions require separate explicit approval.

Accelerated delivery applies only to the named batch or sequence. New or
materially different work requires a new scope approval.

## Commit messages

Use Conventional Commits for every commit. Choose the type that best describes
the change, such as `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, or `chore:`.
Keep the subject concise, imperative, and focused on the observable change.
