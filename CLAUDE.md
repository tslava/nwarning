# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser extension that displays visual environment banners (red for production, green for development) and enables one-click environment switching. Supports Chrome and Firefox, both on Manifest V3.

## Commands

```bash
npm install              # Install dependencies
npm run build            # Build both targets into dist/
npm run build:chrome     # Chrome only
npm run build:firefox    # Firefox only
npm run dev              # Watch both, unminified with source maps
npm run check            # typecheck + lint + tests — run before committing
npm test                 # Unit tests (vitest, jsdom)
npm run lint:ext         # web-ext lint against the built Firefox bundle
npm run all              # check, build, extension lint, package both
```

## Architecture

### Platform Abstraction

`src/shared/types/platform.ts` defines `PlatformAPI`; `src/platform/chrome/` and
`src/platform/firefox/` implement it. Shared code imports `platform` from
`src/shared/platform.ts`.

Selection happens **at build time**, not at runtime: `platform.ts` imports
`@platform-impl`, which webpack aliases to the target's implementation. Each
bundle therefore contains only its own platform code. Do not reintroduce runtime
`typeof browser` sniffing — it put both implementations in both bundles.

`PlatformAPI` is fully typed and messages are a discriminated union in
`src/shared/types/messages.ts`. `no-explicit-any` is an ESLint error; keep it that
way.

### Build System

One `webpack.config.js` exports an array of configs, one per target, from a
`createConfig(target)` factory. There is no shared intermediate build step and no
build ordering to respect. The manifest version is injected from `package.json`,
which is the single source of truth.

**Minification is off on purpose.** AMO requires a separate source-code submission
only when shipped code has been made unreadable, so leaving it readable removes
that step from every release and lets reviewers in both stores read what runs. The
extension is well under 150 KB. Turning it back on means the release workflow needs
`--upload-source-code` and an archive kept in sync — see RELEASING.md.

### CI and Releases

`.github/workflows/ci.yml` runs check, build and `lint:ext` on `main`, `dev` and
PRs, and uploads both packaged zips. That is the only thing standing between the
two builds and silent divergence, since one browser is exercised by the author and
the other by everyone else.

`.github/workflows/release.yml` triggers on a `v*` tag: it verifies the tag matches
`package.json`, builds, attaches the zips to a GitHub release, and then waits for
manual approval in the `stores` environment before submitting to either store.
Stores have no rollback, only a higher version. Do not remove that gate.

### Settings

`src/shared/config/` owns everything about settings. Always go through
`SettingsManager` (`settings.load()` / `settings.save()` / `settings.onChange()`)
rather than touching `platform.storage` directly — it fills defaults, validates
and coerces stored values, and migrates old shapes.

Environments are stored as
`groups: [{production, development: string[]}]`: one production host, many
stands. Production is singular by definition. Two older shapes migrate into it —
1.2's flat `pairs`, and the pre-1.2 parallel arrays — folding entries that share
a production host into one group. Older keys are left in place for rollback.

Settings live in **synced** storage (`platform.storage.sync`) so a configuration
follows the profile. `platform.storage.local` is passed to `SettingsManager` as
the previous area and read once, to copy an existing local configuration across.
Do not write to the local area.

`config/transfer.ts` handles JSON import/export. Imports must go through
`validateGroup`, the same path as the form, so an import can never introduce a
configuration the UI would reject.

Content scripts subscribe with `settings.onChange()`, so saving options or
toggling the extension applies live in every tab. Do not add tab messaging for
settings propagation.

### Hostname Patterns

`src/shared/utils/patterns.ts`. A `*` matches exactly **one** label (`[^.]+`), so
`*.example.com` matches `app.example.com` but not `example.com` or
`a.b.example.com`. Multiple wildcards are supported and each captured label is
carried across to the target pattern in order. Validation requires every host in
a group to have the same wildcard count, otherwise switching would translate one
way and fail the other.

