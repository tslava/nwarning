import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsManager } from './config/settings';
import type { EnvironmentGroup } from './config/schema';
import { OptionsManager } from './options';
import { FakeStorage } from './testing/fakeStorage';
import type { PermissionsPort } from './types/platform';

/** The real options markup, so the page and its script cannot drift apart. */
const OPTIONS_HTML = readFileSync(resolve(process.cwd(), 'src/shared/html/options.html'), 'utf8');

function mountPage(): void {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(OPTIONS_HTML);
  if (!body) throw new Error('could not find <body> in options.html');
  // Drop the script tag; the module under test is imported directly.
  document.body.innerHTML = body[1].replace(/<script[\s\S]*?<\/script>/gi, '');
}

describe('extension pages', () => {
  // Nothing serves a charset header for a chrome-extension: or moz-extension: URL,
  // so a page without this declaration is decoded as Latin-1 and every dash in the
  // copy renders as mojibake. jsdom reads the file as UTF-8 and cannot see that, so
  // this checks the declaration itself.
  it.each(['options.html', 'popup.html'])('%s declares UTF-8', (page) => {
    const html = readFileSync(resolve(process.cwd(), 'src/shared/html', page), 'utf8');
    expect(html).toMatch(/<meta\s+charset=["']utf-8["']/i);
  });

  it('keeps the transfer buttons on one set of metrics', () => {
    // They used to borrow `.add-key`, which carries a margin only meant for the key
    // list, and `.primary-button`, which is the larger page-level Save button.
    expect(OPTIONS_HTML).not.toMatch(/class="add-key"[^>]*>(Export|Download file|Load file)/);
  });
});

function fakePermissions(hasHostAccess: boolean, granted = true): PermissionsPort {
  return {
    hasHostAccess: vi.fn().mockResolvedValue(hasHostAccess),
    requestHostAccess: vi.fn().mockResolvedValue(granted),
  };
}

async function open(storage: FakeStorage, permissions = fakePermissions(true)) {
  mountPage();
  const manager = new SettingsManager(storage);
  const page = new OptionsManager(manager, permissions);
  await page.ready;
  return page;
}

function groupRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.env-group')];
}

function readRow(row: HTMLElement): { production: string; development: string; error: string } {
  return {
    production: row.querySelector<HTMLInputElement>('.group-production')!.value,
    development: row.querySelector<HTMLInputElement>('.group-development')!.value,
    error: row.querySelector('.row-error')?.textContent ?? '',
  };
}

function fillRow(row: HTMLElement, production: string, development: string): void {
  row.querySelector<HTMLInputElement>('.group-production')!.value = production;
  row.querySelector<HTMLInputElement>('.group-development')!.value = development;
}

function clickSave(): Promise<void> {
  document.getElementById('saveButton')?.dispatchEvent(new MouseEvent('click'));
  // Let the async save settle.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function statusText(): string {
  return document.getElementById('status')?.textContent ?? '';
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('options page: loading', () => {
  it('shows one empty row when nothing is configured', async () => {
    await open(new FakeStorage());
    expect(groupRows()).toHaveLength(1);
    expect(readRow(groupRows()[0])).toMatchObject({ production: '', development: '' });
  });

  it('shows several stands as a comma separated list', async () => {
    const storage = new FakeStorage({
      groups: [
        { production: 'app.example.com', development: ['dev.example.com', 'staging.example.com'] },
      ],
    });

    await open(storage);

    expect(readRow(groupRows()[0])).toEqual({
      production: 'app.example.com',
      development: 'dev.example.com, staging.example.com',
      error: '',
    });
  });

  it('renders groups migrated from older shapes, folding shared production hosts', async () => {
    const storage = new FakeStorage({
      productionSites: ['app.example.com', 'app.example.com', '*.prod.example.com'],
      developmentSites: ['dev.example.com', 'staging.example.com', '*.dev.example.com'],
    });

    await open(storage);

    expect(groupRows().map(readRow)).toEqual([
      {
        production: 'app.example.com',
        development: 'dev.example.com, staging.example.com',
        error: '',
      },
      { production: '*.prod.example.com', development: '*.dev.example.com', error: '' },
    ]);
    // The migration was persisted in the new shape.
    expect(storage.lastWrite<EnvironmentGroup[]>('groups')).toEqual([
      { production: 'app.example.com', development: ['dev.example.com', 'staging.example.com'] },
      { production: '*.prod.example.com', development: ['*.dev.example.com'] },
    ]);
  });

  it('populates the size dropdowns from code and selects the stored value', async () => {
    await open(new FakeStorage({ prodSize: 100, devSize: 30 }));

    const prod = document.getElementById('prodSize') as HTMLSelectElement;
    expect([...prod.options].map((option) => option.value)).toEqual([
      '30',
      '50',
      '75',
      '100',
      '125',
      '150',
    ]);
    expect(prod.value).toBe('100');
    expect((document.getElementById('devSize') as HTMLSelectElement).value).toBe('30');
  });

  it('renders tracked localStorage keys', async () => {
    await open(new FakeStorage({ localStorageKeys: ['use-prod-db', 'feature-x'] }));
    expect(
      [...document.querySelectorAll<HTMLInputElement>('.local-storage-key-row input')].map(
        (input) => input.value,
      ),
    ).toEqual(['use-prod-db', 'feature-x']);
  });
});

describe('options page: import and export', () => {
  function transferArea(): HTMLTextAreaElement {
    return document.getElementById('transferArea') as HTMLTextAreaElement;
  }

  function click(id: string): Promise<void> {
    document.getElementById(id)?.dispatchEvent(new MouseEvent('click'));
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('exports the stored configuration without the on/off state', async () => {
    const storage = new FakeStorage({
      groups: [{ production: 'app.example.com', development: ['dev.example.com'] }],
      extensionEnabled: false,
      prodSize: 100,
    });
    await open(storage);

    await click('exportButton');

    const payload = JSON.parse(transferArea().value);
    expect(payload.groups).toEqual([
      { production: 'app.example.com', development: ['dev.example.com'] },
    ]);
    expect(payload.prodSize).toBe(100);
    expect(payload).not.toHaveProperty('extensionEnabled');
  });

  it('imports a pasted configuration, stores it and re-renders the form', async () => {
    const storage = new FakeStorage();
    await open(storage);

    transferArea().value = JSON.stringify({
      groups: [{ production: 'example.com', development: ['dev.example.com', 'qa.example.com'] }],
      bannerPosition: 'bottom',
    });
    await click('importButton');

    expect(storage.lastWrite<EnvironmentGroup[]>('groups')).toEqual([
      { production: 'example.com', development: ['dev.example.com', 'qa.example.com'] },
    ]);
    expect(readRow(groupRows()[0])).toMatchObject({
      production: 'example.com',
      development: 'dev.example.com, qa.example.com',
    });
    expect((document.getElementById('bannerPosition') as HTMLSelectElement).value).toBe('bottom');
    expect(statusText()).toContain('Imported 1');
  });

  it('reports malformed input and stores nothing', async () => {
    const storage = new FakeStorage();
    await open(storage);

    transferArea().value = '{not json';
    await click('importButton');

    expect(storage.lastWrite('groups')).toBeUndefined();
    expect(statusText()).toContain('Import failed');
  });

  it('says how many groups it had to skip', async () => {
    const storage = new FakeStorage();
    await open(storage);

    transferArea().value = JSON.stringify({
      groups: [
        { production: 'good.com', development: ['dev.good.com'] },
        { production: '*', development: ['dev.com'] },
      ],
    });
    await click('importButton');

    expect(statusText()).toContain('skipped 1');
  });

  it('reads a file into the box without applying it', async () => {
    const storage = new FakeStorage();
    await open(storage);

    const payload = JSON.stringify({
      groups: [{ production: 'example.com', development: ['dev.example.com'] }],
    });
    const input = document.getElementById('fileInput') as HTMLInputElement;
    // jsdom cannot populate a real file picker, so stand in for the selection.
    Object.defineProperty(input, 'files', {
      value: [new File([payload], 'shared-settings.json', { type: 'application/json' })],
      configurable: true,
    });

    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transferArea().value).toBe(payload);
    // Nothing is stored until Import is pressed.
    expect(storage.lastWrite('groups')).toBeUndefined();
    expect(statusText()).toContain('shared-settings.json');

    await click('importButton');
    expect(storage.lastWrite('groups')).toEqual([
      { production: 'example.com', development: ['dev.example.com'] },
    ]);
  });

  it('round-trips export into import', async () => {
    const source = new FakeStorage({
      groups: [
        { production: 'app.example.com', development: ['dev.example.com', 'staging.example.com'] },
      ],
      prodSize: 150,
      devSize: 30,
      bannerPosition: 'bottom',
      localStorageKeys: ['use-prod-db'],
    });
    await open(source);
    await click('exportButton');
    const exported = transferArea().value;

    const target = new FakeStorage();
    await open(target);
    transferArea().value = exported;
    await click('importButton');

    expect(target.lastWrite('groups')).toEqual([
      { production: 'app.example.com', development: ['dev.example.com', 'staging.example.com'] },
    ]);
    expect(target.lastWrite('prodSize')).toBe(150);
    expect(target.lastWrite('localStorageKeys')).toEqual(['use-prod-db']);
  });
});

describe('options page: saving', () => {
  it('normalizes a pasted URL down to its hostname', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], 'https://App.Example.com:8443/login?x=1', 'HTTP://Dev.Example.com/x');
    await clickSave();

    expect(storage.lastWrite<EnvironmentGroup[]>('groups')).toEqual([
      { production: 'app.example.com', development: ['dev.example.com'] },
    ]);
    // The normalized value is reflected back so the change is visible.
    expect(readRow(groupRows()[0]).production).toBe('app.example.com');
    expect(statusText()).toBe('Settings saved');
  });

  it('makes the result visible, not merely present in the DOM', async () => {
    await open(new FakeStorage());
    const status = document.getElementById('status') as HTMLElement;

    // The element starts hidden and the page is long: the whole point is that
    // something appears where the user is looking when they press the button.
    expect(status.hidden).toBe(true);
    await clickSave();
    expect(status.hidden).toBe(false);
    expect(status.className).toContain('success');

    // A failure has to be visible on the same terms.
    fillRow(groupRows()[0], 'two words', 'dev.example.com');
    await clickSave();
    expect(status.hidden).toBe(false);
    expect(status.className).toContain('error');
  });

  it('announces itself to a screen reader', async () => {
    await open(new FakeStorage());
    const status = document.getElementById('status') as HTMLElement;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('refuses the whole save when a row is invalid, and says why', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], 'two words', 'dev.example.com');
    await clickSave();

    expect(storage.lastWrite('groups')).toBeUndefined();
    expect(statusText()).toContain('Not saved');
    expect(readRow(groupRows()[0]).error).toContain('not a valid hostname pattern');
    expect(groupRows()[0].classList.contains('has-error')).toBe(true);
  });

  it('rejects a bare wildcard that would match every site', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], '*', 'dev.example.com');
    await clickSave();

    expect(storage.lastWrite('groups')).toBeUndefined();
    expect(readRow(groupRows()[0]).error).toContain('every site');
  });

  it('rejects two different nonzero wildcard counts, which switch neither way', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], '*.example.com', '*.*.dev.example.com');
    await clickSave();

    expect(storage.lastWrite('groups')).toBeUndefined();
    expect(readRow(groupRows()[0]).error).toContain('wildcard');
  });

  it('accepts a comma separated list of stands and normalizes each one', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], 'example.com', ' dev.example.com , https://Staging.example.com/x ');
    await clickSave();

    expect(storage.lastWrite<EnvironmentGroup[]>('groups')).toEqual([
      { production: 'example.com', development: ['dev.example.com', 'staging.example.com'] },
    ]);
    expect(readRow(groupRows()[0]).development).toBe('dev.example.com, staging.example.com');
  });

  it('rejects a stand that repeats the production host', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], 'example.com', 'dev.example.com, example.com');
    await clickSave();

    expect(storage.lastWrite('groups')).toBeUndefined();
    expect(readRow(groupRows()[0]).error).toContain('already the production host');
  });

  it('rejects a group with no stands', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], 'example.com', '');
    await clickSave();

    expect(storage.lastWrite('groups')).toBeUndefined();
    expect(readRow(groupRows()[0]).error).toContain('at least one');
  });

  it('clears a row error once it is corrected', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], 'bad host', 'dev.example.com');
    await clickSave();
    expect(groupRows()[0].classList.contains('has-error')).toBe(true);

    fillRow(groupRows()[0], 'example.com', 'dev.example.com');
    await clickSave();

    expect(groupRows()[0].classList.contains('has-error')).toBe(false);
    expect(readRow(groupRows()[0]).error).toBe('');
    expect(storage.lastWrite<EnvironmentGroup[]>('groups')).toEqual([
      { production: 'example.com', development: ['dev.example.com'] },
    ]);
  });

  it('ignores a completely empty row', async () => {
    const storage = new FakeStorage();
    await open(storage);

    document.getElementById('addGroupButton')?.dispatchEvent(new MouseEvent('click'));
    fillRow(groupRows()[0], 'example.com', 'dev.example.com');
    await clickSave();

    expect(storage.lastWrite<EnvironmentGroup[]>('groups')).toEqual([
      { production: 'example.com', development: ['dev.example.com'] },
    ]);
    expect(statusText()).toBe('Settings saved');
  });

  it('saves banner position, sizes and tracked keys', async () => {
    const storage = new FakeStorage();
    await open(storage);

    fillRow(groupRows()[0], 'example.com', 'dev.example.com');
    (document.getElementById('bannerPosition') as HTMLSelectElement).value = 'bottom';
    (document.getElementById('prodSize') as HTMLSelectElement).value = '150';
    document.getElementById('addKeyButton')?.dispatchEvent(new MouseEvent('click'));
    document.querySelector<HTMLInputElement>('.local-storage-key-row input')!.value =
      ' use-prod-db ';

    await clickSave();

    expect(storage.lastWrite('bannerPosition')).toBe('bottom');
    expect(storage.lastWrite('prodSize')).toBe(150);
    expect(storage.lastWrite('localStorageKeys')).toEqual(['use-prod-db']);
  });

  it('drops a row after Remove is pressed', async () => {
    const storage = new FakeStorage({
      groups: [
        { production: 'a.example.com', development: ['dev.a.example.com'] },
        { production: 'b.example.com', development: ['dev.b.example.com'] },
      ],
    });
    await open(storage);
    expect(groupRows()).toHaveLength(2);

    groupRows()[0].querySelector<HTMLButtonElement>('.remove-group')!.click();
    await clickSave();

    expect(storage.lastWrite<EnvironmentGroup[]>('groups')).toEqual([
      { production: 'b.example.com', development: ['dev.b.example.com'] },
    ]);
  });
});

