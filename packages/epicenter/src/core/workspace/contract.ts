import * as Y from 'yjs';

import {
	isActionContract,
	type ActionContracts,
	type MutationContract,
	type QueryContract,
} from '../actions';
import { createTables, type Tables } from '../db/core';
import type { Provider, Providers } from '../provider.shared';
import {
	createWorkspaceValidators,
	type StandardSchemaV1,
	type WorkspaceSchema,
	type WorkspaceValidators,
} from '../schema';
import type { ProviderPaths, WorkspacePaths } from '../types';

export type WorkspaceContractConfig<
	TId extends string = string,
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TActions extends ActionContracts = ActionContracts,
> = {
	id: TId;
	tables: TSchema;
	actions: TActions;
	description?: string;
};

export type WorkspaceContract<
	TId extends string = string,
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TActions extends ActionContracts = ActionContracts,
> = WorkspaceContractConfig<TId, TSchema, TActions> & {
	withProviders<TProviders extends ProviderMap<TSchema>>(
		providers: TProviders,
	): WorkspaceWithProviders<TId, TSchema, TActions, TProviders>;

	withHandlers(
		handlers: HandlersForContracts<TActions, TSchema, Record<string, never>>,
	): WorkspaceWithHandlers<TId, TSchema, TActions, Record<string, never>>;
};

export type ProviderMap<TSchema extends WorkspaceSchema = WorkspaceSchema> =
	Record<string, Provider<TSchema>>;

export type InferProviderExports<TProviders> = {
	[K in keyof TProviders]: TProviders[K] extends Provider<
		WorkspaceSchema,
		infer TExports
	>
		? TExports extends Providers
			? TExports
			: Record<string, never>
		: Record<string, never>;
};

export type WorkspaceWithProviders<
	TId extends string,
	TSchema extends WorkspaceSchema,
	TActions extends ActionContracts,
	TProviders extends ProviderMap<TSchema>,
> = WorkspaceContractConfig<TId, TSchema, TActions> & {
	$providers: TProviders;

	withHandlers(
		handlers: HandlersForContracts<
			TActions,
			TSchema,
			InferProviderExports<TProviders>
		>,
	): WorkspaceWithHandlers<TId, TSchema, TActions, TProviders>;

	createHttpClient(
		url: string,
	): Promise<BoundWorkspaceClient<TActions, TSchema, TProviders>>;
};

export type HandlerContext<
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TProviderExports extends Record<string, Providers> = Record<
		string,
		Providers
	>,
> = {
	tables: Tables<TSchema>;
	schema: TSchema;
	validators: WorkspaceValidators<TSchema>;
	providers: TProviderExports;
	paths: WorkspacePaths | undefined;
};

export type HandlerFn<
	TInput,
	TOutput,
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TProviderExports extends Record<string, Providers> = Record<
		string,
		Providers
	>,
> = (
	input: TInput,
	ctx: HandlerContext<TSchema, TProviderExports>,
) => TOutput | Promise<TOutput>;

type InferInput<TInput> = TInput extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TInput>
	: undefined;

type InferOutput<TOutput> = TOutput extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TOutput>
	: never;

export type HandlersForContracts<
	TActions extends ActionContracts,
	TSchema extends WorkspaceSchema,
	TProviderExports extends Record<string, Providers>,
> = {
	[K in keyof TActions]: TActions[K] extends QueryContract<
		infer TInput,
		infer TOutput
	>
		? HandlerFn<
				InferInput<TInput>,
				InferOutput<TOutput>,
				TSchema,
				TProviderExports
			>
		: TActions[K] extends MutationContract<infer TInput, infer TOutput>
			? HandlerFn<
					InferInput<TInput>,
					InferOutput<TOutput>,
					TSchema,
					TProviderExports
				>
			: TActions[K] extends ActionContracts
				? HandlersForContracts<TActions[K], TSchema, TProviderExports>
				: never;
};

export type WorkspaceWithHandlers<
	TId extends string,
	TSchema extends WorkspaceSchema,
	TActions extends ActionContracts,
	TProviders extends ProviderMap<TSchema>,
> = WorkspaceContractConfig<TId, TSchema, TActions> & {
	$providers: TProviders;
	$handlers: HandlersForContracts<
		TActions,
		TSchema,
		InferProviderExports<TProviders>
	>;

	createWithHandlers(
		options?: CreateOptions,
	): Promise<BoundWorkspaceClient<TActions, TSchema, TProviders>>;
	createHttpClient(
		url: string,
		options?: CreateOptions,
	): Promise<BoundWorkspaceClient<TActions, TSchema, TProviders>>;
};

export type CreateOptions = {
	projectDir?: string;
};