User input is normalized to a bare hostname before matching
(`config/validation.ts`); matching runs against `location.hostname`.

### Content Script Architecture

`content.ts` is a slim orchestrator:

```
src/shared/
├── banner/
│   ├── BannerRenderer.ts      # Banner DOM; all styling lives in content.css
│   ├── BannerPositioner.ts    # Insertion + reserved space
│   ├── OverlapResolver.ts     # Offsets the page's own fixed/sticky bars
│   ├── EnvironmentSwitcher.ts # Resolves the counterpart URL
│   └── index.ts
├── config/                    # Settings (see above)
├── storage/StorageMonitor.ts  # Page localStorage monitoring
├── utils/                     # patterns.ts, environment.ts
└── content.ts                 # Orchestrator
```

### Banner Overlap Handling

This is the subtle part; read `OverlapResolver.ts` before changing it.

Space is reserved with `html { padding-top }` (not a body margin, which collapses
on sites that position body themselves). That does not move the page's own
`fixed`/`sticky` bars, which are viewport-anchored, so those are offset
individually.

Invariants that previously broke and are now covered by tests:

- **The pass must re-run.** On client-rendered sites the site's header mounts
  after the banner. A MutationObserver plus scroll/resize/load, coalesced into one
  pass per animation frame, covers it. A single pass at insertion misses it.
- **Track state, not a marker.** Offsets live in a `Map` with each element's
  original inline value, and every pass re-checks that the element is still where
  we put it. A marker attribute meant a framework re-render that wiped the offset
  was never repaired.
- **Passes must stay idempotent**, since the observer sees our own writes. Only
  overlapping elements are written to.
- **Undo from the saved inline value**, never by parsing computed style —
  computed `top` resolves to pixels, so looking for `calc` there never matches.
- Only `fixed` and `sticky` are touched. `absolute` moves with the page padding
  already, and offsetting it broke unrelated layouts.
- Full-height overlays (drawers, modals) get `max-height` as well as an offset,
  or their bottom is pushed off-screen.

### Tracked localStorage Flags

Rendered as chips whose colour carries the same meaning as the banner's own: red
for "production", green for "not production", using the `'1' | 'true'` rule such
flags conventionally use — the same rule the apps themselves apply, so a flag
shown as on here is on there. Because chips and banner share one colour language,
a chip that disagrees with the banner _is_ the warning — do not add comparison
logic for it.

An absent key renders nothing: the app then falls back to how it was built, which
means the effective environment is the page's own, and the banner already says
that.

The `×` removes the key rather than writing `0`, because these flags treat any
non-empty value as an override — removal is the only way back to the default. The
chip then stays visible as `reload to apply`: the flags are read once at startup,
so the stored value and what the page is running have diverged. `StorageMonitor`
keeps that pending set; do not drop it on refresh.

No key name appears anywhere in the source. Keys come from settings only.

### Rendering

All banner styling is in `src/shared/css/content.css`, keyed off
`is-production` / `is-development` classes and a `--banner-accent` custom
property. Do not inject `<style>` elements from JS, and do not style off inline
attribute values.

### Copying

Copy goes through a hidden textarea and `document.execCommand('copy')`, with
`navigator.clipboard.writeText` only as a second attempt. That order is not
historical clumsiness: in a content script's isolated world `writeText` **resolves
while the write is silently dropped**. Measured on a live page — the button reported
success and a real paste came back empty. `execCommand` acts on the page's own
document and returns a boolean that can be believed. Do not "modernise" this by
putting the Clipboard API first.

`clipboardWrite` is in both manifests for the same reason; Firefox requires it for
`execCommand` from a content script, and neither browser shows a permission warning
for it.

Every copy outcome must be visible in the banner, not only in `title`: with only the
icon changing, the many pages that have no query string looked like a dead button —
which is exactly how it was reported.

### Rendering

