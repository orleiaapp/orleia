# AGENTS.md

## Ship loop — standing rule (owner instruction)

After finishing any code change in this repo, **always**:

1. **Verify** — `npx tsc --noEmit -p tsconfig.json` and `npm run build` must pass.
2. **GitHub** — commit the change (only the files the change touched) with a
   descriptive message, and push to `origin master`.
3. **Vercel** — deploy with `vercel --prod --yes`, then confirm the production
   URL (`https://app.orleia.app`) answers HTTP 200.

**No local preview walkthroughs** — do not spin up the dev server for a browser
preview; GitHub + Vercel is the review path, every time.

Do not commit unrelated files, and never `git push --force` or amend pushed
commits.
