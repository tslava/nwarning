/**
 * Resolves the URLs the current page can be switched to inside its group.
 */

import { translateHostname } from '../utils/patterns';
import type { EnvironmentMatch } from '../utils/environment';

export interface SwitchTarget {
  /** Concrete hostname, with any wildcard filled in from the current one. */
  hostname: string;
  url: string;
  isProduction: boolean;
}

export class EnvironmentSwitcher {
  constructor(private readonly match: EnvironmentMatch) {}

  /**
   * Every other host in the group, nearest thing first: production leads when we
   * are on a stand, and the stands are listed in configured order when we are on
   * production. The current host is never a target.
   */
  resolveTargets(currentUrl: string = window.location.href): SwitchTarget[] {
    const url = new URL(currentUrl);
    const { group, pattern } = this.match;

    const patterns =
      this.match.environment === 'production'
        ? group.development
        : [group.production, ...group.development.filter((host) => host !== pattern)];

    const targets: SwitchTarget[] = [];
    for (const candidate of patterns) {
      const hostname = translateHostname(url.hostname, pattern, candidate);
      if (!hostname || hostname === url.hostname) continue;

      const target = new URL(url.toString());
      target.hostname = hostname;
      targets.push({
        hostname,
        url: target.toString(),
        isProduction: candidate === group.production,
      });
    }

    return targets;
  }
}
