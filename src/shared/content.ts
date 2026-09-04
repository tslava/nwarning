import { BannerPositioner, BannerRenderer, EnvironmentSwitcher } from './banner';
import type { SwitchTarget } from './banner/EnvironmentSwitcher';
import { settings } from './config/settings';
import type { Settings } from './config/schema';
import { platform } from './platform';
import { StorageMonitor, type Warning } from './storage/StorageMonitor';
import { matchEnvironment, type Environment, type EnvironmentMatch } from './utils/environment';
import { keysForHost } from './utils/trackedKeys';

/**
 * The content script runs at document_idle, where body already exists, but the
 * banner is inserted into body so guard against ever running earlier.
 */
function documentReady(): Promise<void> {
  if (document.body) return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

class EnvironmentBanner {
  private renderer: BannerRenderer | null = null;
  private positioner: BannerPositioner | null = null;
  /**
   * Outlives the banner: hiding the banner must not disable the keyboard
   * shortcut, which needs a switcher to resolve its target.
   */
  private switcher: EnvironmentSwitcher | null = null;
  private readonly storageMonitor: StorageMonitor;

  /**
   * Latest warnings, kept here rather than pushed straight at the renderer:
   * localStorage can resolve before the banner exists, and the old code dropped
   * those warnings on the floor.
   */
  private warnings: Warning[] = [];

  /**
   * Set by the banner's close button. Deliberately in memory only: it survives
   * client-side navigation and settings changes, and is forgotten on reload, so
   * "hide this" never turns into a setting the user must remember to undo.
   */
  private dismissed = false;

  constructor() {
    this.storageMonitor = new StorageMonitor((warnings) => this.onWarnings(warnings));
    // Settings changes are applied live, in every tab, without a reload.
    settings.onChange((next) => void this.apply(next));
    void this.start();
  }

  private async start(): Promise<void> {
    const [current] = await Promise.all([settings.load(), documentReady()]);
    await this.apply(current);
    this.storageMonitor.start();
  }

  private async apply(next: Settings): Promise<void> {
    const match = matchEnvironment(next.groups, window.location.hostname);
    const active = next.extensionEnabled && match !== null;

    // Host scope is resolved here, where the hostname lives, and only while the
    // extension is active on it: a key with no hosts of its own means "wherever
    // the banner appears", which is exactly this condition.
    this.storageMonitor.setKeys(
      active
        ? keysForHost(next.trackedKeys, window.location.hostname).map((tracked) => ({
            key: tracked.key,
            assignValue: tracked.value,
          }))
        : [],
    );

    // Rebuild unconditionally: size, position and groups can all have changed,
    // and a teardown/rebuild is cheaper to reason about than diffing.
    this.removeBanner();
    this.switcher = active && match ? new EnvironmentSwitcher(match) : null;

    if (active && match && !this.dismissed) {
      this.showBanner(next, match);
    }

    // Reported even when the banner is hidden: the badge is what tells you which
    // environment this is once the banner is out of the way.
    this.reportEnvironment(active && match ? match.environment : null);

    await this.storageMonitor.refresh();
  }

  private reportEnvironment(environment: Environment | null): void {
    void platform.sendMessage({ command: 'environment-detected', environment }).catch(() => {
      // The background worker may be asleep or restarting; the badge is
      // cosmetic, so a dropped report is not worth surfacing.
    });
  }

  private showBanner(config: Settings, match: EnvironmentMatch): void {
    const isProduction = match.environment === 'production';
    const height = isProduction ? config.prodSize : config.devSize;

    this.renderer = new BannerRenderer({
      isProduction,
      bannerSize: height,
      bannerPosition: config.bannerPosition,
      targets: this.switcher?.resolveTargets() ?? [],
      onSwitch: (target) => this.openTarget(target),
      onDismiss: () => this.dismiss(),
      onToggleKey: (key) => void this.flipFlag(key),
      onUnsetKey: (key) => void this.unsetFlag(key),
    });

    const elements = this.renderer.create();
    if (!elements) return;

    this.positioner = new BannerPositioner(elements.wrapper, height, config.bannerPosition);
    this.positioner.start();

    this.renderer.displayWarnings(this.warnings);
  }

  private removeBanner(): void {
    this.positioner?.stop();
    this.positioner = null;
    this.renderer?.destroy();
    this.renderer = null;
  }

  /**
   * Hide the banner for this page view; reloading brings it back. The keyboard
   * shortcut keeps working, since nothing about the environment has changed.
   */
  private dismiss(): void {
    this.dismissed = true;
    this.removeBanner();
  }

  private onWarnings(warnings: Warning[]): void {
    this.warnings = warnings;
    this.renderer?.displayWarnings(warnings);
  }

  /**
   * Flip a tracked flag and open this page again, so the app actually reads the new
   * value — it reads these flags once at startup, which is why the flip alone does
   * nothing to the page in front of you. This tab is deliberately left as it was:
   * it is the before to the new tab's after, and nothing the user was looking at
   * gets thrown away.
   *
   * The write is awaited first. localStorage is shared with the new tab, but only
   * values already stored when it starts loading are values it can read.
   */
  private async flipFlag(key: string): Promise<void> {
    if (!(await this.storageMonitor.toggle(key))) return;

    // A blocked popup has to be visible: the flag did change, and a banner that
    // showed nothing would look like the click had failed outright.
    if (!window.open(window.location.href, '_blank')) {
      this.renderer?.showMessage('Flag changed — reload to apply', 'warn');
    }
  }

  /**
   * Remove a tracked flag and open this page again, for the same reason a flip
   * does: the app is running on the value it read at startup, so a fresh load is
   * where falling back to its built-in default actually happens.
   */
  private async unsetFlag(key: string): Promise<void> {
    if (!(await this.storageMonitor.unset(key))) return;

    if (!window.open(window.location.href, '_blank')) {
      this.renderer?.showMessage('Flag removed — reload to apply', 'warn');
    }
  }

  /** Opened from the banner, where a real user gesture exists. */
  private openTarget(target: SwitchTarget): void {
    window.open(target.url, '_blank');
  }
}

new EnvironmentBanner();
