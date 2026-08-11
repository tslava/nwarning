/**
 * Building the URL to switch to.
 *
 * Replacing the hostname is usually the whole job, but some consoles encode the
 * environment twice and then obey the copy in the query string. The AWS console is
 * the case that forced this:
 *
 *   https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1
 *
 * Swap only the host and it sends you straight back to the region named in the
 * parameter, so switching appears to do nothing at all.
 *
 * These sites are named explicitly rather than handled by a general rule. A general
 * rule was written first — translate any hostname label that changed wherever it
 * appears as a parameter value — and it is genuinely more clever, but it fires on
 * every group whether or not the site cares, and a short label like `app` or `test`
 * is a plausible value of an unrelated parameter. Naming the sites cannot misfire
 * anywhere else. There are only a handful of clouds shaped like this, and adding one
 * is a line in SITE_RULES; if that table ever grows past being readable at a glance,
 * that is the signal to make it general after all.
 *
 * This is not the same thing as hardcoding a user's own hosts, which stays banned:
 * these are public services whose behaviour is the same for everyone, closer to a
 * browser's site-compatibility list than to configuration.
 */

interface SiteRule {
  /** True for hosts this rule governs. Tested against the host being switched to. */
  appliesTo: (hostname: string) => boolean;
  /**
   * Parameters that name the environment being left. They are removed rather than
   * translated: dropping a stale value needs no guess about what the new one should
   * be, and these consoles take the region from the hostname when it is absent.
   */
  drop: string[];
}

/** Matches `host` itself and anything below it. */
function at(suffix: string): (hostname: string) => boolean {
  return (hostname) => hostname === suffix || hostname.endsWith(`.${suffix}`);
}

const SITE_RULES: SiteRule[] = [
  {
    // The AWS console, including the China and GovCloud partitions, which have their
    // own domains but the same behaviour.
    appliesTo: (hostname) =>
      at('console.aws.amazon.com')(hostname) ||
      at('console.amazonaws.cn')(hostname) ||
      at('console.amazonaws-us-gov.com')(hostname),
    drop: ['region'],
  },
];

/**
 * Drop named parameters from a `a=1&b=2` string.
 *
 * Every surviving pair is copied through byte for byte rather than re-serialised, so
 * a parameter this has no business touching cannot come back re-encoded — spaces
 * turning into `+` in somebody's search query is exactly the kind of change nobody
 * asked for.
 */
function withoutParameters(query: string, names: string[]): string {
  return query
    .split('&')
    .filter((pair) => {
      const separator = pair.indexOf('=');
      const rawName = separator === -1 ? pair : pair.slice(0, separator);
      let name: string;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        // Malformed percent-encoding is somebody else's business; keep the pair.
        return true;
      }
      return !names.includes(name);
    })
    .join('&');
}

/**
 * The same page on another host, with any parameter that named the old environment
 * removed.
 *
 * Front ends keep state in the hash as often as in the query string, and the AWS
 * console uses both — `#/instances?region=…` as well as `?region=…` — so a query
 * inside the hash is treated the same way.
 */
export function switchedUrl(currentUrl: string, targetHostname: string): string {
  const url = new URL(currentUrl);
  url.hostname = targetHostname;

  const drop = SITE_RULES.filter((rule) => rule.appliesTo(targetHostname)).flatMap(
    (rule) => rule.drop,
  );
  if (drop.length === 0) return url.toString();

  if (url.search.length > 1) {
    url.search = withoutParameters(url.search.slice(1), drop);
  }

  const queryStart = url.hash.indexOf('?');
  if (queryStart !== -1) {
    const remaining = withoutParameters(url.hash.slice(queryStart + 1), drop);
    // Leave no dangling `?` behind when that was the only parameter.
    url.hash = remaining
      ? url.hash.slice(0, queryStart + 1) + remaining
      : url.hash.slice(0, queryStart);
  }

  return url.toString();
}
