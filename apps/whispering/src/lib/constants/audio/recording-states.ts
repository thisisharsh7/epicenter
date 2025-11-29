/**
 * Recording state constants and schemas
 */
import { z } from 'zod';

export const RECORDING_STATE_SCHEMA = z.enum(['IDLE', 'RECORDING']);

export type WhisperingRecordingState = z.infer<typeof RECORDING_STATE_SCHEMA>;

export type CancelRecordingResult =
	| { status: 'cancelled' }
	| { status: 'no-recording' };

export const RECORDER_STATE_TO_ICON = {
	IDLE: '🎙️',
	RECORDING: '⏹️',
} as const satisfies Record<WhisperingRecordingState, string>;

export const VAD_STATE_SCHEMA = z.enum(['IDLE', 'LISTENING', 'SPEECH_DETECTED']);

export type VadState = z.infer<typeof VAD_STATE_SCHEMA>;

export const VAD_STATE_TO_ICON = {
	IDLE: '🎤',
	LISTENING: '💬',
	SPEECH_DETECTED: '👂',
} as const satisfies Record<VadState, string>;
