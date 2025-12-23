import { autostart } from './desktop/autostart';
import { ffmpeg } from './desktop/ffmpeg';
import { globalShortcuts } from './desktop/shortcuts';
import { tray } from './desktop/tray';
import { commands } from './isomorphic/actions';
import { analytics } from './isomorphic/analytics';
import { db } from './isomorphic/db';
import { delivery } from './isomorphic/delivery';
import { download } from './isomorphic/download';
import { notify } from './isomorphic/notify';
import { recorder } from './isomorphic/recorder';
import { localShortcuts } from './isomorphic/shortcuts';
import { sound } from './isomorphic/sound';
import { text } from './isomorphic/text';
import { transcription } from './isomorphic/transcription';
import { transformer } from './isomorphic/transformer';

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
