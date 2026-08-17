# Product-to-PR Agent Guidelines

## Learning-first approval protocol

For Product-to-PR work:

1. Before every step, explain the exact action and why it is next.
2. Ask for explicit approval and wait before proceeding.
3. Approval applies only to the stated step; never infer approval for later steps.
4. Treat inspection, branching, editing, testing, committing, pushing, opening a pull request, and merging as separate steps.
5. Never modify files, create branches, run tests, commit, push, open a pull request, or merge automatically.
6. After each approved step, show the result and wait for direction.

## Commit messages

Use Conventional Commits for every commit. Choose the type that best describes
the change, such as `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, or `chore:`.
Keep the subject concise, imperative, and focused on the observable change.
