import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	defineWorkspace,
	id,
	text,
	select,
	generateId,
	sqliteIndex,
	defineQuery,
	defineMutation,
	eq,
	type ValidatedRow,
} from '../../src/index';

/**
 * Users workspace (Foundation)
 * No dependencies - serves as base for other workspaces
 *
 * This workspace demonstrates:
 * - Basic workspace structure without dependencies
 * - Foundation that other workspaces will depend on
 */
export const users = defineWorkspace({
	id: 'users',
	version: 1,
	name: 'users',

	schema: {
		users: {
			id: id(),
			name: text(),
			email: text(),
			role: select({ options: ['admin', 'author', 'reader'] }),
		},
	},

	indexes: async ({ db }) => ({
		sqlite: await sqliteIndex(db, { database: '.data/users.db' }),
	}),

	actions: ({ db, indexes }) => ({
		// Query: Get all users
		getAllUsers: defineQuery({
			handler: async () => {
				const users = await indexes.sqlite.db.select().from(indexes.sqlite.users);
				return Ok(users);
			},
		}),

		// Query: Get user by ID
		getUser: defineQuery({
			input: Type.Object({
				id: Type.String(),
			}),
			handler: async ({ id }) => {
				const user = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.users)
					.where(eq(indexes.sqlite.users.id, id));
				return Ok(user);
			},
		}),

		// Query: Get users by role
		getUsersByRole: defineQuery({
			input: Type.Object({
				role: Type.Union([
					Type.Literal('admin'),
					Type.Literal('author'),
					Type.Literal('reader'),
				]),
			}),
			handler: async ({ role }) => {
				const users = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.users)
					.where(eq(indexes.sqlite.users.role, role));
				return Ok(users);
			},
		}),

		// Mutation: Create a user
		createUser: defineMutation({
			input: Type.Object({
				name: Type.String(),
				email: Type.String(),
				role: Type.Union([
					Type.Literal('admin'),
					Type.Literal('author'),
					Type.Literal('reader'),
				]),
			}),
			handler: async ({ name, email, role }) => {
				const user = {
					id: generateId(),
					name,
					email,
					role,
				} satisfies ValidatedRow<typeof db.schema.users>;
				db.tables.users.insert(user);
				return Ok(user);
			},
		}),
	}),
});
