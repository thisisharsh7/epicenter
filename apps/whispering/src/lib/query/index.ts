// Import all query modules
import { commands } from './actions';
import { analytics } from './analytics';
import { autostart } from './autostart';
import { db } from './db';
import { delivery } from './delivery';
import { download } from './download';
import { ffmpeg } from './ffmpeg';
import { notify } from './notify';
import { recorder } from './recorder';
import { globalShortcuts, localShortcuts } from './shortcuts';
import { sound } from './sound';
import { text } from './text';
import { transcription } from './transcription';
import { transformer } from './transformer';
import { tray } from './tray';

/**
 * Cross-platform RPC namespace.
 * These query operations are available on both web and desktop.
 */
export const rpc = {
	analytics,
	text,
	commands,
	db,
	download,
	recorder,
	localShortcuts,
	sound,
	transcription,
	transformer,
	notify,
	delivery,
};

/**
 * Desktop-only RPC namespace.
 * These query operations are only available in the Tauri desktop app.
 * The individual modules handle platform checks internally via desktopServices.
 */
export const desktopRpc = {
	autostart,
	tray,
	ffmpeg,
	globalShortcuts,
};
