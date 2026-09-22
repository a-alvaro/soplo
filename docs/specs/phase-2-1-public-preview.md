# Phase 2.1 Spec — Public preview deployment

> Status: implementation-ready.
> Target: `soplo.alx.engineering`.
> Hosting: GitHub Pages through GitHub Actions.
> Rules: `AGENTS.md` applies; no solver, physics, UI or acceptance-gate changes.

## 1. Goal

Publish the current validated SOPLO build as a static HTTPS site so the
maintainer can test and share it without cloning the repository. Deployment
must be reproducible from `main`, must not commit generated `dist/` files and
must preserve the existing Node 20/24 CI.

The intended hostname is `soplo.alx.engineering`. The spelling
`soplo.alx.enginnering` is invalid because the registered domain is
`alx.engineering`.

## 2. Hosting decision

Use GitHub Pages because the application is a client-only Vite build and its
source already lives on GitHub. A dedicated Actions workflow builds and uploads
`dist/`; Pages deploys only from the default branch. This keeps hosting coupled
to reviewed source without adding a server or a third-party runtime account.

The Pages build uses relative asset paths so both the temporary project URL and
the custom-domain root can load JavaScript, CSS and the module Worker. The
normal production build remains unchanged.

## 3. Workflow contract

Add `.github/workflows/deploy-pages.yml` with:

- triggers on pushes to `main` and manual dispatch;
- `contents: read`, `pages: write` and `id-token: write` permissions;
- one build job using the repository's supported Node version, `npm ci`,
  `npm run test:fast` and a Vite build with relative base;
- upload of `dist/` through the official Pages artifact action;
- one deploy job targeting the protected `github-pages` environment;
- concurrency that prevents overlapping deployments without cancelling a live
  production deployment halfway through.

The existing CI workflow remains the Node 20/24 compatibility gate. Deployment
does not replace or weaken it.

## 4. Domain sequence

Follow this order to avoid a dangling DNS record:

1. Deploy and verify the default GitHub Pages URL.
2. In repository Pages settings, set the custom domain to
   `soplo.alx.engineering`.
3. Only then create this Namecheap Advanced DNS record:

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | CNAME | `soplo` | `a-alvaro.github.io` | Automatic |

4. Verify with `dig soplo.alx.engineering CNAME +short`.
5. Wait for GitHub's certificate, enable/enforce HTTPS and verify the final URL.

Do not use a wildcard DNS record and do not point the CNAME at a repository
path. DNS propagation and certificate issuance may take up to 24 hours.

Changing GitHub Pages settings or Namecheap DNS is an external account action
and requires maintainer confirmation at the point of change. Credentials are
never stored in the repository or provided to SOPLO.

## 5. Verification

Before changing DNS:

1. `npm run test:fast` passes.
2. Normal `npm run build` passes.
3. Pages-mode build passes and emits a distinct Worker asset.
4. Local preview of the Pages artifact loads with no missing assets or console
   errors; run, pause, reset and field switching work.
5. The GitHub Pages workflow succeeds on `main` and its temporary URL loads.

After DNS:

1. `soplo.alx.engineering` resolves to `a-alvaro.github.io`.
2. HTTPS is valid and HTTP redirects to HTTPS.
3. A production smoke reaches at least 1,000 steps with finite fields and no
   Worker or console error.

## 6. Definition of Done

- Reproducible Pages workflow committed and green.
- Default Pages URL verified before custom DNS.
- Custom domain configured in GitHub before the Namecheap CNAME.
- Final HTTPS URL loads the application and passes the smoke.
- README links to the live preview and identifies it as an educational 2D tool.
- No generated build output, secret, solver change or unrelated UI work enters
  the phase.

## 7. Out of scope

- WebGPU implementation; its direction is recorded separately in
  `webgpu-backend-roadmap.md`.
- Bundle splitting, routing, analytics, telemetry or a backend service.
- Product copy redesign, interpretation UI or streamline reconciliation.
- Any change under `src/lbm/` or `src/physics/`.

## 8. Discrepancy protocol

If Pages cannot be enabled, the temporary URL fails, the Worker asset does not
load from relative paths or the custom domain conflicts with an existing site,
stop and record the exact workflow/DNS state. Do not switch providers, rewrite
application routing or change DNS records outside `soplo` without a spec
amendment and maintainer decision.

## 9. References

- [GitHub Pages custom Actions workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages custom subdomains and DNS](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## 10. Implementation finding — first-time Pages enablement

**F1 (2026-09-22, external setup required):** the first `main` deployment run
(`35748057870`) stopped at `actions/configure-pages@v5` before dependency
installation or build:

```text
Get Pages site failed. Please verify that the repository has Pages enabled and
configured to build using GitHub Actions.
HttpError: Not Found
```

This is the expected first-time repository state, not an application or
workflow-build failure. The normal CI for the same `main` commit continues
independently. Local evidence remains green: 38/38 fast tests, normal build,
relative-base Pages build, emitted 17.20 kB Worker and browser smoke through
run/pause/reset/Ux with no console warning or error.

The official action's `enablement` option cannot use the repository
`GITHUB_TOKEN`; it requires a separate personal or GitHub App token with
administration/Pages permissions. SOPLO will not add that persistent credential
for a one-time setup. The maintainer must instead select **Settings → Pages →
Build and deployment → Source: GitHub Actions**. After that, rerun the failed
workflow or dispatch `Deploy Pages` manually from `main`.

Do not create the Namecheap CNAME until the rerun succeeds and the GitHub Pages
custom-domain field has been set to `soplo.alx.engineering`.
