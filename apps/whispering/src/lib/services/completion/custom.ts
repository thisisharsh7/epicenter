import OpenAI from 'openai';
import { Err, Ok, tryAsync } from 'wellcrafted/result';
import type { CompletionService } from './types';
import { CompletionServiceErr } from './types';

export function createCustomCompletionService(): CompletionService {
	return {
		async complete({ apiKey, model, systemPrompt, userPrompt, baseURL }) {
			// Validate that baseURL is provided for custom endpoints
			if (!baseURL) {
				return CompletionServiceErr({
					message:
						'Base URL is required for custom endpoint. Please configure the API endpoint URL.',
					context: { model },
					cause: undefined,
				});
			}

			const client = new OpenAI({
				apiKey: apiKey || 'not-needed', // Many local endpoints don't require API keys
				baseURL, // e.g., 'http://localhost:11434/v1' for Ollama
				dangerouslyAllowBrowser: true,
			});

			const { data: completion, error: apiError } = await tryAsync({
				try: () =>
					client.chat.completions.create({
						model,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: userPrompt },
						],
					}),
				catch: (error) => {
					if (!(error instanceof OpenAI.APIError)) {
						throw error;
					}
					return Err(error);
				},
			});

			if (apiError) {
				// Handle errors with helpful messages
				const { status, message } = apiError;

				// Handle connection errors (no status code)
				if (!status) {
					return CompletionServiceErr({
						message: `Unable to connect to ${baseURL}. Please check the URL and ensure the service is running.`,
						context: { baseURL, model },
						cause: apiError,
					});
				}

				// 400 - BadRequestError
				if (status === 400) {
					return CompletionServiceErr({
						message:
							message ??
							'Invalid request to custom endpoint. Please check your model name and configuration.',
						context: { status, baseURL, model },
						cause: apiError,
					});
				}

				// 401 - AuthenticationError
				if (status === 401) {
					return CompletionServiceErr({
						message:
							message ??
							'Authentication failed. Please check your API key in settings.',
						context: { status, baseURL, model },
						cause: apiError,
					});
				}

				// 404 - NotFoundError
				if (status === 404) {
					return CompletionServiceErr({
						message:
							message ??
							'Model not found. Please verify the model name and ensure it is available at the endpoint.',
						context: { status, baseURL, model },
						cause: apiError,
					});
				}

				// 429 - RateLimitError
				if (status === 429) {
					return CompletionServiceErr({
						message: message ?? 'Too many requests. Please try again later.',
						context: { status, baseURL, model },
						cause: apiError,
					});
				}

				// >=500 - InternalServerError
				if (status >= 500) {
					return CompletionServiceErr({
						message:
							message ??
							`The endpoint is temporarily unavailable (Error ${status}). Please try again in a few minutes.`,
						context: { status, baseURL, model },
						cause: apiError,
					});
				}

				// Catch-all for unexpected errors
				return CompletionServiceErr({
					message: message ?? 'Custom endpoint API error',
					context: { status, baseURL, model },
					cause: apiError,
				});
			}

			const responseText = completion.choices.at(0)?.message?.content;
			if (!responseText) {
				return CompletionServiceErr({
					message: 'API returned an empty response',
					context: { model, completion },
					cause: undefined,
				});
			}

			return Ok(responseText);
		},
	};
}

export type CustomCompletionService = ReturnType<
	typeof createCustomCompletionService
>;

export const CustomCompletionServiceLive =
	createCustomCompletionService();
