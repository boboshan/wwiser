# Contributing & Release Process

This documents how development, versioning, and deployment work for Wwiser.

## TL;DR

```
feature branch  →  PR (CI must pass)  →  merge to main
       main      →  release-please opens/updates a "Release PR"
   merge Release PR  →  tag vX.Y.Z + GitHub Release  →  auto-deploy to production
```

A plain push to `main` **never** deploys. Production only updates when a Release is published.

## Branching model

Trunk-based. `main` is always production-shippable and is protected — no direct
pushes; everything lands through a reviewed PR with green CI.

Day-to-day work happens on short-lived branches off `main`:

| Prefix      | For                                   |
| ----------- | ------------------------------------- |
| `feat/*`    | new features                          |
| `fix/*`     | bug fixes                             |
| `chore/*`   | tooling, deps, config                 |
| `refactor/*`| internal restructuring, no behavior Δ |
| `docs/*`    | documentation only                    |

Long-running experiments live on their own branch (e.g. `chore/deps-and-vite-plus`)
and are rebased onto `main` periodically. They are not part of the release flow
until merged.

## Commit messages — Conventional Commits

The changelog and version bumps are generated from commit messages, so format matters:

```
<type>(<optional scope>): <summary>
```

Common types: `feat`, `fix`, `perf`, `refactor`, `docs`, `chore`, `test`.

Version impact (SemVer):

- `fix:` → patch (0.2.0 → 0.2.1)
- `feat:` → minor (0.2.0 → 0.3.0)
- `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer → major (0.2.0 → 1.0.0)

While the app is pre-1.0, breaking changes bump the minor.

## CI — what every PR must pass

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every PR and push to `main`:

```sh
pnpm install --frozen-lockfile
pnpm run check   # svelte-check / type-check
pnpm run lint    # prettier --check + eslint
pnpm test        # vitest
pnpm run build   # production build
```

Run them locally before opening a PR. `pnpm run format` auto-fixes formatting.

## Versioning & releases — release-please

[`.github/workflows/release-please.yml`](.github/workflows/release-please.yml) watches
`main`. As conventional commits land, it keeps an open **Release PR** that:

- bumps the version in `package.json`,
- updates `CHANGELOG.md`.

When you're ready to ship, **merge the Release PR**. That tags `vX.Y.Z`, creates a
GitHub Release, and triggers deployment. Version state is tracked in
[`.release-please-manifest.json`](.release-please-manifest.json); behavior is configured
in [`release-please-config.json`](release-please-config.json).

## Deployment — Cloudflare Workers

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs `wrangler deploy`
**only** when a GitHub Release is published (or manually via the Actions tab → "Deploy"
→ Run workflow).

### One-time setup

1. **Disconnect Cloudflare's auto-deploy** so pushes stop deploying:
   Cloudflare Dashboard → Workers & Pages → `wwiser` → Settings → Build →
   disconnect the connected GitHub repository.
2. **Add repo secrets** (GitHub → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` — a token created from the "Edit Cloudflare Workers" template.
   - `CLOUDFLARE_ACCOUNT_ID` — your account ID (Workers & Pages → right sidebar).
3. **Protect `main`** (GitHub → Settings → Branches → add rule for `main`):
   require a PR and require the `CI` check to pass before merging.

## Previewing changes

Each PR is validated by CI. For a live preview, the Cloudflare preview URL pattern
(`wrangler versions upload` against the existing `preview_urls: true` config) can be
wired into CI later — for now, preview locally with `pnpm dev` or `pnpm run preview`.
