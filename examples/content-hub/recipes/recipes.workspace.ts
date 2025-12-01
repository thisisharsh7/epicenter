import {
	date,
	DateWithTimezone,
	defineMutation,
	defineWorkspace,
	generateId,
	id,
	integer,
	markdownIndex,
	select,
	sqliteIndex,
	text,
	withBodyField,
} from '@epicenter/hq';
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
					recipes: withBodyField('instructions'),
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
