/**
 * Recording state constants and schemas
 */
import { type } from 'arktype';

export const WhisperingRecordingState = type("'IDLE' | 'RECORDING'");

export type WhisperingRecordingState = typeof WhisperingRecordingState.infer;

export type CancelRecordingResult =
	| { status: 'cancelled' }
	| { status: 'no-recording' };

export const recorderStateToIcons = {
	IDLE: '🎙️',
	RECORDING: '⏹️',
} as const satisfies Record<WhisperingRecordingState, string>;

export const VadState = type("'IDLE' | 'LISTENING' | 'SPEECH_DETECTED'");

export type VadState = typeof VadState.infer;

export const vadStateToIcons = {
	IDLE: '🎤',
	LISTENING: '💬',
	SPEECH_DETECTED: '👂',
} as const satisfies Record<VadState, string>;
