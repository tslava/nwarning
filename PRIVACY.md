# Privacy policy

Environment Switcher collects nothing, sends nothing, and contacts no server.

It has no analytics, no telemetry, no crash reporting, no accounts and no network
code of any kind. Nothing it reads leaves your browser.

## What it reads

- **The hostname of the page you are on**, to decide whether that page belongs to
  one of the environment groups you configured, and which side of the group it is
  on. Only the hostname, never the path, query or page content.
- **The localStorage keys you configured it to watch**, on the pages you visit, to
  show their values in the banner. No key is built in; the list starts empty and
  only ever contains what you typed into the options page.
- **The URL's parameters, when you press the copy button**, which are placed on
  your clipboard and nowhere else.

## What it stores

Your own settings — the environment groups, the banner size and position, the
localStorage keys to watch, and whether the extension is on. They are kept in the
browser's synced extension storage, which means the browser copies them between
your own signed-in profiles. That transfer is the browser's, not ours, and the data
goes to no one else.

Nothing you visit is recorded. There is no history, no log, and no list of pages.

## What it changes

Only when you ask it to, by clicking:

- a tracked flag's chip writes that flag's new value into the page's own
  localStorage;
- the switch control opens the counterpart host in a new tab.

## Permissions

- **Access to all sites** — the banner has to appear on the hosts _you_ configure.
  Those hostnames are yours, they differ per person, and the extension cannot know
  them when it is published, so it cannot list them in advance. On pages outside
  your configured groups it does nothing at all.
- **Storage** — your settings, as above.
- **Clipboard write** — the copy button.

There are no other permissions. The extension asks for no tabs access, no history,
no bookmarks, no cookies, and reads no page content.

## Source

The extension is open source, deliberately shipped unminified, and can be read in
full: <https://github.com/tslava/nwarning>

## Contact

Questions and reports: <https://github.com/tslava/nwarning/issues>
