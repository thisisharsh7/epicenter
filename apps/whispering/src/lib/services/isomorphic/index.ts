import { AnalyticsServiceLive } from './analytics';
import * as completions from './completion';
import { DbServiceLive } from './db';
import { DownloadServiceLive } from './download';
import { LocalShortcutManagerLive } from './local-shortcut-manager';
import { NotificationServiceLive } from './notifications';
import { OsServiceLive } from './os';
import { NavigatorRecorderServiceLive } from './recorder/navigator';
import { PlaySoundServiceLive } from './sound';
import { TextServiceLive } from './text';
import { ToastServiceLive } from './toast';
import * as transcriptions from './transcription';

/**
 * Cross-platform services.
 * These are available on both web and desktop.
 */
export const services = {
	analytics: AnalyticsServiceLive,
	text: TextServiceLive,
	completions,
	db: DbServiceLive,
	download: DownloadServiceLive,
	localShortcutManager: LocalShortcutManagerLive,
	notification: NotificationServiceLive,
	navigatorRecorder: NavigatorRecorderServiceLive,
	toast: ToastServiceLive,
	os: OsServiceLive,
	sound: PlaySoundServiceLive,
	transcriptions,
} as const;

export type Services = typeof services;

// Re-export types and factory functions that external consumers need
export type { AnalyticsService, AnalyticsServiceError, Event } from './analytics';
export type { TextService, TextServiceError } from './text';
export type {
	Recording,
	Transformation,
	TransformationRun,
	TransformationRunCompleted,
	TransformationRunFailed,
	TransformationRunRunning,
	TransformationStep,
	TransformationStepRun,
	DbService,
	DbServiceError,
} from './db';
export { DbServiceErr, generateDefaultTransformation, generateDefaultTransformationStep } from './db';
export type { DownloadService, DownloadServiceError } from './download';
export type { NotificationService, NotificationServiceError } from './notifications';
export type { OsService, OsServiceError } from './os';
export { OsServiceLive } from './os';
export type { PlaySoundService, PlaySoundServiceError } from './sound';
export type { ToastService } from './toast';
export type { RecorderService, RecorderServiceError } from './recorder/types';
export { RecorderServiceErr } from './recorder/types';
export { getDefaultRecordingsFolder } from './recorder';
export type {
	LocalShortcutManager,
	CommandId,
} from './local-shortcut-manager';
export {
	createLocalShortcutManager,
	shortcutStringToArray,
	arrayToShortcutString,
} from './local-shortcut-manager';

// Re-export completion service types
export type { CompletionService } from './completion';
export type { AnthropicCompletionService } from './completion';
export type { CustomCompletionService } from './completion';
export type { GoogleCompletionService } from './completion';
export type { GroqCompletionService } from './completion';
export type { OpenaiCompletionService } from './completion';
export type { OpenRouterCompletionService } from './completion';
