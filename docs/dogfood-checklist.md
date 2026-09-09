# Product-to-PR dogfood checklist

Use this checklist with a disposable repository, such as the public
[`product-to-pr-demo`](https://github.com/vworld26/product-to-pr-demo) practice
repository. Do not start with private, production, or sensitive code.

## Before you begin

1. Confirm Node 20 or newer, Git, GitHub CLI, and Codex CLI are installed.
2. Sign in to GitHub CLI and Codex CLI yourself.
3. Clone the practice repository into a folder you can safely discard.
4. Run `npm install` and its documented checks in that practice repository.

## Guided run

Run Product-to-PR with a small request, for example:

```bash
npm run dev -- /path/to/product-to-pr-demo "Add a friendly fallback greeting"
```

Use Guide me. At each stage, record whether you understood:

- what Product-to-PR was going to do;
- why the step mattered;
- what it could and could not change; and
- what choice was being asked of you.

Stop before merge. A successful test may create a branch, commit, push, and
pull request only when the tester explicitly approves each action.

## Feedback to capture

- Operating system and versions of Node, Git, GitHub CLI, and AI tool.
- The first command or explanation that felt unclear.
- Exact error text, plus the step where it appeared.
- Whether the safety stops felt useful, excessive, or confusing.
- Whether the final plan and pull request made the requested change easy to review.
- One improvement that would make a first run easier.

Do not include credentials, tokens, private repository contents, or sensitive
screenshots in feedback.
