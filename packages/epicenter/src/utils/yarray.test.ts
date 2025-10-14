import { test, expect, describe } from 'bun:test';
import * as Y from 'yjs';
import { syncYArrayToDiff } from './yjs';

describe('syncYArrayToDiff', () => {
	test('handles identical arrays (no changes needed)', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['typescript', 'javascript']);
		syncYArrayToDiff(yarray, ['typescript', 'javascript']);

		expect(yarray.toArray()).toEqual(['typescript', 'javascript']);
	});

	test('handles insertion in the middle', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['typescript', 'javascript']);
		syncYArrayToDiff(yarray, ['typescript', 'svelte', 'javascript']);

		expect(yarray.toArray()).toEqual(['typescript', 'svelte', 'javascript']);
	});

	test('handles deletion in the middle', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['typescript', 'svelte', 'javascript']);
		syncYArrayToDiff(yarray, ['typescript', 'javascript']);

		expect(yarray.toArray()).toEqual(['typescript', 'javascript']);
	});

	test('handles insertion at the beginning', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['typescript', 'javascript']);
		syncYArrayToDiff(yarray, ['svelte', 'typescript', 'javascript']);

		expect(yarray.toArray()).toEqual(['svelte', 'typescript', 'javascript']);
	});

	test('handles insertion at the end', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['typescript', 'javascript']);
		syncYArrayToDiff(yarray, ['typescript', 'javascript', 'svelte']);

		expect(yarray.toArray()).toEqual(['typescript', 'javascript', 'svelte']);
	});

	test('handles deletion at the beginning', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['svelte', 'typescript', 'javascript']);
		syncYArrayToDiff(yarray, ['typescript', 'javascript']);

		expect(yarray.toArray()).toEqual(['typescript', 'javascript']);
	});

	test('handles deletion at the end', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['typescript', 'javascript', 'svelte']);
		syncYArrayToDiff(yarray, ['typescript', 'javascript']);

		expect(yarray.toArray()).toEqual(['typescript', 'javascript']);
	});

	test('handles complete replacement', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['typescript', 'javascript']);
		syncYArrayToDiff(yarray, ['python', 'rust']);

		expect(yarray.toArray()).toEqual(['python', 'rust']);
	});

	test('handles empty array to non-empty array', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		syncYArrayToDiff(yarray, ['typescript', 'javascript']);

		expect(yarray.toArray()).toEqual(['typescript', 'javascript']);
	});

	test('handles non-empty array to empty array', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['typescript', 'javascript']);
		syncYArrayToDiff(yarray, []);

		expect(yarray.toArray()).toEqual([]);
	});

	test('handles multiple insertions and deletions', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['a', 'b', 'c', 'd']);
		syncYArrayToDiff(yarray, ['a', 'x', 'c', 'y', 'z']);

		expect(yarray.toArray()).toEqual(['a', 'x', 'c', 'y', 'z']);
	});

	test('works with numbers', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<number>('numbers');

		yarray.push([1, 2, 3]);
		syncYArrayToDiff(yarray, [1, 4, 2, 3]);

		expect(yarray.toArray()).toEqual([1, 4, 2, 3]);
	});

	test('handles reordering (by replacing)', () => {
		const ydoc = new Y.Doc();
		const yarray = ydoc.getArray<string>('tags');

		yarray.push(['a', 'b', 'c']);
		syncYArrayToDiff(yarray, ['c', 'b', 'a']);

		expect(yarray.toArray()).toEqual(['c', 'b', 'a']);
	});
});
