import { createOpenAiCompatibleCompletionService } from './openai-compatible';
import type { CompletionService } from './types';

export function createOpenRouterCompletionService(): CompletionService {
	const baseService = createOpenAiCompatibleCompletionService({
		providerLabel: 'OpenRouter',
		defaultHeaders: {
			'HTTP-Referer': 'https://whispering.epicenter.so',
			'X-Title': 'Whispering',
		},
		statusMessageOverrides: {
			402: 'Insufficient credits in your OpenRouter account. Please add credits to continue.',
			502: 'The model provider is temporarily unavailable. OpenRouter will automatically retry with fallback models if configured.',
			503: 'OpenRouter is temporarily unavailable. Please try again in a few minutes.',
		},
	});

	return {
		async complete({ apiKey, model, systemPrompt, userPrompt }) {
			return baseService.complete({
				apiKey,
				model,
				baseUrl: 'https://openrouter.ai/api/v1',
				systemPrompt,
				userPrompt,
			});
		},
	};
}

export type OpenRouterCompletionService = ReturnType<
	typeof createOpenRouterCompletionService
>;

export const OpenRouterCompletionServiceLive =
	createOpenRouterCompletionService();
