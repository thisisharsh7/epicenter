import { invoke } from '@tauri-apps/api/core';
import { exists, stat } from '@tauri-apps/plugin-fs';
import { type } from 'arktype';
import { extractErrorMessage } from 'wellcrafted/error';
import { Ok, type Result, tryAsync } from 'wellcrafted/result';
import { WhisperingErr, type WhisperingError } from '$lib/result';
import type { MoonshineModelConfig } from './types';

/**
 * HuggingFace base URL for Moonshine models.
 * Models are distributed across different directories:
 * - ONNX models: onnx/merged/[variant]/quantized/
 * - Tokenizer: ctranslate2/tiny/ (shared across all models)
 */
const HF_BASE = 'https://huggingface.co/UsefulSensors/moonshine/resolve/main';

/**
 * Pre-built Moonshine models available for download from HuggingFace.
 * These are ONNX models using encoder-decoder architecture with KV caching.
 *
 * Note: Language-specific models (ar, zh, ja, ko, uk, vi, es) exist but only
 * have float versions available. We provide quantized English models for now
 * since they offer the best size/performance tradeoff.
 */
export const MOONSHINE_MODELS: readonly MoonshineModelConfig[] = [
	{
		id: 'moonshine-tiny-en',
		name: 'Moonshine Tiny (English)',
		description: 'Fast and efficient English transcription (~28 MB)',
		size: '~30 MB',
		sizeBytes: 30_166_481, // encoder + decoder + tokenizer
		engine: 'moonshine',
		variant: 'tiny',
		language: 'en',
		directoryName: 'moonshine-tiny-en',
		files: [
			{
				url: `${HF_BASE}/onnx/merged/tiny/quantized/encoder_model.onnx`,
				filename: 'encoder_model.onnx',
				sizeBytes: 7_937_661,
			},
			{
				url: `${HF_BASE}/onnx/merged/tiny/quantized/decoder_model_merged.onnx`,
				filename: 'decoder_model_merged.onnx',
				sizeBytes: 20_243_286,
			},
			{
				url: `${HF_BASE}/ctranslate2/tiny/tokenizer.json`,
				filename: 'tokenizer.json',
				sizeBytes: 1_985_534,
			},
		],
	},
	{
		id: 'moonshine-base-en',
		name: 'Moonshine Base (English)',
		description: 'Higher accuracy English transcription (~65 MB)',
		size: '~65 MB',
		sizeBytes: 64_997_467, // encoder + decoder + tokenizer
		engine: 'moonshine',
		variant: 'base',
		language: 'en',
		directoryName: 'moonshine-base-en',
		files: [
			{
				url: `${HF_BASE}/onnx/merged/base/quantized/encoder_model.onnx`,
				filename: 'encoder_model.onnx',
				sizeBytes: 20_513_063,
			},
			{
				url: `${HF_BASE}/onnx/merged/base/quantized/decoder_model_merged.onnx`,
				filename: 'decoder_model_merged.onnx',
				sizeBytes: 42_498_870,
			},
			{
				url: `${HF_BASE}/ctranslate2/tiny/tokenizer.json`,
				filename: 'tokenizer.json',
				sizeBytes: 1_985_534,
			},
		],
	},
] as const;

const MoonshineErrorType = type({
	name: "'AudioReadError' | 'FfmpegNotFoundError' | 'ModelLoadError' | 'TranscriptionError'",
	message: 'string',
});

export function createMoonshineTranscriptionService() {
	return {
		async transcribe(
			audioBlob: Blob,
			options: { modelPath: string; variant: string },
		): Promise<Result<string, WhisperingError>> {
			// Pre-validation
			if (!options.modelPath) {
				return WhisperingErr({
					title: 'Model Directory Required',
					description: 'Please select a Moonshine model directory in settings.',
					action: {
						type: 'link',
						label: 'Configure model',
						href: '/settings/transcription',
					},
				});
			}

			// Check if model directory exists
			const { data: isExists } = await tryAsync({
				try: () => exists(options.modelPath),
				catch: () => Ok(false),
			});

			if (!isExists) {
				return WhisperingErr({
					title: 'Model Directory Not Found',
					description: `The model directory "${options.modelPath}" does not exist.`,
					action: {
						type: 'link',
						label: 'Select model',
						href: '/settings/transcription',
					},
				});
			}

			// Check if it's actually a directory
			const { data: stats } = await tryAsync({
				try: () => stat(options.modelPath),
				catch: () => Ok(null),
			});

			if (!stats || !stats.isDirectory) {
				return WhisperingErr({
					title: 'Invalid Model Path',
					description:
						'Moonshine models must be directories containing model files.',
					action: {
						type: 'link',
						label: 'Select model directory',
						href: '/settings/transcription',
					},
				});
			}

			// Convert audio blob to byte array
			const arrayBuffer = await audioBlob.arrayBuffer();
			const audioData = Array.from(new Uint8Array(arrayBuffer));

			// Call Tauri command to transcribe with Moonshine
			// Note: Moonshine supports limited languages (en, ar, zh, ja, ko, es, uk, vi)
			const result = await tryAsync({
				try: () =>
					invoke<string>('transcribe_audio_moonshine', {
						audioData: audioData,
						modelPath: options.modelPath,
						variant: options.variant,
					}),
				catch: (unknownError) => {
					const result = MoonshineErrorType(unknownError);
					if (result instanceof type.errors) {
						return WhisperingErr({
							title: 'Unexpected Moonshine Error',
							description: extractErrorMessage(unknownError),
							action: { type: 'more-details', error: unknownError },
						});
					}
					const error = result;

					switch (error.name) {
						case 'ModelLoadError':
							return WhisperingErr({
								title: 'Model Loading Error',
								description: error.message,
								action: {
									type: 'more-details',
									error: new Error(error.message),
								},
							});

						case 'FfmpegNotFoundError':
							return WhisperingErr({
								title: 'FFmpeg Not Installed',
								description:
									'Moonshine requires FFmpeg to convert audio formats. Please install FFmpeg or switch to CPAL recording at 16kHz.',
								action: {
									type: 'link',
									label: 'Install FFmpeg',
									href: '/install-ffmpeg',
								},
							});

						case 'AudioReadError':
							return WhisperingErr({
								title: 'Audio Read Error',
								description: error.message,
								action: {
									type: 'more-details',
									error: new Error(error.message),
								},
							});

						case 'TranscriptionError':
							return WhisperingErr({
								title: 'Transcription Error',
								description: error.message,
								action: {
									type: 'more-details',
									error: new Error(error.message),
								},
							});

						default:
							return WhisperingErr({
								title: 'Moonshine Error',
								description: 'An unexpected error occurred.',
								action: {
									type: 'more-details',
									error: new Error(String(error)),
								},
							});
					}
				},
			});

			return result;
		},
	};
}

export type MoonshineTranscriptionService = ReturnType<
	typeof createMoonshineTranscriptionService
>;

export const MoonshineTranscriptionServiceLive =
	createMoonshineTranscriptionService();
