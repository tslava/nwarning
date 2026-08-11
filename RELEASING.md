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

### GitHub — done

Configured on 2026-08-03; recorded here so it is not redone or silently undone.

| Setting                                   | Value                           |
| ----------------------------------------- | ------------------------------- |
| Environment `stores`, required reviewer   | `tslava`                        |
| Environment `stores`, deployment branches | tag pattern `v*`, branch `main` |
| Actions → default workflow permissions    | write                           |

Both entries in that policy are needed and for different reasons. The `v*` tag is
what a release runs from. `main` is what the credential check runs from — it is
started by hand rather than by a tag, and without the branch in the policy it
fails before it starts, with `Branch not allowed to deploy to stores`. Add it with:

```bash
echo '{"name":"main","type":"branch"}' |
  gh api -X POST repos/tslava/nwarning/environments/stores/deployment-branch-policies --input -
```

Note that an environment named in a workflow but **not** created in the
repository is created implicitly, with no protection at all — so the approval
gate does not exist until the environment exists. Deleting it silently disarms
the gate rather than breaking the release.

The tag policy means the publish job cannot run from a branch, only from a `v*`
tag. Both workflows declare their own `permissions`, so the repository default
matters only as the ceiling the release job's `contents: write` needs; the
publish job, which is the one holding store credentials, declares `{}` and gets
no repository access.

### Where the secrets go

Into the **`stores` environment**, not the repository's own secrets:

```bash
gh secret set CWS_CLIENT_ID --env stores
```

A repository secret is readable by any workflow on any branch. An environment
secret is readable only by a job that names that environment, and naming it costs
an approval — so nothing can reach these credentials without a deliberate click.
The publish job already runs in `stores`, and so does the credential check below.

### Chrome Web Store

Two of the five are already in the
[developer dashboard](https://chrome.google.com/webstore/devconsole): the
extension id is in the URL of its page, and the publisher id is under Account.

The other three come from the Web Store API, which needs an OAuth client and a
refresh token. Google's walkthrough is
<https://developer.chrome.com/docs/webstore/using-api>; the shape of it is a Google
Cloud project → enable **Chrome Web Store API** → configure the OAuth consent
screen (External, scope `https://www.googleapis.com/auth/chromewebstore`) → an
OAuth client of type **Web application** whose authorized redirect URI is
`https://developers.google.com/oauthplayground` → authorize in the
[OAuth playground](https://developers.google.com/oauthplayground) with **Use your
own OAuth credentials** and exchange the code for a refresh token.

**Set the consent screen's publishing status to "In production".** While it is
"Testing", Google issues refresh tokens that expire after **seven days** — the
pipeline then works today and fails next week, with an `invalid_grant` that looks
like a mistyped secret. Verification is not required for this; the "unverified
app" warning is simply clicked through when authorizing.

Authorize with the account that owns the extension, or the token will be valid and
still unable to see the item.

| Secret              | Where it comes from                      |
| ------------------- | ---------------------------------------- |
| `CWS_EXTENSION_ID`  | dashboard URL, or the store page URL     |
| `CWS_PUBLISHER_ID`  | dashboard → Account → Publisher ID       |
| `CWS_CLIENT_ID`     | the OAuth client                         |
| `CWS_CLIENT_SECRET` | the OAuth client                         |
| `CWS_REFRESH_TOKEN` | the playground's code-for-token exchange |

### addons.mozilla.org

Developer Hub → Manage API Keys generates a JWT issuer and secret. The secret is
shown once and never again, so a truncated paste is the likely failure and looks
identical to a wrong one.

| Secret           | Where it comes from |
| ---------------- | ------------------- |
| `AMO_JWT_ISSUER` | Manage API Keys     |
| `AMO_JWT_SECRET` | Manage API Keys     |

### Checking the credentials

Run the **Verify store credentials** workflow (Actions → run it by hand, then
approve). It exchanges the Chrome refresh token and reads the item, signs an AMO
JWT and reads the add-on, and reports the version each store currently has — all
reads, nothing submitted. `node tools/check-store-credentials.mjs` does the same
locally if the six variables are in the environment.

Worth running before a release, and the first thing to run when a release fails at
the publish step: it distinguishes a dead credential from a rejected archive.

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

The store credentials live in the `stores` environment and the accounts are
personal. If that should not be a single point of failure, add a co-author on AMO
and use a Chrome Web Store group publisher — both are far easier to set up now
than to retrofit after a transfer.
