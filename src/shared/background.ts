import { platform } from './platform';

// Listen for messages from the popup
platform.onMessage.addListener(async (message: any, sender: any) => {
  if (message.command === 'open-options') {
    platform.openOptionsPage();
  }
});

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command: string) => {
  if (command === 'switch-environment') {
    const tab = await platform.getCurrentTab();
    if (tab?.id) {
      await platform.sendMessageToTab(tab.id, { command: 'toggle-environment' });
    }
  }
}); 