# Remaining work

The refactoring and bug-fix pass this document used to plan is done. What follows
is what was deliberately left out, and why.

## Banner overlap: escape hatches

`OverlapResolver` offsets a site's own fixed and sticky bars, and that covers the
sites tried so far. It is still a heuristic, and no heuristic wins everywhere. The
close button now covers the "it is in my way right now" case, so what remains is
for a site that is persistently wrong:

- **Compact mode** — render the banner as a small corner badge instead of a
  full-width bar. Nothing to offset, so the entire class of problem disappears.
  The most valuable of the three.
- **Per-site override** — `hostname -> {mode, extraOffset}` in settings, for the
  one site that needs a nudge.
- **"Do not move page elements"** — overlay only, for sites where offsetting
  causes more damage than it prevents.

All three want a settings-schema addition, which is cheap now that
`SettingsManager` owns validation and migration.

Known limitation worth recording: hit-testing cannot see elements with
`pointer-events: none`, so a full-viewport toast container of that kind is
invisible to the resolver. Its visible children are normally found on their own,
but a top-anchored toast that is itself `pointer-events: none` would slip under
the banner.

## Other ideas not taken

From the same round of suggestions, left undone:

- **Clickable localStorage flags** — flipping a tracked `1`/`0` straight from the
  banner. Probably the highest-value remaining idea for a feature-flag workflow.
- **"Add current host" from the popup** — build a group from the page you are on,
  guessing the counterpart by stripping a `dev.` prefix.
- **Pattern tester in options** — type a host, see whether it matches and where it
  would switch to. The matching logic is already pure and tested; this is UI only.

## Firefox page-localStorage bridge

`src/platform/firefox/index.ts` reads the page's localStorage by injecting a
script and listening for a `postMessage`. It now times out and falls back to a
direct read, so a page CSP can no longer leave it hanging, but two questions are
open:

- Is the bridge needed at all? Firefox content scripts generally do share the
  page's localStorage. The workaround was added in `ea7d8ae` for a real symptom,
  but the diagnosis may have been wrong — if a direct read works, the whole
  injection path can go.
- If it is needed, a Manifest V3 content script declared with `"world": "MAIN"`
  is the clean replacement: no dynamic code, unaffected by page CSP.

Answering the first question is a ten-minute experiment in Firefox and may delete
most of the file.

## CI

There is none. `npm run check` and `npm run build` on push would be enough, plus
`npm run lint:ext` so add-on packaging problems surface before release.

## Smaller items

- **TypeScript is pinned to `~5.9`.** 7.x is out; the jump wants a look at
  `ts-loader` compatibility rather than a blind version bump.
- **`run_at`** is the default `document_idle`, so the banner appears after the
  page. `document_start` would remove that flash but needs care around body
  availability, and would render before settings have loaded.
- **Add-on id.** `browser_specific_settings.gecko.id` must change before
  publishing anywhere public.
- **Store listings.** Neither store submission has been prepared;
  `npm run package:chrome` / `package:firefox` produce the artifacts.
