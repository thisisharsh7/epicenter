export type { AutostartService, AutostartServiceError } from './types';
export { createAutostartServiceDesktop } from './desktop';

import { createAutostartServiceDesktop } from './desktop';
export const AutostartServiceLive = createAutostartServiceDesktop();
