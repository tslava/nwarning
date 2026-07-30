import type { EnvironmentGroup } from '../config/schema';
import { matchDomainPattern } from './patterns';

export type Environment = 'production' | 'development';

export interface EnvironmentMatch {
  environment: Environment;
  group: EnvironmentGroup;
  /** The pattern inside the group that the hostname matched. */
  pattern: string;
}

/**
 * Which group and which side of it the hostname belongs to, or null when it
 * matches none. Production wins if a hostname somehow matches both sides.
 */
export function matchEnvironment(
  groups: EnvironmentGroup[],
  hostname: string,
): EnvironmentMatch | null {
  for (const group of groups) {
    if (matchDomainPattern(hostname, group.production)) {
      return { environment: 'production', group, pattern: group.production };
    }
  }

  for (const group of groups) {
    const pattern = group.development.find((candidate) => matchDomainPattern(hostname, candidate));
    if (pattern) {
      return { environment: 'development', group, pattern };
    }
  }

  return null;
}