export type BoundAction<TInput, TOutput> = TInput extends undefined
	? () => Promise<TOutput>
	: (input: TInput) => Promise<TOutput>;

export type BoundActions<TActions extends ActionContracts> = {
	[K in keyof TActions]: TActions[K] extends QueryContract<
		infer TInput,
		infer TOutput
	>
		? BoundAction<InferInput<TInput>, InferOutput<TOutput>>
		: TActions[K] extends MutationContract<infer TInput, infer TOutput>
			? BoundAction<InferInput<TInput>, InferOutput<TOutput>>
			: TActions[K] extends ActionContracts
				? BoundActions<TActions[K]>
				: never;
};

export type BoundWorkspaceClient<
	TActions extends ActionContracts,
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TProviders extends ProviderMap<TSchema> = ProviderMap<TSchema>,
> = BoundActions<TActions> & {
	$tables: Tables<TSchema>;
	$providers: InferProviderExports<TProviders>;
	$validators: WorkspaceValidators<TSchema>;
	$paths: WorkspacePaths | undefined;
	destroy(): Promise<void>;
	[Symbol.asyncDispose](): Promise<void>;
};

type InitializedWorkspace<
	TSchema extends WorkspaceSchema,
	TProviders extends ProviderMap<TSchema>,
> = {
	ydoc: Y.Doc;
	tables: Tables<TSchema>;
	validators: WorkspaceValidators<TSchema>;
	providerExports: InferProviderExports<TProviders>;
	paths: WorkspacePaths | undefined;
	cleanup: () => Promise<void>;
};

async function initializeWorkspace<
	TId extends string,
	TSchema extends WorkspaceSchema,
	TProviders extends ProviderMap<TSchema>,
>(
	config: WorkspaceContractConfig<TId, TSchema, ActionContracts>,
	providerFactories: TProviders,
	options?: CreateOptions,
): Promise<InitializedWorkspace<TSchema, TProviders>> {
	const projectDir =
		options?.projectDir ??
		(typeof process !== 'undefined' ? process.cwd() : undefined);

	const ydoc = new Y.Doc({ guid: config.id });
	const tables = createTables(ydoc, config.tables);
	const validators = createWorkspaceValidators(config.tables);

	let buildProviderPaths:
		| ((projectDir: string, providerId: string) => ProviderPaths)
		| undefined;
	let getEpicenterDir: ((projectDir: string) => string) | undefined;

	if (projectDir) {
		const pathsModule = await import('../paths');
		buildProviderPaths = (dir, id) =>
			pathsModule.buildProviderPaths(dir as WorkspacePaths['project'], id);
		getEpicenterDir = (dir) =>
			pathsModule.getEpicenterDir(dir as WorkspacePaths['project']);
	}

	const providerExports = Object.fromEntries(
		await Promise.all(
			Object.entries(providerFactories).map(
				async ([providerId, providerFn]) => {
					const paths: ProviderPaths | undefined =
						projectDir && buildProviderPaths
							? buildProviderPaths(projectDir, providerId)
							: undefined;

					const result = await providerFn({
						id: config.id,
						providerId,
						ydoc,
						schema: config.tables,
						tables,
						paths,
					});
					return [providerId, result ?? {}];
				},
			),
		),
	) as InferProviderExports<TProviders>;

	const workspacePaths: WorkspacePaths | undefined =
		projectDir && getEpicenterDir
			? {
					project: projectDir as WorkspacePaths['project'],
					epicenter: getEpicenterDir(projectDir) as WorkspacePaths['epicenter'],
				}
			: undefined;

	const cleanup = async () => {
		await Promise.all(
			Object.values(providerExports).map((provider) =>
				(provider as Providers).destroy?.(),
			),
		);
		ydoc.destroy();
	};

	return {
		ydoc,
		tables,
		validators,
		providerExports,
		paths: workspacePaths,
		cleanup,
	};
}

function bindActionsWithHandlers<
	TActions extends ActionContracts,
	TSchema extends WorkspaceSchema,
	TProviderExports extends Record<string, Providers>,
>(
	contracts: TActions,
	handlers: HandlersForContracts<TActions, TSchema, TProviderExports>,
	ctx: HandlerContext<TSchema, TProviderExports>,
): BoundActions<TActions> {
	const bound: Record<string, unknown> = {};

	for (const [key, contractOrNamespace] of Object.entries(contracts)) {
		const handlerOrNamespace = (handlers as Record<string, unknown>)[key];

		if (isActionContract(contractOrNamespace)) {
			const handler = handlerOrNamespace as (
				input: unknown,
				ctx: HandlerContext<TSchema, TProviderExports>,
			) => unknown | Promise<unknown>;

			bound[key] = async (input: unknown) => handler(input, ctx);
		} else {
			bound[key] = bindActionsWithHandlers(
				contractOrNamespace as ActionContracts,
				handlerOrNamespace as HandlersForContracts<
					ActionContracts,
					TSchema,
					TProviderExports
				>,
				ctx,
			);
		}
	}

	return bound as BoundActions<TActions>;
}

