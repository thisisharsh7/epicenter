/**
 * Base configuration for a local AI model that can be downloaded and used for transcription.
 */
type BaseModelConfig = {
	/** Unique identifier for the model */
	id: string;

	/** Display name for the model */
	name: string;

	/** Brief description of the model's capabilities */
	description: string;

	/** Human-readable file size (e.g., "850 MB", "1.5 GB") */
	size: string;

	/** Exact size in bytes for progress tracking */
	sizeBytes: number;
};

/**
 * Configuration for Whisper models, which consist of a single .bin file.
 */
export type WhisperModelConfig = BaseModelConfig & {
	engine: 'whispercpp';
	file: {
		/** URL to download the model file from */
		url: string;
		/** Filename to save the model as */
		filename: string;
	};
};

/**
 * Configuration for Parakeet models, which consist of multiple ONNX files in a directory structure.
 */
export type ParakeetModelConfig = BaseModelConfig & {
	engine: 'parakeet';
	/** Name of the directory where files will be stored */
	directoryName: string;
	/** Array of files that make up the model */
	files: Array<{
		/** URL to download this file from */
		url: string;
		/** Filename to save this file as */
		filename: string;
		/** Size of this individual file in bytes */
		sizeBytes: number;
	}>;
};

/**
 * Configuration for Moonshine models, which consist of ONNX encoder/decoder files in a directory.
 * Moonshine is optimized for fast, efficient transcription with support for 8 languages.
 *
 * The `variant` field is required because Moonshine's ONNX files don't self-describe their
 * architecture. Unlike Whisper `.bin` files (which contain model metadata) or Parakeet
 * directories (which include a `config.json`), Moonshine requires the caller to specify
 * whether the model is "tiny" or "base" so transcribe-rs knows the layer count and hidden
 * dimensions needed to properly load and run inference.
 */
export type MoonshineModelConfig = BaseModelConfig & {
	engine: 'moonshine';
	/**
	 * Model architecture variant. This is passed to transcribe-rs as `MoonshineModelParams`
	 * so the engine knows how to interpret the ONNX files. Required because the ONNX format
	 * doesn't include this metadata.
	 */
	variant: 'tiny' | 'base';
	/** Language code for this model variant */
	language: 'en' | 'ar' | 'zh' | 'ja' | 'ko' | 'es' | 'uk' | 'vi';
	/** Name of the directory where files will be stored */
	directoryName: string;
	/** Array of ONNX files that make up the model */
	files: Array<{
		/** URL to download this file from */
		url: string;
		/** Filename to save this file as */
		filename: string;
		/** Size of this individual file in bytes */
		sizeBytes: number;
	}>;
};

/**
 * Union type for all supported local model configurations.
 */
export type LocalModelConfig =
	| WhisperModelConfig
	| ParakeetModelConfig
	| MoonshineModelConfig;

/**
 * Checks if a model file size is valid (at least 90% of expected size).
 * Used to detect corrupted or incomplete downloads.
 */
export function isModelFileSizeValid(
	actualBytes: number,
	expectedBytes: number,
): boolean {
	return actualBytes >= expectedBytes * 0.9;
}
