import { platform } from './platform';

class PopupManager {
  private toggleButton: HTMLButtonElement;
  private status: HTMLElement;
  private extensionEnabled: boolean = true;

  constructor() {
    this.toggleButton = document.getElementById('toggleButton') as HTMLButtonElement;
    this.status = document.getElementById('status') as HTMLElement;
    this.loadState();
    this.setupEventListeners();
  }

  private async loadState(): Promise<void> {
    const data = await platform.storage.get(['extensionEnabled']);
    this.extensionEnabled = data.extensionEnabled !== false;
    this.updateUI();
  }

  private updateUI(): void {
    this.toggleButton.textContent = this.extensionEnabled ? 'Disable Extension' : 'Enable Extension';
    this.status.textContent = `Extension is ${this.extensionEnabled ? 'active' : 'inactive'}`;
  }

  private async notifyContentScripts(): Promise<void> {
    const tab = await platform.getCurrentTab();
    if (tab?.id) {
      platform.sendMessageToTab(tab.id, { command: 'extension-state-changed' });
    }
  }

  private setupEventListeners(): void {
    this.toggleButton.addEventListener('click', async () => {
      this.extensionEnabled = !this.extensionEnabled;
      await platform.storage.set({ extensionEnabled: this.extensionEnabled });
      await this.notifyContentScripts();
      this.updateUI();
    });

    document.getElementById('optionsButton')?.addEventListener('click', () => {
      platform.openOptionsPage();
    });
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
}); 