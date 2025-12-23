import { OsServiceLive } from '$lib/services';

export const IS_MACOS = OsServiceLive.type() === 'macos';
