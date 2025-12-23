import { OsServiceLive } from '$lib/services';

export const IS_WINDOWS = OsServiceLive.type() === 'windows';
