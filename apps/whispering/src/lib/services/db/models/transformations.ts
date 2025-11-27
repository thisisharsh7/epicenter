import { type } from 'arktype';
import { nanoid } from 'nanoid/non-secure';
import {
	ANTHROPIC_INFERENCE_MODELS,
	GOOGLE_INFERENCE_MODELS,
	GROQ_INFERENCE_MODELS,
	INFERENCE_PROVIDERS,
	OPENAI_INFERENCE_MODELS,
} from '$lib/constants/inference';

export const TRANSFORMATION_STEP_TYPES = [
	'prompt_transform',
	'find_replace',
] as const;

export const TRANSFORMATION_STEP_TYPES_TO_LABELS = {
	prompt_transform: 'Prompt Transform',
	find_replace: 'Find Replace',
} as const satisfies Record<(typeof TRANSFORMATION_STEP_TYPES)[number], string>;

/**
 * The current version of the TransformationStep schema.
 * Increment this when adding new fields or making breaking changes.
 */
const CURRENT_TRANSFORMATION_STEP_VERSION = 2 as const;

/**
 * Base fields shared across all TransformationStep versions.
 * These fields exist in every version of the schema.
 */
const TransformationStepBaseFields = {
	id: 'string',
	type: type.enumerated(...TRANSFORMATION_STEP_TYPES),
	'prompt_transform.inference.provider': type.enumerated(
		...INFERENCE_PROVIDERS,
	),
	'prompt_transform.inference.provider.OpenAI.model': type.enumerated(
		...OPENAI_INFERENCE_MODELS,
	),
	'prompt_transform.inference.provider.Groq.model': type.enumerated(
		...GROQ_INFERENCE_MODELS,
	),
	'prompt_transform.inference.provider.Anthropic.model': type.enumerated(
		...ANTHROPIC_INFERENCE_MODELS,
	),
	'prompt_transform.inference.provider.Google.model': type.enumerated(
		...GOOGLE_INFERENCE_MODELS,
	),
	// OpenRouter model is a free string (user can enter any model)
	'prompt_transform.inference.provider.OpenRouter.model': 'string',
	'prompt_transform.systemPromptTemplate': 'string',
	'prompt_transform.userPromptTemplate': 'string',
	'find_replace.findText': 'string',
	'find_replace.replaceText': 'string',
	'find_replace.useRegex': 'boolean',
} as const;

/**
 * V1: Original schema without Custom provider fields or version.
 * Old data has no version field, so we default to 1.
 */
const TransformationStepV1 = type({
	// Version defaults to 1 for old data that doesn't have it
	version: '1 = 1',
	...TransformationStepBaseFields,
});

export type TransformationStepV1 = typeof TransformationStepV1.infer;

/**
 * V2: Added Custom provider fields for local LLM endpoints.
 * - Custom.model: Model name for custom endpoints
 * - Custom.baseUrl: Per-step base URL (falls back to global setting)
 */
const TransformationStepV2 = type({
	version: '2',
	...TransformationStepBaseFields,
	/**
	 * Custom provider for local LLM endpoints (Ollama, LM Studio, llama.cpp, etc.)
	 */
	'prompt_transform.inference.provider.Custom.model': 'string',
	/**
	 * Per-step base URL for custom endpoints. Allows different steps to use
	 * different local services (e.g., Ollama on :11434, LM Studio on :1234).
	 * Falls back to global `completion.Custom.baseUrl` setting if empty.
	 */
	'prompt_transform.inference.provider.Custom.baseUrl': 'string',
});

export type TransformationStepV2 = typeof TransformationStepV2.infer;

/**
 * TransformationStep input validator - accepts V1 or V2 data.
 * Used internally for validation before migration.
 */
const TransformationStepInput = TransformationStepV1.or(TransformationStepV2);

/**
 * TransformationStep validator with automatic migration.
 *
 * Accepts any version of the schema and migrates to the latest (V2).
 * The .pipe() transform ensures the output is always the current version.
 *
 * Use this when validating individual steps outside of a Transformation context.
 */
export const TransformationStep = TransformationStepInput.pipe(
	(step): TransformationStepV2 => {
		if (step.version === 1) {
			return {
				...step,
				version: 2,
				'prompt_transform.inference.provider.Custom.model': '',
				'prompt_transform.inference.provider.Custom.baseUrl': '',
			};
		}
		return step;
	},
);

/**
 * The current TransformationStep type (always the latest version).
 * This is the output type after validation and migration.
 */
export type TransformationStep = typeof TransformationStep.infer;

/**
 * Transformation schema.
 * Step migration happens automatically via TransformationStep's .pipe() validator.
 */
export const Transformation = type({
	id: 'string',
	title: 'string',
	description: 'string',
	createdAt: 'string',
	updatedAt: 'string',
	/**
	 * It can be one of several types of text transformations:
	 * - find_replace: Replace text patterns with new text
	 * - prompt_transform: Use AI to transform text based on prompts
	 */
	steps: [TransformationStep, '[]'],
});

export type Transformation = typeof Transformation.infer;

export function generateDefaultTransformation(): Transformation {
	const now = new Date().toISOString();
	return {
		id: nanoid(),
		title: '',
		description: '',
		steps: [],
		createdAt: now,
		updatedAt: now,
	};
}

export function generateDefaultTransformationStep(): TransformationStep {
	return {
		version: CURRENT_TRANSFORMATION_STEP_VERSION,
		id: nanoid(),
		type: 'prompt_transform',
		'prompt_transform.inference.provider': 'Google',
		'prompt_transform.inference.provider.OpenAI.model': 'gpt-4o',
		'prompt_transform.inference.provider.Groq.model': 'llama-3.3-70b-versatile',
		'prompt_transform.inference.provider.Anthropic.model': 'claude-sonnet-4-0',
		'prompt_transform.inference.provider.Google.model': 'gemini-2.5-flash',
		'prompt_transform.inference.provider.OpenRouter.model':
			'mistralai/mixtral-8x7b',
		// Empty strings for Custom provider - user must configure when switching to Custom
		// baseUrl falls back to global setting in transformer.ts
		'prompt_transform.inference.provider.Custom.model': '',
		'prompt_transform.inference.provider.Custom.baseUrl': '',

		'prompt_transform.systemPromptTemplate': '',
		'prompt_transform.userPromptTemplate': '',

		'find_replace.findText': '',
		'find_replace.replaceText': '',
		'find_replace.useRegex': false,
	};
}
