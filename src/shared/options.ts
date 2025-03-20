import { platform } from './platform';

class OptionsManager {
  private urlPairsContainer: HTMLElement;
  private saveButton: HTMLButtonElement;
  private status: HTMLElement;
  private prodSizeSelect: HTMLSelectElement;
  private devSizeSelect: HTMLSelectElement;
  private bannerPositionSelect: HTMLSelectElement;
  private localStorageKeysContainer: HTMLElement;

  constructor() {
    this.urlPairsContainer = document.getElementById('urlPairsContainer') as HTMLElement;
    this.saveButton = document.getElementById('saveButton') as HTMLButtonElement;
    this.status = document.getElementById('status') as HTMLElement;
    this.prodSizeSelect = document.getElementById('prodSize') as HTMLSelectElement;
    this.devSizeSelect = document.getElementById('devSize') as HTMLSelectElement;
    this.bannerPositionSelect = document.getElementById('bannerPosition') as HTMLSelectElement;
    this.localStorageKeysContainer = document.getElementById('localStorageKeysContainer') as HTMLElement;
    
    this.loadSettings();
    this.setupEventListeners();
  }

  private async loadSettings(): Promise<void> {
    const data = await platform.storage.get([
      'productionSites',
      'developmentSites',
      'prodSize',
      'devSize',
      'bannerPosition',
      'localStorageKeys'
    ]);
    
    const productionSites = data.productionSites || [];
    const developmentSites = data.developmentSites || [];
    const localStorageKeys = data.localStorageKeys || [];
    
    // Load banner sizes
    this.prodSizeSelect.value = data.prodSize?.toString() || '50';
    this.devSizeSelect.value = data.devSize?.toString() || '50';
    
    // Load banner position
    this.bannerPositionSelect.value = data.bannerPosition || 'top';
    
    // Load URL pairs
    this.urlPairsContainer.innerHTML = '';
    const maxPairs = Math.max(productionSites.length, developmentSites.length, 1);
    
    for (let i = 0; i < maxPairs; i++) {
      this.addUrlPair(productionSites[i] || '', developmentSites[i] || '');
    }

    // Load localStorage keys
    this.localStorageKeysContainer.innerHTML = '';
    localStorageKeys.forEach((key: string) => {
      this.addLocalStorageKey(key);
    });
  }

  private addUrlPair(prodUrl: string = '', devUrl: string = ''): void {
    const pairDiv = document.createElement('div');
    pairDiv.className = 'url-pair';
    
    const prodInput = document.createElement('input');
    prodInput.type = 'text';
    prodInput.value = prodUrl;
    prodInput.placeholder = 'Production URL';
    
    const devInput = document.createElement('input');
    devInput.type = 'text';
    devInput.value = devUrl;
    devInput.placeholder = 'Development URL';
    
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.className = 'remove-pair';
    removeButton.onclick = () => pairDiv.remove();
    
    pairDiv.appendChild(prodInput);
    pairDiv.appendChild(devInput);
    pairDiv.appendChild(removeButton);
    
    this.urlPairsContainer.appendChild(pairDiv);
  }

  private addLocalStorageKey(key: string = ''): void {
    const keyDiv = document.createElement('div');
    keyDiv.className = 'local-storage-key-row';
    
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.value = key;
    keyInput.placeholder = 'Enter localStorage key';
    
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Delete';
    removeButton.className = 'remove-key';
    removeButton.onclick = () => keyDiv.remove();
    
    keyDiv.appendChild(keyInput);
    keyDiv.appendChild(removeButton);
    
    this.localStorageKeysContainer.appendChild(keyDiv);
  }

  private setupEventListeners(): void {
    document.getElementById('addPairButton')?.addEventListener('click', () => {
      this.addUrlPair();
    });

    document.getElementById('addKeyButton')?.addEventListener('click', () => {
      this.addLocalStorageKey();
    });

    this.saveButton.addEventListener('click', async () => {
      const urlPairs = Array.from(this.urlPairsContainer.getElementsByClassName('url-pair'));
      const productionSites: string[] = [];
      const developmentSites: string[] = [];
      
      urlPairs.forEach(pair => {
        const inputs = pair.getElementsByTagName('input');
        const prodUrl = inputs[0].value.trim();
        const devUrl = inputs[1].value.trim();
        
        if (prodUrl && devUrl) {
          productionSites.push(prodUrl);
          developmentSites.push(devUrl);
        }
      });

      // Get localStorage keys
      const keyRows = Array.from(this.localStorageKeysContainer.getElementsByClassName('local-storage-key-row'));
      const localStorageKeys = keyRows
        .map(row => row.querySelector('input')?.value.trim())
        .filter((key): key is string => key !== undefined && key !== '');
      
      await platform.storage.set({
        productionSites,
        developmentSites,
        prodSize: parseInt(this.prodSizeSelect.value),
        devSize: parseInt(this.devSizeSelect.value),
        bannerPosition: this.bannerPositionSelect.value,
        localStorageKeys
      });
      
      this.showStatus('Settings saved successfully!');
    });
  }

  private showStatus(message: string): void {
    this.status.textContent = message;
    this.status.style.display = 'block';
    setTimeout(() => {
      this.status.style.display = 'none';
    }, 3000);
  }
}

// Initialize options page
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
}); 