/**
 * Prove the store credentials work, without submitting anything.
 *
 *   node tools/check-store-credentials.mjs [chrome|firefox]
 *
 * Both stores are read, never written: the Chrome check exchanges the refresh
 * token and reads the item, the Firefox check signs a JWT and reads the add-on.
 * That covers everything a release needs except the upload itself, which is the
 * one step that cannot be rehearsed.
 *
 * The point is to find a dead credential now rather than after a release has been
 * approved -- a Chrome refresh token issued while the OAuth consent screen was
 * still in "Testing" expires after seven days, so a release pipeline can work
 * once and then fail silently for a week's worth of reasons that all look alike.
 *
 * Nothing here prints secret material: only status codes, versions, and which
 * variable was missing.
 */

import { createHmac, randomUUID } from 'node:crypto';

const CHROME_VARS = [
  'CWS_CLIENT_ID',
  'CWS_CLIENT_SECRET',
  'CWS_REFRESH_TOKEN',
  'CWS_EXTENSION_ID',
  'CWS_PUBLISHER_ID',
];
const FIREFOX_VARS = ['AMO_JWT_ISSUER', 'AMO_JWT_SECRET'];

/** The add-on id AMO knows this extension by; changing it registers a different add-on. */
const AMO_ADDON_ID = 'environment-switcher@example.com';

function required(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`not set: ${missing.join(', ')}`);
  }
}

async function checkChrome() {
  required(CHROME_VARS);

  // Both the token endpoint and the item URL below are the ones
  // chrome-webstore-upload uses, deliberately: a check that reads a different API
  // than the release writes to can pass while the release fails. It reached the
  // old v1.1 endpoint at first, which has no notion of a publisher id at all —
  // so a wrong or missing CWS_PUBLISHER_ID went unnoticed here and broke the
  // upload.
  const token = await fetch('https://www.googleapis.com/oauth2/v4/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CWS_CLIENT_ID,
      client_secret: process.env.CWS_CLIENT_SECRET,
      refresh_token: process.env.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const granted = await token.json();
  if (!token.ok || !granted.access_token) {
    // `invalid_grant` here is usually the seven-day expiry, or a token issued
    // for a different client than the one being used.
    throw new Error(
      `token exchange failed (${token.status} ${granted.error ?? '?'}: ${granted.error_description ?? 'no detail'})`,
    );
  }

  const publisher = process.env.CWS_PUBLISHER_ID;
  const extension = process.env.CWS_EXTENSION_ID;
  // fetchStatus is the only read in the v2 API, and it takes the same path the
  // upload and publish calls do.
  const item = await fetch(
    `https://chromewebstore.googleapis.com/v2/publishers/${encodeURIComponent(publisher)}/items/${encodeURIComponent(extension)}:fetchStatus`,
    { headers: { Authorization: `Bearer ${granted.access_token}` } },
  );

  const body = await item.json().catch(() => ({}));
  if (!item.ok) {
    const detail = body?.error?.message ?? JSON.stringify(body).slice(0, 200);
    throw new Error(
      `cannot read the item (${item.status}: ${detail}) — a 403 usually means the Chrome Web Store API is not enabled on the Cloud project, a 404 means the publisher or extension id is wrong, or the authorising account does not own the item`,
    );
  }

  return `token exchange ok; item status readable: ${JSON.stringify(body).slice(0, 300)}`;
}

/** AMO authenticates with a short-lived JWT the caller signs itself. */
function amoJwt() {
  const base64url = (value) => Buffer.from(value).toString('base64url');
  const issued = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: process.env.AMO_JWT_ISSUER,
      jti: randomUUID(),
      iat: issued,
      // Deliberately short: this token exists for one request.
      exp: issued + 60,
    }),
  );
  const signature = createHmac('sha256', process.env.AMO_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function checkFirefox() {
  required(FIREFOX_VARS);

  const headers = { Authorization: `JWT ${amoJwt()}` };

  const profile = await fetch('https://addons.mozilla.org/api/v5/accounts/profile/', { headers });
  if (!profile.ok) {
    throw new Error(
      `credentials rejected (${profile.status}); the secret is shown once, so a truncated paste looks exactly like this`,
    );
  }
  const account = await profile.json();

  // Also confirm this account can see the add-on it is meant to be updating.
  const addon = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(AMO_ADDON_ID)}/`,
    { headers },
  );
  if (!addon.ok) {
    throw new Error(`authenticated as ${account.username}, but ${AMO_ADDON_ID} is not readable`);
  }
  const details = await addon.json();

  return `authenticated as ${account.username}; ${AMO_ADDON_ID} readable, listed version ${details.current_version?.version ?? 'unknown'}, status ${details.status}`;
}

const CHECKS = { chrome: checkChrome, firefox: checkFirefox };

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(CHECKS);

let failed = false;
for (const name of names) {
  const check = CHECKS[name];
  if (!check) {
    console.error(`unknown store: ${name}`);
    failed = true;
    continue;
  }
  try {
    console.log(`${name}: ${await check()}`);
  } catch (error) {
    console.error(`${name}: FAILED -- ${error.message}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
