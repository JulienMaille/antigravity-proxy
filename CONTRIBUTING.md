# Contributing to Antigravity Proxy

Thanks for wanting to contribute. This is a working proxy used in production — keep that bar in mind.

---

## What We Need

**Good contributions:**
- Bug reports with reproduction steps and proxy logs
- Fixes with a clear root cause explanation
- New provider adapters (follow the pattern in `src/adapters/`)
- Dashboard UI improvements that don't break existing functionality
- Documentation corrections (accuracy matters — no fluff)

**Not accepted:**
- Features that add dependencies without a strong justification
- Refactors with no functional change and no test coverage
- Anything that breaks the existing 49-test suite

---

## Before You Start

1. Search existing issues and PRs — your idea may already be in progress
2. For non-trivial changes, open an issue first and describe what you want to do
3. For bug fixes, include the relevant proxy log lines

---

## Setup

```bash
git clone https://github.com/12errh/antigravity-proxy.git
cd antigravity-proxy/proxy
npm install
cp .env.example .env
# Add at least one API key to .env
npm test
```

Tests must all pass before you submit a PR.

---

## Development

```bash
# Run the proxy in dev mode (auto-reloads on file changes)
npm run dev

# Type-check
npm run typecheck

# Run tests
npm test

# Build compiled output
npm run build
```

The dashboard is a single `proxy/dashboard/index.html` file — zero build step. Edit it directly and hard-refresh the browser.

---

## Code Standards

- **TypeScript** for all backend code. No `any` without a comment explaining why.
- **No new runtime dependencies** for things the standard library covers.
- **Error handling** on every external call (API, filesystem, DB).
- **No `console.log`** left in submitted code — use `logger.info/warn/error`.
- Match the style of the file you're editing.

---

## Pull Request Checklist

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm test` passes (all 49 tests green)
- [ ] No `console.log` or debug code left in
- [ ] No secrets or hardcoded credentials
- [ ] PR description explains what changed and why
- [ ] If you added a feature, you documented it

---

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(adapter): add Mistral provider support
fix(router): cap per-provider retries to avoid 50s backoff loop
docs(readme): correct port binding instructions for Linux
chore(deps): upgrade better-sqlite3 to 12.11.0
```

---

## Reporting Bugs

Open an issue with:
1. What you expected to happen
2. What actually happened
3. Relevant lines from `proxy/logs/proxy_*.log`
4. Your OS, Node.js version, and which provider you were using

**Do not post API keys or `.env` contents in issues.**

---

## Questions

Open a GitHub Discussion rather than an issue for general questions.
