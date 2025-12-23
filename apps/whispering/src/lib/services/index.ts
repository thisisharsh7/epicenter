import { AnalyticsServiceLive } from './analytics';
import { createAutostartServiceDesktop } from './autostart';
import { createCommandServiceDesktop } from './command';
import * as completions from './completion';
import { DbServiceLive } from './db';
import { DownloadServiceLive } from './download';
import { createFfmpegService } from './ffmpeg';
import { createFsServiceDesktop } from './fs';
import { createGlobalShortcutManager } from './global-shortcut-manager';
import { LocalShortcutManagerLive } from './local-shortcut-manager';
import { NotificationServiceLive } from './notifications';
import { OsServiceLive } from './os';
import { createPermissionsService } from './permissions';
import { createCpalRecorderService } from './recorder/cpal';
import { createFfmpegRecorderService } from './recorder/ffmpeg';
import { NavigatorRecorderServiceLive } from './recorder/navigator';
import { PlaySoundServiceLive } from './sound';
import { TextServiceLive } from './text';
import { ToastServiceLive } from './toast';
import * as transcriptions from './transcription';
import { createTrayIconDesktopService } from './tray';

// Types
import type { AutostartService } from './autostart';
import type { CommandService } from './command';
import type { FfmpegService } from './ffmpeg';
import type { FsService } from './fs';
import type { PermissionsService } from './permissions';
import type { RecorderService } from './recorder/types';

// Export the type for SetTrayIconService (need to define it since it's not in a separate types file)
type SetTrayIconService = ReturnType<typeof createTrayIconDesktopService>;
type GlobalShortcutManager = ReturnType<typeof createGlobalShortcutManager>;

/**
 * Desktop-only services type.
 * These services are only available in the Tauri desktop app.
 */
export type DesktopServices = {
	autostart: AutostartService;
	command: CommandService;
	ffmpeg: FfmpegService;
	fs: FsService;
	tray: SetTrayIconService;
	globalShortcutManager: GlobalShortcutManager;
	permissions: PermissionsService;
	cpalRecorder: RecorderService;
	ffmpegRecorder: RecorderService;
};

/**
 * Desktop-only services.
 * These services are only available in the Tauri desktop app.
 * The individual modules handle platform checks internally.
 */
export const desktopServices = {
	autostart: createAutostartServiceDesktop(),
	command: createCommandServiceDesktop(),
	ffmpeg: createFfmpegService(),
	fs: createFsServiceDesktop(),
	tray: createTrayIconDesktopService(),
	globalShortcutManager: createGlobalShortcutManager(),
	permissions: createPermissionsService(),
	cpalRecorder: createCpalRecorderService(),
	ffmpegRecorder: createFfmpegRecorderService(),
};

/**
 * Cross-platform services.
 * These are available on both web and desktop.
 */
export {
	AnalyticsServiceLive as analytics,
	TextServiceLive as text,
	completions,
	DbServiceLive as db,
	DownloadServiceLive as download,
	LocalShortcutManagerLive as localShortcutManager,
	NotificationServiceLive as notification,
	NavigatorRecorderServiceLive as navigatorRecorder,
	ToastServiceLive as toast,
	OsServiceLive as os,
	PlaySoundServiceLive as sound,
	transcriptions,
};
