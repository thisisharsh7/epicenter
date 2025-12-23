import { OsServiceLive } from '$lib/services';

export const IS_LINUX = OsServiceLive.type() === 'linux';