function bindActionsWithHttp<TActions extends ActionContracts>(
	contracts: TActions,
	baseUrl: string,
	workspaceId: string,
	path: string[] = [],
): BoundActions<TActions> {
	const bound: Record<string, unknown> = {};

	for (const [key, contractOrNamespace] of Object.entries(contracts)) {
		const actionPath = [...path, key];

		if (isActionContract(contractOrNamespace)) {
			const contract = contractOrNamespace;
			const endpoint = `${baseUrl}/workspaces/${workspaceId}/actions/${actionPath.join('/')}`;

			bound[key] = async (input: unknown) => {
				const method = contract.type === 'query' ? 'GET' : 'POST';

				if (method === 'GET') {
					const params = input
						? new URLSearchParams(input as Record<string, string>).toString()
						: '';
					const url = params ? `${endpoint}?${params}` : endpoint;
					const response = await fetch(url);
					return response.json();
				}

				const response = await fetch(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(input),
				});
				return response.json();
			};
		} else {
			bound[key] = bindActionsWithHttp(
				contractOrNamespace as ActionContracts,
				baseUrl,
				workspaceId,
				actionPath,
			);
		}
	}

	return bound as BoundActions<TActions>;
}

export function defineWorkspace<
	const TId extends string,
	TSchema extends WorkspaceSchema,
	TActions extends ActionContracts,
>(
	config: WorkspaceContractConfig<TId, TSchema, TActions>,
): WorkspaceContract<TId, TSchema, TActions> {
	if (!config.id || typeof config.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	return {
		...config,

		withProviders<TProviders extends ProviderMap<TSchema>>(
			providers: TProviders,
		): WorkspaceWithProviders<TId, TSchema, TActions, TProviders> {
			return {
				...config,
				$providers: providers,

				withHandlers(
					handlers: HandlersForContracts<
						TActions,
						TSchema,
						InferProviderExports<TProviders>
					>,
				): WorkspaceWithHandlers<TId, TSchema, TActions, TProviders> {
					return {
						...config,
						$providers: providers,
						$handlers: handlers,

						async createWithHandlers(
							options?: CreateOptions,
						): Promise<BoundWorkspaceClient<TActions, TSchema, TProviders>> {
							const { tables, validators, providerExports, paths, cleanup } =
								await initializeWorkspace(config, providers, options);

							const handlerContext: HandlerContext<
								TSchema,
								InferProviderExports<TProviders>
							> = {
								tables,
								schema: config.tables,
								validators,
								providers: providerExports,
								paths,
							};

							const boundActions = bindActionsWithHandlers(
								config.actions,
								handlers,
								handlerContext,
							);

							return {
								...boundActions,
								$tables: tables,
								$providers: providerExports,
								$validators: validators,
								$paths: paths,
								destroy: cleanup,
								[Symbol.asyncDispose]: cleanup,
							};
						},

						async createHttpClient(
							url: string,
							options?: CreateOptions,
						): Promise<BoundWorkspaceClient<TActions, TSchema, TProviders>> {
							const { tables, validators, providerExports, paths, cleanup } =
								await initializeWorkspace(config, providers, options);

							const boundActions = bindActionsWithHttp(
								config.actions,
								url,
								config.id,
							);

							return {
								...boundActions,
								$tables: tables,
								$providers: providerExports,
								$validators: validators,
								$paths: paths,
								destroy: cleanup,
								[Symbol.asyncDispose]: cleanup,
							};
						},
					};
				},

				async createHttpClient(
					url: string,
				): Promise<BoundWorkspaceClient<TActions, TSchema, TProviders>> {
					const { tables, validators, providerExports, paths, cleanup } =
						await initializeWorkspace(config, providers);

					const boundActions = bindActionsWithHttp(
						config.actions,
						url,
						config.id,
					);

					return {
						...boundActions,
						$tables: tables,
						$providers: providerExports,
						$validators: validators,
						$paths: paths,
						destroy: cleanup,
						[Symbol.asyncDispose]: cleanup,
					};
				},
			};
		},

		withHandlers(
			handlers: HandlersForContracts<TActions, TSchema, Record<string, never>>,
		): WorkspaceWithHandlers<TId, TSchema, TActions, Record<string, never>> {
			const emptyProviders = {} as Record<string, never>;
			return this.withProviders(emptyProviders).withHandlers(
				handlers as HandlersForContracts<
					TActions,
					TSchema,
					InferProviderExports<Record<string, never>>
				>,
			);
		},
	};
}
