import type { PlatformAPI } from './types/platform';
// Resolved by webpack's `@platform-impl` alias to src/platform/<target>/index.ts.
// Each bundle therefore contains exactly one platform implementation, and no
// runtime browser sniffing is needed.
import platformImpl from '@platform-impl';

export const platform: PlatformAPI = platformImpl;
