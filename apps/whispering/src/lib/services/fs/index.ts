export type { FsService, FsServiceError } from './types';
export { createFsServiceDesktop } from './desktop';

import { createFsServiceDesktop } from './desktop';
export const FsServiceLive = createFsServiceDesktop();
