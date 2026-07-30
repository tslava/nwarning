# Releasing

Both stores update installed copies themselves. Releasing means getting a new
version into them, which is `.github/workflows/release.yml` plus one approval.

## Cutting a release

1. Merge `dev` into `main`.
2. Bump the version — it is the single source of truth, both manifests take
   theirs from it at build time:
   ```bash
   npm version 1.4.0 --no-git-tag-version
   git commit -am "Bump version to 1.4.0"
   ```
3. Tag and push:
   ```bash
   git tag v1.4.0
   git push origin main --tags
   ```
4. The `build` job verifies the tag matches `package.json`, runs the full check,
   builds, packages, and creates a GitHub release with both zips attached. That
   part needs no approval, so the team can install a build immediately without
   waiting for either store.
5. The `publish` job waits for your approval in the `stores` environment, then
   uploads to both stores.

A tag that disagrees with `package.json` fails the build rather than shipping a
mislabelled archive.

## Why approval

Neither store has a rollback. A bad version can only be replaced by a higher one,
which means another review cycle. One click is cheap insurance.

## One-time setup

None of this can be automated; it all involves signing in as a human.

### GitHub

Create an environment named `stores` (Settings → Environments) and add yourself
as a **required reviewer**. Without this the publish job runs unattended, which
defeats the point.

### Chrome Web Store

Uses the Web Store API, which needs an OAuth2 client and a refresh token. Follow
Google's own walkthrough — the UI moves too often to be worth transcribing:
<https://developer.chrome.com/docs/webstore/using-api>

In short: a Google Cloud project → enable the Chrome Web Store API → an OAuth
client of type Desktop app → exchange a one-time authorization code for a refresh
token.

Repository secrets:

| Secret              | Where it comes from                                    |
| ------------------- | ------------------------------------------------------ |
| `CWS_CLIENT_ID`     | the OAuth client                                       |
| `CWS_CLIENT_SECRET` | the OAuth client                                       |
| `CWS_REFRESH_TOKEN` | the code-for-token exchange                            |
| `CWS_PUBLISHER_ID`  | Chrome Web Store developer dashboard, account settings |
| `CWS_EXTENSION_ID`  | the extension's dashboard URL, or its store page       |

### addons.mozilla.org

Developer Hub → Manage API Keys generates a JWT issuer and secret. The secret is
shown once.

| Secret           | Where it comes from |
| ---------------- | ------------------- |
| `AMO_JWT_ISSUER` | Manage API Keys     |
| `AMO_JWT_SECRET` | Manage API Keys     |

## Two things not to break

**The Firefox add-on id.** `environment-switcher@example.com` in
`src/shared/manifest.firefox.json`. It looks like a placeholder and was one, but
the add-on is published under it. AMO keys add-ons by this id, and extension
storage is keyed by it too, so changing it registers a _separate_ add-on:
existing installs stop updating and every stored setting is orphaned.

**The bundle is deliberately unminified.** AMO requires a separate source-code
submission only when the shipped code has been made unreadable, so keeping it
readable removes that step entirely — and lets reviewers in both stores read what
actually runs. The whole extension is well under 150 KB; minifying it saves
nothing worth this complication. If you ever turn minification back on, the
Firefox step needs `--upload-source-code` and something has to keep that archive
in sync.

## Expect the two stores to diverge

Chrome review is usually quick, AMO's can take longer. Colleagues on Chrome may
get an update before you do on Firefox. That is normal, not a failed release.

## Only you can release

The store credentials live in this repository's secrets and the accounts are
personal. If that should not be a single point of failure, add a co-author on AMO
and use a Chrome Web Store group publisher — both are far easier to set up now
than to retrofit after a transfer.
