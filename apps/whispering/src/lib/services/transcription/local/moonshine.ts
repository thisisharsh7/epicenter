import { invoke } from '@tauri-apps/api/core';
import { sep } from '@tauri-apps/api/path';
import { stat } from '@tauri-apps/plugin-fs';
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
 * Extracts the model variant ("tiny" or "base") from a model path.
 *
 * Moonshine's ONNX files don't self-describe their architecture (unlike Whisper
 * .bin files which contain metadata, or Parakeet which includes config.json).
 * The variant tells transcribe-rs the layer count and hidden dimensions needed
 * to load the model correctly.
 *
 * Model paths follow the convention: `.../moonshine-{variant}-{lang}`
 * Examples:
 * - `/path/to/moonshine-tiny-en` → "tiny"
 * - `/path/to/moonshine-base-en` → "base"
 *
 * @param modelPath - Full path to the moonshine model directory
 * @returns The variant string to pass to transcribe-rs
 */
export function extractVariantFromPath(modelPath: string): 'tiny' | 'base' {
	const dirName = modelPath.split(sep()).pop() ?? '';
	if (dirName.includes('base')) return 'base';
	return 'tiny'; // Default to tiny if we can't determine
}

/**
 * Pre-built Moonshine models available for download from HuggingFace.
 * These are ONNX models using encoder-decoder architecture with KV caching.
 *
 * ## How variant is determined
 *
 * The variant ("tiny" or "base") is extracted from the directory name at
 * transcription time using `extractVariantFromPath()`. This avoids storing
 * redundant metadata since our directory naming convention already encodes
 * the architecture information.
 *
 * - "tiny" models: 6 layers, head_dim=36 (~30 MB quantized)
 * - "base" models: 8 layers, head_dim=52 (~65 MB quantized)
 *
 * The Rust command converts this to `MoonshineModelParams::tiny()` or
 * `MoonshineModelParams::base()` for the engine.
 *
 * Note: Language-specific models (ar, zh, ja, ko, uk, vi, es) exist but only
 * have float versions available. We provide quantized English models for now
 * since they offer the best size/performance tradeoff.
 */
export const MOONSHINE_MODELS = [
	{
		id: 'moonshine-tiny-en',
		name: 'Moonshine Tiny (English)',
		description: 'Fast and efficient English transcription (~28 MB)',
		size: '~30 MB',
		sizeBytes: 30_166_481, // encoder + decoder + tokenizer
		engine: 'moonshine',
		language: 'en',
		directoryName: 'moonshine-tiny-en', // variant "tiny" extracted at transcription time
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
		language: 'en',
		directoryName: 'moonshine-base-en', // variant "base" extracted at transcription time
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
] as const satisfies readonly MoonshineModelConfig[];

const MoonshineErrorType = type({
	name: "'AudioReadError' | 'FfmpegNotFoundError' | 'ModelLoadError' | 'TranscriptionError'",
	message: 'string',
});

export function createMoonshineTranscriptionService() {
	return {
		async transcribe(
			audioBlob: Blob,
			options: { modelPath: string },
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

			// Check if model directory exists and is a directory (single I/O call)
			const { data: stats } = await tryAsync({
				try: () => stat(options.modelPath),
				catch: () => Ok(null),
			});

			if (!stats) {
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

			if (!stats.isDirectory) {
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

			// Extract variant from the model path (e.g., "moonshine-tiny-en" → "tiny")
			const variant = extractVariantFromPath(options.modelPath);

			// Call Tauri command to transcribe with Moonshine
			// Note: Moonshine supports limited languages (en, ar, zh, ja, ko, es, uk, vi)
			const result = await tryAsync({
				try: () =>
					invoke<string>('transcribe_audio_moonshine', {
						audioData: audioData,
						modelPath: options.modelPath,
						variant,
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