There is no `innerHTML` anywhere in `src/`, deliberately: tracked localStorage
values are page-controlled, and add-on reviewers flag innerHTML. Icons are built
with `createElementNS`.

### Environment Switching

`EnvironmentSwitcher.resolveTargets()` returns every other host in the group:
from production, all the stands; from a stand, production first and then the
sibling stands. One target renders a plain button naming the hostname, several
render a menu. Targets are named by hostname, not "Production"/"Development",
because a group can hold several stands.

Switching happens in the content script with `window.open`, which works because a
click carries a user gesture. There are deliberately **no keyboard shortcuts**: a
shortcut carries no gesture into the page, so it needed a round trip through the
background worker to dodge the popup blocker, and with several stands it had to
silently pick one. Removing it deleted that whole path — the `commands` manifest
key, the tab plumbing in `PlatformAPI`, and the content script's inbound message
handler. `background.ts` now exists only to badge tabs.

Menu items sit on white, so they must not use the banner's accent colours as text:
`#17b417` on white is 2.8:1. Stands are neutral dark, production is a darker red at
5.6:1.

### Dismissal and the Badge

The banner's close button sets an in-memory flag in `content.ts` and tears the
banner down. In-memory is the point: it survives client-side navigation and
settings changes, and dies on reload, so it can never become a setting the user
has to undo. Do not persist it.

Two things must keep working while dismissed, and both are covered by where the
state lives: the keyboard shortcut (so the switcher is created outside the banner
teardown path) and the toolbar badge (so the environment is reported regardless
of whether the banner is showing).

The badge is set by `background.ts`, since content scripts cannot reach the action
API. A content script sends `environment-detected` and the worker badges
`sender.tab.id`.

### Host Access

Manifest V3 leaves host access to the user on Firefox, and without it the banner
simply never appears — indistinguishable from a broken extension. So the state is
surfaced: the popup warns, and the options page grants.

`permissions.request()` must run from a user gesture _and_ from a tab — Firefox can
close a popup mid-request and lose it — so the button lives on the options page and
the popup only links there. If the request is refused outright (a browser may
decline to ask for origins it does not consider optional), the section falls back
to telling the user where to grant it by hand rather than leaving a dead button.
`hasHostAccess` returns true when it cannot tell, since a warning nobody can act on
is worse than none.

## Published Extension

Both builds are live in their stores, which constrains a few things:

- **The Firefox add-on id is permanent.** `environment-switcher@example.com` looks
  like a placeholder but the add-on is published under it. Changing it orphans
  every install and loses every stored setting, since storage is keyed by id.
- **`<all_urls>` has already passed review in both stores.** Do not narrow it to
  optional host permissions to please a reviewer — that would break existing
  installs until each user re-granted access, for no gain.
- **Real users have real settings**, written by the pre-1.2 build into
  `storage.local` as two parallel arrays. The migration chain in
  `SettingsManager.load()` is load-bearing, not theoretical: verify it against an
  actually-installed extension before shipping an update, not only in unit tests.
- **Versions must increase** on every store upload; the published version was 1.0.

## Testing

Vitest with jsdom. jsdom does no layout, so `OverlapResolver.test.ts` stubs
`getBoundingClientRect` and `document.elementsFromPoint` and updates the stubs to
mimic what the browser would do after a style change. Note that engines fold
`calc(0px + 50px)` to `calc(50px)` when serializing, so compare numbers rather
than strings.

`options.test.ts` drives the real `options.html` in jsdom — extension pages cannot
be reached by browser automation, so this is the only end-to-end coverage the page
has. `OptionsManager` takes an injectable `SettingsManager` and exposes a `ready`
promise for that reason. `FakeStorage` in `src/shared/testing/` is shared by the
settings and options tests.

Anything relying on `requestAnimationFrame` must also work in a background tab,
where it never fires. See the hidden-tab tests in `OverlapResolver.test.ts`.
