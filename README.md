# Environment Warning Browser Extension

A browser extension that helps developers easily switch between production and development environments while providing clear visual indicators of the current environment.

## Features

- 🚦 Clear visual indicators: red banner for production, green for everything else
- 🏷️ `PROD` / `DEV` badge on the toolbar icon, visible even with the banner hidden
- 🔄 Switch between any hosts in a group from the banner
- 🎯 One production host with as many dev, staging and QA stands as you need
- 🙈 Hide the banner for a single page view without disabling anything
- 🎨 Customizable banner size and position (top or bottom of the page)
- 🔗 Keeps the path, query and hash when switching
- 🔍 Wildcard hostname pattern matching
- 🔒 Local storage variable monitoring
- ☁️ Settings follow your browser profile, and can be exported as JSON
- ⚡ Settings apply immediately, in every open tab, with no reload
- 🌐 Chrome and Firefox, Manifest V3 on both

## Installation

### Manual Installation (Developer Mode)

#### Chrome

1. Run `npm run build:chrome` to build the extension
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked"
5. Select the `dist/chrome` folder

#### Firefox

1. Run `npm run build:firefox` to build the extension
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select any file from the `dist/firefox` folder

Firefox 140 or newer is required. Because Manifest V3 treats host access as a
permission the user grants, the extension may start without it — in which case the
banner never appears. The popup says so and the options page has an **Allow access
to sites** button; if the browser declines to ask, the same section explains where
to grant it by hand.

### Do not change the Firefox add-on id

`browser_specific_settings.gecko.id` in `src/shared/manifest.firefox.json` is
`environment-switcher@example.com`. It looks like a placeholder, and it was one —
but the add-on has been published under it, so it is now permanent. Changing it
makes AMO treat the upload as a different add-on: existing installs stop receiving
updates, and stored settings do not carry over, because extension storage is keyed
by id.

## Development Setup

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer

### Project Structure

```
├── src/
│   ├── shared/                 # Shared code between Chrome and Firefox
│   │   ├── banner/
│   │   │   ├── BannerRenderer.ts      # Banner DOM
│   │   │   ├── BannerPositioner.ts    # Insertion and reserved space
│   │   │   ├── OverlapResolver.ts     # Keeps the banner off the page's own bars
│   │   │   └── EnvironmentSwitcher.ts # Resolves the counterpart URL
│   │   ├── config/
│   │   │   ├── schema.ts              # Settings shape
│   │   │   ├── defaults.ts            # Default values
│   │   │   ├── validation.ts          # Hostname normalization and validation
│   │   │   └── settings.ts            # SettingsManager (load/save/migrate/watch)
│   │   ├── storage/
│   │   │   └── StorageMonitor.ts      # Page localStorage monitoring
│   │   ├── utils/
│   │   │   ├── patterns.ts            # Hostname pattern matching
│   │   │   └── environment.ts         # Which side of a pair a hostname is on
│   │   ├── types/                     # PlatformAPI and message types
│   │   ├── content.ts                 # Content script orchestrator
│   │   ├── background.ts              # Background worker
│   │   ├── options.ts                 # Options page logic
│   │   ├── popup.ts                   # Popup logic
│   │   ├── html/ css/ images/         # Static assets
│   │   └── manifest.{chrome,firefox}.json
│   └── platform/                # Platform-specific implementations
│       ├── chrome/
│       └── firefox/
├── dist/                        # Built extensions (chrome/ and firefox/)
└── webpack.config.js            # One config factory, one entry per target
```

### Commands

| Command                  | What it does                                            |
| ------------------------ | ------------------------------------------------------- |
| `npm install`            | Install dependencies                                    |
| `npm run build`          | Build both targets into `dist/`                         |
| `npm run build:chrome`   | Build the Chrome target only                            |
| `npm run build:firefox`  | Build the Firefox target only                           |
| `npm run dev`            | Watch both targets, unminified with source maps         |
| `npm run watch:chrome`   | Watch the Chrome target only                            |
| `npm run typecheck`      | `tsc --noEmit`                                          |
| `npm test`               | Run the unit tests                                      |
| `npm run test:watch`     | Run the tests in watch mode                             |
| `npm run lint`           | ESLint                                                  |
| `npm run lint:ext`       | `web-ext lint` against the built Firefox bundle         |
| `npm run format`         | Prettier                                                |
| `npm run check`          | typecheck + lint + tests                                |
| `npm run package:chrome` | Zip `dist/chrome` for store submission                  |
| `npm run all`            | check, build, extension lint, then package both targets |

The version in `package.json` is the single source of truth; both manifests get
it injected at build time.

The bundle is intentionally **not minified**: the whole extension is well under
150 KB, and readable shipped code means add-on reviewers see what actually runs —
AMO only demands a separate source-code submission when the code has been made
unreadable.

## Configuration

### Setting Up Environments

1. Click the extension icon in your browser toolbar
2. Click "Open Options"
3. In the options page you can:
   - Add environment groups: one production host plus its non-production hosts
   - Configure banner sizes for production and non-production
   - Set banner position (top or bottom)
   - Configure localStorage keys to monitor
   - Export the configuration as JSON, or import one

Saving takes effect immediately in every open tab — no page reload needed.

An environment group is one production host and every host that mirrors it:

| Production host   | Non-production hosts, comma separated  |
| ----------------- | -------------------------------------- |
| `app.example.com` | `dev.example.com, staging.example.com` |

