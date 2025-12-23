export type {
	CommandService,
	CommandServiceError,
	ShellCommand,
} from './types';
export { asShellCommand } from './types';
export { createCommandServiceDesktop } from './desktop';

import { createCommandServiceDesktop } from './desktop';
export const CommandServiceLive = createCommandServiceDesktop();
