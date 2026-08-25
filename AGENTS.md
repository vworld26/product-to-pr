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
6. Treat committing, pushing, opening a pull request, merging, deleting, and
   other consequential actions as separately approved steps.
7. Finish each implementation batch with the diff, tests, typechecking,
   decisions, unresolved questions, and recommended next checkpoint.

## Commit messages

Use Conventional Commits for every commit. Choose the type that best describes
the change, such as `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, or `chore:`.
Keep the subject concise, imperative, and focused on the observable change.