Production is singular — there is only ever one — while stands are many. The
banner appears on every host in the group, and switching moves you between any
two of them.

#### Hostnames, not URLs

Matching happens against the page's hostname. Anything else you paste is
stripped, so `https://app.example.com:8443/login?next=/x` is stored as
`app.example.com`. Invalid entries are reported per row and the save is refused
rather than silently dropping them.

#### Wildcards

A `*` stands for exactly one hostname label:

| Pattern           | Matches           | Does not match                   |
| ----------------- | ----------------- | -------------------------------- |
| `example.com`     | `example.com`     | `app.example.com`                |
| `*.example.com`   | `app.example.com` | `example.com`, `a.b.example.com` |
| `*.*.example.com` | `a.b.example.com` | `app.example.com`                |

Every host in a group must contain the same number of wildcards, so whatever a
wildcard matched can be carried across when switching:

| Production host            | Non-production hosts                  |
| -------------------------- | ------------------------------------- |
| `*.production.example.com` | `*.dev.example.com, *.qa.example.com` |

Visiting `app.production.example.com` and switching lands on
`app.dev.example.com` or `app.qa.example.com`.

### Local Storage Monitoring

Configure localStorage keys of the visited page to surface in the banner. Each
present key becomes a coloured chip:

| Chip              | Meaning                                          |
| ----------------- | ------------------------------------------------ |
| red, white text   | value is `1` or `true` — the flag is on          |
| green, black text | any other value — the flag is off                |
| nothing shown     | key absent, so the app uses its built-in default |

The colours mean the same thing as the banner's own: red for production, green for
everything else. So a **red chip on a green banner** is a development page pointed
at production data, and a **green chip on a red banner** is the reverse — no
comparison needed, the mismatch is the warning.

Each chip has a `×` that removes the key from the page. That matters because these
flags usually treat any non-empty value as an override: writing `0` does not
restore the default, only removing the key does. Frontends read such flags once at
startup, so the chip says "reload to apply" until the page is reloaded.

Nothing about any particular key is built in — configure whichever keys your apps
use.

### Banner Settings

- Position: top or bottom of the page
- Size: 30px, 50px, 100px or 150px, set separately for production and development

## Usage

- **Red banner / `PROD` badge**: production
- **Green banner / `DEV` badge**: a non-production stand
- **Warning text**: monitored localStorage values, highlighted when switched on
- **Copy button**: copies the current URL's query string
- **Close button**: hides the banner until the page is reloaded

The banner's switch control names the host it will take you to. With more than one
possible target it becomes a menu: from production it lists every stand, and from a
stand it lists production first — marked in red — followed by the sibling stands, so
hopping between stands works too.

The path, query string and hash are preserved, and the target opens in a new tab.

### Hiding the banner temporarily

The close button on the banner hides it for that page view only: the page gets its
space back and every adjustment made to the site's own bars is undone. Reloading
brings it back, so it cannot turn into a setting you forget you changed. The
toolbar badge and the keyboard shortcut keep working while it is hidden.

Disabling from the popup is the other tool: that is global and sticky, across
every tab, until you switch it back on.

### Sharing a configuration

Settings live in synced storage, so they follow your browser profile without any
action. The Import / Export section of the options page is for the other cases —
handing your host list to a colleague, or moving a configuration between profiles.

**Export** writes JSON into the box; **Download file** saves it as
`environment-switcher-settings.json`, which is the convenient thing to drop into a
chat. **Load file** reads a file back into the box _without_ applying it, so a file
from someone else can be looked at first — **Import** is the deliberate step that
replaces the configuration.

Imported data goes through exactly the same validation as the form, and anything
unusable is reported rather than quietly dropped. Whether the extension is switched
on is not part of the payload.

The format is JSON rather than YAML on purpose: it is what extension storage holds
natively, so there is no conversion to get wrong, and it needs no parser bundled
into the extension.

### How the banner avoids covering the page

Space for the banner is reserved with padding on the root element. That moves the
document, but a site's own `fixed` and `sticky` bars are anchored to the viewport
and ignore it, so those are offset individually.

Affected elements are found by hit-testing the strip the banner occupies, and the
pass re-runs on DOM mutations, scrolling, resizing and load. That matters on
client-rendered sites, where the site's header often mounts _after_ the banner:
a single pass at insertion time would miss it entirely. Full-height overlays such
as drawers and modals are also shortened, so their bottom is not pushed
off-screen. Everything is restored exactly when the extension is disabled.

## Updating

Both stores update the extension themselves; there is nothing to press. The popup
shows the installed version, which is the quickest way to tell whether someone is
running the build you think they are.

Releases are cut by tagging — see [RELEASING.md](RELEASING.md).

## Troubleshooting

1. **Banner not showing**
   - Open the popup: it warns when the extension has no access to sites, which
     looks exactly like a broken extension. The options page can grant it.
   - Verify the extension is enabled in the popup
   - Check that the hostname matches a configured pattern (remember `*` is a
     single label, and `*.example.com` does not match `example.com`)

2. **Layout issues**
   - Try a smaller banner size, or move the banner to the bottom
   - Report the site: the overlap logic offsets viewport-anchored bars, and a
     site doing something unusual may need a look

3. **Switching not working**
   - Verify the pair is configured and both sides have the same wildcard count
   - Check that the popup blocker is not interfering if you switched from the
     banner button

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
Run `npm run check` before opening one.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
