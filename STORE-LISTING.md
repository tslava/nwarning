# Store listing

Everything both stores ask for, written out so it is pasted rather than composed
under time pressure at submission. Keep this in step with what the extension
actually does — a listing that overstates is a listing a reviewer rejects, and the
descriptions below are deliberately literal.

Two facts govern most of the answers: **nothing is collected and nothing is sent**,
and **the hostnames the extension acts on are the user's own**, typed into the
options page and unknown to us.

## Name

```
Environment Switcher
```

Same as the manifest, which both stores read. Not changed lightly: the Firefox
add-on's slug (`envswitcher`) and the Chrome item id are already public.

## Chrome Web Store

### Summary (132 characters maximum)

```
Shows which environment a page belongs to — red for production, green for anything else — and switches between them in a click.
```

### Detailed description

```
Environment Switcher makes it obvious which environment you are looking at, and
lets you jump to its counterpart without editing the address bar.

A coloured banner sits at the top or bottom of the page: red on production, green
on anything else. The toolbar icon carries a red P or a green D, so the environment
is still visible when the banner is hidden.

WHAT IT DOES

• Banner — red for production, green for your dev, staging and QA stands. Sized and
  positioned how you like, per environment.
• Switch — one button naming the host it will take you to. With several stands it
  becomes a menu, so you can go from production to any of them and back.
• Wildcards — one rule can cover many hosts: *.dev.example.com matches
  app.dev.example.com, and whatever the wildcard matched is carried across when
  switching.
• Tracked localStorage flags — name the keys your apps use to point themselves at
  production data, and their values appear in the banner as coloured chips, in the
  same colour language as the banner itself. A red chip on a green banner is a dev
  page reading production data, which is exactly the mistake worth catching.
• Click a chip to flip that flag between 0 and 1, or true and false, and the page
  reopens in a new tab where the app actually reads the new value. A value that is
  not a plain on/off flag is never overwritten.
• Copy parameters — copies the current URL's query string, including the ones front
  ends keep in the hash, and says what happened either way.
• Hide the banner for one page view when it is in your way. Reloading brings it
  back, so it can never become a setting you forget you changed.

SETTINGS

An environment group is one production host and every stand that mirrors it.
Settings follow your browser profile, apply immediately in every open tab with no
reload, and can be exported as JSON to hand to a colleague.

PRIVACY

No accounts, no analytics, no telemetry, no network requests of any kind. The
extension reads the hostname of the page to decide whether it is one of yours, and
the localStorage keys you listed. Nothing leaves your browser. The full policy is
at https://github.com/tslava/nwarning/blob/main/PRIVACY.md

The code is open source and deliberately shipped unminified, so what runs is what
you can read: https://github.com/tslava/nwarning
```

### Category and language

- Primary category: **Developer Tools**
- Language: **English**

### Privacy tab

**Single purpose:**

```
Show which environment the current page belongs to, and switch between the
environments the user has configured.
```

**Permission justifications** — one per permission in the manifest:

`host permissions <all_urls>`

```
The banner has to appear on the hosts the user configures as their production and
non-production environments. Those hostnames are the user's own, they differ for
every user, and they are typed into the options page after installation — so they
cannot be declared in the manifest, and no narrower host pattern exists that would
work for anyone. On any page outside the user's configured groups the extension
does nothing: it reads location.hostname, finds no match, and adds nothing to the
page. It reads no page content.
```

`storage`

```
Stores the user's own settings: their environment groups, banner size and position,
the localStorage keys to watch, and whether the extension is enabled. Synced
storage is used so a configuration follows the user's profile between their own
machines. No browsing data is stored.
```

`clipboardWrite`

```
The banner's copy button places the current URL's parameters on the clipboard.
This is done with document.execCommand('copy') from the content script, which
requires this permission in Firefox; nothing is ever read from the clipboard.
```

This one is new in 2.0.0, and it alone blocked the first publish: Chrome asks for a
justification per permission and had the others from 1.1 already, so adding a
permission means adding a justification before that version can go out. Worth
remembering next time a permission is added — the archive uploads fine and the
refusal only appears at the publish step.

**Remote code:** No — the extension executes no remote code. Everything it runs is
in the package, and Manifest V3 forbids anything else.

**Data usage:** tick **nothing** in the "what data do you collect" group. Then tick
all three certifications, each of which is true:

