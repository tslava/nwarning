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

### Store credentials — done

Set as environment secrets and verified against both live stores on 2026-08-11.
Both stores had **1.1** published at that point, Chrome at 100% deploy with nothing
pending review, the AMO listing public.

The Chrome consent screen is "In production", so its refresh token does not expire
on the seven-day rule. It can still be revoked or invalidated another way, which is
what the check below is for.

### Where the secrets go

Into the **`stores` environment**, not the repository's own secrets:

```bash
gh secret set CWS_CLIENT_ID --env stores
```

A repository secret is readable by any workflow on any branch. An environment
secret is readable only by a job that names that environment, and naming it costs
an approval — so nothing can reach these credentials without a deliberate click.
The publish job already runs in `stores`, and so does the credential check below.

### Chrome Web Store, step by step

Google's own walkthrough is
<https://developer.chrome.com/docs/webstore/using-api>. Console labels moved in the
2025 redesign, so both names are given below.

**1. Two values you already have, both in one URL.** In the
[developer dashboard](https://chrome.google.com/webstore/devconsole), open the
extension itself and read the address bar:

```
https://chrome.google.com/webstore/devconsole/ab12cd34-.../eokbkdojkjdmphhfcm.../edit
                                              ^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^
                                              publisher id  extension id
```

The segment after `devconsole` is `CWS_PUBLISHER_ID` — the identifier of your
developer account. The next one, 32 letters, is `CWS_EXTENSION_ID`.

Do not look for a "Publisher ID" field on the Account page: that page is about
_group publishers_, a separate thing you have to create, and an account that has
never created one shows nothing there. The publisher id an individual account
uploads with is the one in the URL above.

**2. A Google Cloud project.** [console.cloud.google.com](https://console.cloud.google.com)
→ project picker at the top → **New project** → any name → Create, then make sure
it is the selected project.

**3. Enable the API.** **APIs & Services → Library** → search
`Chrome Web Store API` → **Enable**. Without this every call returns 403 no matter
how good the token is.

**4. The consent screen.** **APIs & Services → OAuth consent screen**, which in the
newer console is **Google Auth Platform** with the same content split up:

- _Branding_ (was the first consent-screen page): app name, user support email,
  developer contact.
- _Audience_: user type **External**. Then **Publishing status → In production**
  (the "Publish app" button). See the warning below — this is the step people skip.
- _Data Access_ (was "Scopes"): **Add or remove scopes** → paste
  `https://www.googleapis.com/auth/chromewebstore` → Update → Save.

  Saving raises **"Verification required — a sensitive scope was added"**, and the
  page then asks for a written justification and a demo video on YouTube. Click
  Continue and ignore all of it. Verification is what lets _other people_ grant
  your app access to _their_ extensions; the only user here is the account that
  owns this one. The single consequence of staying unverified is the "Google
  hasn't verified this app" screen when authorizing, which is cleared with
  **Advanced → Go to … (unsafe)**.

  Verification and publishing status are independent, and only the second one
  matters for the token's lifetime — an unverified app **in production** still
  gets a non-expiring refresh token.

**5. The OAuth client.** **Credentials → Create credentials → OAuth client ID**, or
_Clients → Create client_ in the newer console:

- Application type: **Web application**
- **Authorized redirect URIs → Add URI**, exactly:
  `https://developers.google.com/oauthplayground`
- Create. The dialog shows the **Client ID** and **Client secret** — those are
  `CWS_CLIENT_ID` and `CWS_CLIENT_SECRET`. The secret can be re-read later from the
  client's page.

**6. The refresh token**, in the
[OAuth 2.0 Playground](https://developers.google.com/oauthplayground):

- gear icon, top right → tick **Use your own OAuth credentials** → paste the client
  id and secret.
- Left panel, the box under the API list: type
  `https://www.googleapis.com/auth/chromewebstore` → **Authorize APIs**.
- Sign in **as the account that owns the extension in the store**, and click through
  the "Google hasn't verified this app" warning.
- Back in the playground, step 2 → **Exchange authorization code for tokens**. Copy
  the **Refresh token** — that is `CWS_REFRESH_TOKEN`.

**7. Store them.** Each command prompts for the value; paste and press enter, so
nothing lands in shell history:

```bash
gh secret set CWS_EXTENSION_ID  --env stores
gh secret set CWS_PUBLISHER_ID  --env stores
gh secret set CWS_CLIENT_ID     --env stores
gh secret set CWS_CLIENT_SECRET --env stores
gh secret set CWS_REFRESH_TOKEN --env stores
```

**8. Check them** — see "Checking the credentials" below, with `chrome` as the
store. It reads the item and prints the version the store currently has.

> **Do not leave the publishing status on "Testing".** Google's words: a project
> with an external user type and a publishing status of "Testing" is issued a
> refresh token expiring in 7 days, unless the scopes are only name, email and
> profile. Ours is not. The pipeline then works today, and next week fails with an
> `invalid_grant` that reads exactly like a mistyped secret. Verification is not
> required to be "In production"; the unverified-app warning is just clicked
> through.

Authorizing with the wrong Google account gives a token that works and still cannot
see the item — the check reports that as a 404 on the item rather than an auth
error, which is the same symptom as a wrong extension id.

### addons.mozilla.org, step by step

**1. Generate the key.** [Developer Hub](https://addons.mozilla.org/developers/) →
your avatar → **Manage API Keys** → generate credentials. You get:

- **JWT issuer**, looking like `user:12345:67` → `AMO_JWT_ISSUER`
- **JWT secret**, a long hex string → `AMO_JWT_SECRET`

**2. Copy the secret now.** It is displayed once. If it is lost, revoke and
generate a new pair; there is no way to read it back. A truncated paste fails
exactly like a wrong one.

**3. Store them:**

```bash
gh secret set AMO_JWT_ISSUER --env stores
gh secret set AMO_JWT_SECRET --env stores
```

**4. Check them** with `firefox` as the store. It authenticates, then reads the
add-on to confirm this account can see the thing it is meant to be updating.

### Checking the credentials

```bash
gh workflow run "Verify store credentials" --ref main -f store=chrome
gh run watch "$(gh run list --workflow 'Verify store credentials' --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Or Actions → **Verify store credentials** → Run workflow. Either way it waits for
your approval first, because the credentials live in the `stores` environment.

It exchanges the Chrome refresh token and fetches the item's status, signs an AMO
JWT and reads the add-on — all reads, nothing submitted. `store` takes `chrome`,
`firefox` or `both`, so each half can be checked as it is set up.

The Chrome half deliberately calls the same v2 endpoint the upload does,
`chromewebstore.googleapis.com/v2/publishers/{publisherId}/items/{extensionId}`,
because the old v1.1 API has no notion of a publisher id: checking against that
one passes with a wrong `CWS_PUBLISHER_ID` and the release then fails.

`node tools/check-store-credentials.mjs [chrome|firefox]` does the same locally if
the variables are in the environment, which is the faster loop while fixing a bad
value.

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

## When the publish step fails

Read which step failed before anything else; they are separate on purpose.

- **Upload succeeded, publish refused** — "your submission does not meet the
  requirements to be published" is about the _listing_, not the archive or the
  credentials. The version is sitting in the dashboard as a draft, and the dashboard
  says what is missing. Since 1.1 was published Chrome made the Privacy tab
  mandatory: single purpose, a justification per permission, and the data-usage
  certifications. `STORE-LISTING.md` has all of them written out. Fill them in, then
  either press Publish in the dashboard or re-run the failed job.
- **Upload failed** — that is the archive or the credentials. Run the credential
  check; if it passes, the archive is the problem.

Re-running a failed job uses the workflow file **from the tag**, not from `main`, so
a fix to `release.yml` only takes effect from the next tag onwards.

## Expect the two stores to diverge

Chrome review is usually quick, AMO's can take longer. Colleagues on Chrome may
get an update before you do on Firefox. That is normal, not a failed release.

## Only you can release

The store credentials live in the `stores` environment and the accounts are
personal. If that should not be a single point of failure, add a co-author on AMO
and use a Chrome Web Store group publisher — both are far easier to set up now
than to retrofit after a transfer.
