import { PlatformAPI } from './types/platform';
import chromePlatform from '../platform/chrome';
import firefoxPlatform from '../platform/firefox';

// Detect the current browser and select the appropriate platform implementation
const isFirefox = typeof browser !== 'undefined';
export const platform: PlatformAPI = isFirefox ? firefoxPlatform : chromePlatform; 