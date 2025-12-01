import path from 'node:path';
import {
	DateWithTimezone,
	date,
	defineMutation,
	defineWorkspace,
	generateId,
	id,
	integer,
	markdownIndex,
	select,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { MarkdownIndexErr } from '@epicenter/hq/indexes/markdown';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { QUALITY_OPTIONS } from '../shared/quality';

/**
 * Recipes workspace
 *
 * Manages recipes with ingredients, instructions, and ratings.
 * Supports both URL-sourced recipes and manually entered ones.
 */
export const recipes = defineWorkspace({
	id: 'recipes',
	schema: {
		recipes: {
			id: id(),
			title: text(),
			description: text({ nullable: true }),
			source: text(), // URL or reference (e.g., "Grandma's cookbook")
			servings: integer({ nullable: true }),
			prep_time: text({ nullable: true }), // e.g., "20 min", "1 hour"
			cook_time: text({ nullable: true }), // e.g., "30 min", "overnight"
			ingredients: text(), // markdown list
			instructions: text(), // markdown steps
			rating: select({ options: QUALITY_OPTIONS, nullable: true }),
			notes: text({ nullable: true }), // personal notes, modifications
			added_at: date(),
		},
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (c) =>
			markdownIndex(c, {
				tableConfigs: {
					/**
					 * Custom markdown config for recipes
					 *
					 * Serializes ingredients and instructions into the markdown body with sections:
					 * ```markdown
					 * ## Ingredients
					 * - item 1
					 * - item 2
					 *
					 * ## Instructions
					 * 1. step 1
					 * 2. step 2
					 * ```
					 *
					 * Deserializes by parsing these sections back into separate fields.
					 */
					recipes: {
						serialize: ({ row }) => {
							const { id: rowId, ingredients, instructions, ...rest } = row;

							// Build body with markdown sections
							const body = `## Ingredients

${ingredients}

## Instructions

${instructions}`;

							// Strip null values from frontmatter
							const frontmatter = Object.fromEntries(
								Object.entries(rest).filter(([_, value]) => value !== null),
							);

							return {
								frontmatter,
								body,
								filename: `${rowId}.md`,
							};
						},

						deserialize: ({ frontmatter, body, filename, table }) => {
							const rowId = path.basename(filename, '.md');

							// Parse sections from body
							const ingredientsMatch = body.match(
								/## Ingredients\s*\n([\s\S]*?)(?=\n## Instructions|$)/,
							);
							const instructionsMatch = body.match(
								/## Instructions\s*\n([\s\S]*?)$/,
							);

							if (!ingredientsMatch || !instructionsMatch) {
								return MarkdownIndexErr({
									message: `Recipe ${rowId} missing required sections`,
									context: {
										fileName: filename,
										id: rowId,
										reason:
											'Body must contain "## Ingredients" and "## Instructions" sections',
									},
								});
							}

							const ingredients = ingredientsMatch[1].trim();
							const instructions = instructionsMatch[1].trim();

							// Validate frontmatter (omit id, ingredients, instructions)
							const FrontMatter = table.validators
								.toArktype()
								.omit('id', 'ingredients', 'instructions');

							const parsed = FrontMatter(frontmatter);

							if (parsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for recipe ${rowId}`,
									context: {
										fileName: filename,
										id: rowId,
										reason: parsed.summary,
									},
								});
							}

							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							return Ok({
								id: rowId,
								ingredients,
								instructions,
								...parsed,
							});
						},
					},
				},
			}),
	},

	providers: [setupPersistence],

	exports: ({ db, indexes }) => ({
		...db,
		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,

		/**
		 * Add a new recipe
		 */
		addRecipe: defineMutation({
			input: type({
				title: 'string',
				'description?': 'string',
				source: 'string',
				'servings?': 'number',
				'prep_time?': 'string',
				'cook_time?': 'string',
				ingredients: 'string',
				instructions: 'string',
				'rating?': type.enumerated(...QUALITY_OPTIONS),
				'notes?': 'string',
			}),
			handler: ({
				title,
				description,
				source,
				servings,
				prep_time,
				cook_time,
				ingredients,
				instructions,
				rating,
				notes,
			}) => {
				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				const recipe_id = generateId();

				db.recipes.insert({
					id: recipe_id,
					title,
					description: description ?? null,
					source,
					servings: servings ?? null,
					prep_time: prep_time ?? null,
					cook_time: cook_time ?? null,
					ingredients,
					instructions,
					rating: rating ?? null,
					notes: notes ?? null,
					added_at: now,
				});

				return Ok({ recipe_id });
			},
		}),

		/**
		 * Update a recipe's rating
		 */
		updateRating: defineMutation({
			input: type({
				recipe_id: 'string',
				rating: type.enumerated(...QUALITY_OPTIONS).or('null'),
			}),
			handler: ({ recipe_id, rating }) => {
				const recipe = db.recipes.get(recipe_id);
				if (!recipe) {
					return Ok({ found: false });
				}

				db.recipes.update({
					id: recipe_id,
					rating: rating,
				});

				return Ok({ found: true });
			},
		}),
	}),
});