describe('options page: site access', () => {
  function section(): HTMLElement {
    return document.getElementById('siteAccessSection') as HTMLElement;
  }

  function clickGrant(): Promise<void> {
    document.getElementById('grantAccessButton')?.dispatchEvent(new MouseEvent('click'));
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('stays hidden when the extension may run on sites', async () => {
    await open(new FakeStorage(), fakePermissions(true));
    expect(section().hidden).toBe(true);
  });

  it('appears when it may not', async () => {
    await open(new FakeStorage(), fakePermissions(false));
    expect(section().hidden).toBe(false);
  });

  it('hides itself once access is granted', async () => {
    const permissions = fakePermissions(false, true);
    await open(new FakeStorage(), permissions);

    // Granted from here on.
    permissions.hasHostAccess = vi.fn().mockResolvedValue(true);
    await clickGrant();

    expect(permissions.requestHostAccess).toHaveBeenCalled();
    expect(section().hidden).toBe(true);
    expect(statusText()).toContain('Access granted');
  });

  it('points at the manual route when the browser will not ask', async () => {
    await open(new FakeStorage(), fakePermissions(false, false));

    await clickGrant();

    expect(section().hidden).toBe(false);
    expect((document.getElementById('siteAccessFallback') as HTMLElement).hidden).toBe(false);
    expect(statusText()).toContain('not granted');
  });
});