- I do not sell or transfer user data to third parties, outside of the approved use
  cases
- I do not use or transfer user data for purposes that are unrelated to my item's
  single purpose
- I do not use or transfer user data to determine creditworthiness or for lending
  purposes

**Privacy policy URL:**

```
https://github.com/tslava/nwarning/blob/main/PRIVACY.md
```

### Support and homepage

- Homepage URL: `https://github.com/tslava/nwarning`
- Support URL: `https://github.com/tslava/nwarning/issues`

## addons.mozilla.org

### Summary (250 characters maximum)

```
A red banner on production and a green one on your dev, staging and QA stands, so you always know which environment you are looking at — plus one click to switch between them, and the localStorage flags your apps use shown right in the banner.
```

### Description

The Chrome description above works as-is. AMO renders a limited set of HTML, so
either paste it as plain text or wrap the sections in `<p>` and the lists in `<ul>`.

### Categories (at most two)

- **Web Development** — the primary one
- **Other**

Two is the maximum and AMO treats extra categories as spam, so no more.

### Tags

```
developer, environment, staging, production, localhost, banner
```

### The rest

- Support email: your own; AMO requires at least one contact
- Support site: `https://github.com/tslava/nwarning/issues`
- Homepage: `https://github.com/tslava/nwarning`
- Licence: whatever `LICENSE` in the repository says
- Privacy policy: `https://github.com/tslava/nwarning/blob/main/PRIVACY.md`
- Data collection: **none**, which matches `data_collection_permissions` in
  `manifest.firefox.json`. Keep the two in step; a listing that claims less than the
  manifest declares is the kind of contradiction a reviewer notices.

## Images

| Asset            | Size     | Needed             |
| ---------------- | -------- | ------------------ |
| Store icon       | 128×128  | have it, generated |
| Screenshots      | 1280×800 | 1 minimum, up to 5 |
| Small promo tile | 440×280  | Chrome, required   |
| Marquee promo    | 1400×560 | Chrome, optional   |
| AMO screenshots  | 1280×800 | the same files do  |

AMO accepts the same 1280×800 screenshots, so one set covers both stores.

### What is in `store/`

Taken against `tools/demo-page/` with the extension really installed, so every one
of them is the product running rather than a mock-up:

| File                           | Shows                                                       |
| ------------------------------ | ----------------------------------------------------------- |
| `screenshot-1-production.png`  | red banner, and the site's own fixed header moved below it  |
| `screenshot-2-flags.png`       | a red chip on a green banner — dev page, production data    |
| `screenshot-3-switch-menu.png` | the switch menu, production in red and the stand in neutral |
| `screenshot-4-copy.png`        | the copy button's result said out loud, not just in `title` |

One caveat if they are re-taken: Chrome remembers page zoom **per origin**, so
`localhost` and `dev.localhost` can render at different scales in the same window
and the set then looks inconsistent. Match the zoom on both before capturing.

The 1280×800 conversion pads the bottom in the page's own background colour rather
than cropping the sides, because the banner's copy button and close button sit at
the extreme edges and a crop to the 1.6 aspect ratio cuts them off.

### What each screenshot should show

Ordered so the first one alone explains the extension, since it is the only one many
people look at.

1. **Production banner** on a page that has its own fixed header — showing the page
   pushed down rather than covered, which is the hard part of the feature.
2. **Development banner with the switch menu open**, listing several stands, so it is
   clear a group can hold more than one.
3. **Tracked flag chips**, with a red chip on a green banner: a dev page reading
   production data. That is the mistake the extension exists to catch.
4. **Options page**, with an environment group and the tracked keys filled in, so the
   configuration model is visible before install.
5. **Popup**, showing the version and the P/D badge on the toolbar icon.

### Taking them honestly, without any internal hostname

`tools/demo-page/` holds a neutral single-page app for this. Chrome resolves
`*.localhost` to the loopback address, so one local server can be visited as
`localhost` and as `dev.localhost` — two real hostnames, a real installed
extension, a real banner, and nothing internal anywhere in frame.

```bash
npm run build:chrome
python3 -m http.server 8733 --directory tools/demo-page
```

Then, in the browser: reload the extension, **export your real settings and save
them first**, import `tools/demo-page/settings.json`, and visit
`http://localhost:8733` and `http://dev.localhost:8733`. Import replaces the whole
configuration, which is why the backup comes first. When the screenshots are taken,
import the backup again.
