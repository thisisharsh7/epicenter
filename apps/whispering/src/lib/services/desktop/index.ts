// Re-export service instances with Live suffix naming convention
export {
	type AutostartService,
	AutostartServiceErr,
	type AutostartServiceError,
	AutostartServiceLive as autostart,
	createAutostartServiceDesktop,
} from './autostart';

export {
	asShellCommand,
	type CommandService,
	CommandServiceErr,
	type CommandServiceError,
	CommandServiceLive as command,
	createCommandServiceDesktop,
	type ShellCommand,
} from './command';

export {
	createFfmpegService,
	type FfmpegService,
	FfmpegServiceErr,
	type FfmpegServiceError,
	FfmpegServiceLive as ffmpeg,
} from './ffmpeg';

export {
	createFsServiceDesktop,
	type FsService,
	FsServiceErr,
	type FsServiceError,
	FsServiceLive as fs,
} from './fs';
export {
	type Accelerator,
	createGlobalShortcutManager,
	type GlobalShortcutManager,
	GlobalShortcutManagerLive as globalShortcutManager,
	isValidElectronAccelerator,
	pressedKeysToTauriAccelerator,
} from './global-shortcut-manager';
export {
	createPermissionsService,
	type PermissionsService,
	PermissionsServiceErr,
	type PermissionsServiceError,
	PermissionsServiceLive as permissions,
} from './permissions';
export {
	CpalRecorderServiceLive as cpalRecorder,
	createCpalRecorderService,
} from './recorder/cpal';
export {
	buildFfmpegCommand,
	createFfmpegRecorderService,
	FFMPEG_DEFAULT_COMPRESSION_OPTIONS,
	FFMPEG_DEFAULT_DEVICE_IDENTIFIER,
	FFMPEG_DEFAULT_GLOBAL_OPTIONS,
	FFMPEG_DEFAULT_INPUT_OPTIONS,
	FFMPEG_DEFAULT_OUTPUT_OPTIONS,
	FFMPEG_ENUMERATE_DEVICES_COMMAND,
	FFMPEG_SMALLEST_COMPRESSION_OPTIONS,
	FfmpegRecorderServiceLive as ffmpegRecorder,
	formatDeviceForPlatform,
	getFileExtensionFromFfmpegOptions,
} from './recorder/ffmpeg';
export {
	createTrayIconDesktopService,
	type TrayIconService,
	TrayIconServiceLive as tray,
} from './tray';

// Also create a combined desktopServices object for backwards compatibility
import { AutostartServiceLive } from './autostart';
import { CommandServiceLive } from './command';
import { FfmpegServiceLive } from './ffmpeg';
import { FsServiceLive } from './fs';
import { GlobalShortcutManagerLive } from './global-shortcut-manager';
import { PermissionsServiceLive } from './permissions';
import { CpalRecorderServiceLive } from './recorder/cpal';
import { FfmpegRecorderServiceLive } from './recorder/ffmpeg';
import { TrayIconServiceLive } from './tray';

/**
 * Desktop-only services.
 * These services are only available in the Tauri desktop app.
 */
export const desktopServices = {
	autostart: AutostartServiceLive,
	command: CommandServiceLive,
	ffmpeg: FfmpegServiceLive,
	fs: FsServiceLive,
	tray: TrayIconServiceLive,
	globalShortcutManager: GlobalShortcutManagerLive,
	permissions: PermissionsServiceLive,
	cpalRecorder: CpalRecorderServiceLive,
	ffmpegRecorder: FfmpegRecorderServiceLive,
} as const;

export type DesktopServices = typeof desktopServices;
