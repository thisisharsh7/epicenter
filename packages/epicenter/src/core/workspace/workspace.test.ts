/**
 * Tests for defineWorkspace and createClient.
 */

import { describe, expect, test } from 'bun:test';
import { boolean, id, table, text } from '../schema/fields/factories';
import { defineWorkspace } from './workspace';

describe('defineWorkspace', () => {
	test('produces normalized WorkspaceDefinition', () => {
		const definition = defineWorkspace({
			id: 'epicenter.blog',
			tables: {
				posts: table({
					name: 'Posts',
					description: 'Blog posts',
					icon: '📝',
					fields: { id: id(), title: text() },
				}),
			},
			kv: {},
		});

		expect(definition.id).toBe('epicenter.blog');
		expect(definition.name).toBe('Epicenter.blog');
		expect(definition.tables.posts.name).toBe('Posts');
		expect(definition.tables.posts.description).toBe('Blog posts');
		expect(definition.tables.posts.icon).toEqual({
			type: 'emoji',
			value: '📝',
		});
	});

	test('handles IconDefinition format', () => {
		const definition = defineWorkspace({
			id: 'test',
			tables: {
				posts: table({
					name: 'Posts',
					description: '',
					icon: { type: 'external', url: 'https://example.com/icon.png' },
					fields: { id: id(), title: text() },
				}),
			},
			kv: {},
		});

		expect(definition.tables.posts.icon).toEqual({
			type: 'external',
			url: 'https://example.com/icon.png',
		});
	});

	test('handles omitted icon (normalized to null)', () => {
		const definition = defineWorkspace({
			id: 'test',
			tables: {
				posts: table({
					name: 'Posts',
					description: 'Blog posts',
					fields: { id: id(), title: text() },
				}),
			},
			kv: {},
		});

		expect(definition.tables.posts.icon).toBeNull();
	});

	test('handles null icon', () => {
		const definition = defineWorkspace({
			id: 'test',
			tables: {
				posts: table({
					name: 'Posts',
					description: '',
					icon: null,
					fields: { id: id(), title: text() },
				}),
			},
			kv: {},
		});

		expect(definition.tables.posts.icon).toBeNull();
	});

	test('JSON round-trip preserves all data', () => {
		const definition = defineWorkspace({
			id: 'epicenter.blog',
			tables: {
				posts: table({
					name: 'Posts',
					description: 'Blog posts',
					icon: '📝',
					fields: {
						id: id(),
						title: text(),
						published: boolean({ default: false }),
					},
				}),
			},
			kv: {},
		});

		const roundTrip = JSON.parse(JSON.stringify(definition));
		expect(roundTrip).toEqual(definition);
	});

	test('multiple tables with different icons', () => {
		const definition = defineWorkspace({
			id: 'test',
			tables: {
				posts: table({
					name: 'Posts',
					description: 'Blog posts',
					icon: '📝',
					fields: { id: id(), title: text() },
				}),
				users: table({
					name: 'Users',
					description: 'User accounts',
					icon: '👤',
					fields: { id: id(), name: text() },
				}),
				settings: table({
					name: 'Settings',
					description: 'App settings',
					// No icon - should be null
					fields: { id: id(), key: text() },
				}),
			},
			kv: {},
		});

		expect(definition.tables.posts.icon).toEqual({
			type: 'emoji',
			value: '📝',
		});
		expect(definition.tables.users.icon).toEqual({
			type: 'emoji',
			value: '👤',
		});
		expect(definition.tables.settings.icon).toBeNull();
	});

	test('throws on missing id', () => {
		expect(() => {
			// @ts-expect-error - testing runtime validation
			defineWorkspace({
				tables: {},
				kv: {},
			});
		}).toThrow('Workspace must have a valid ID');
	});

	test('throws on empty string id', () => {
		expect(() => {
			defineWorkspace({
				id: '',
				tables: {},
				kv: {},
			});
		}).toThrow('Workspace must have a valid ID');
	});
});
