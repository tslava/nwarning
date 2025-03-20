import { platform } from '../platform';

interface Warning {
  key: string;
  value: string;
  isWarning: boolean;
}

function checkLocalStorageVariables(): void {
  platform.storage.get(['localStorageKeys']).then((result: { localStorageKeys?: string[] }) => {
    const keys = result.localStorageKeys || [];
    const warnings: Warning[] = [];

    keys.forEach((key: string) => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        warnings.push({
          key,
          value,
          isWarning: value === '1' || value === 'true'
        });
      }
    });

    if (warnings.length > 0) {
      displayWarnings(warnings);
    }
  });
}

function displayWarnings(warnings: Warning[]): void {
  let existingBanner = document.getElementById('environment-banner');
  if (!existingBanner) {
    // If no environment banner exists, create one
    const wrapper = document.createElement('div');
    wrapper.id = 'environment-banner-wrapper';
    
    existingBanner = document.createElement('div');
    existingBanner.id = 'environment-banner';
    existingBanner.style.backgroundColor = '#4CAF50';
    
    wrapper.appendChild(existingBanner);
    document.body.insertBefore(wrapper, document.body.firstChild);
  }

  const warningText = warnings.map(w => {
    const brightness = w.isWarning ? 'bright' : 'dim';
    return `<span class="${brightness}">${w.key} = ${w.value}</span>`;
  }).join(' | ');

  existingBanner.innerHTML = `
    <div class="warning-content">
      <span class="warning-icon">⚠️</span>
      <span class="warning-text">${warningText}</span>
    </div>
  `;
}

// Initial check
checkLocalStorageVariables();

// Listen for storage changes
window.addEventListener('storage', (e: StorageEvent) => {
  if (e.storageArea === localStorage) {
    checkLocalStorageVariables();
  }
}); 