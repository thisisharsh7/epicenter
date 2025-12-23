export type { FfmpegService, FfmpegServiceError } from './types';
export { createFfmpegService } from './desktop';

import { createFfmpegService } from './desktop';
export const FfmpegServiceLive = createFfmpegService();
