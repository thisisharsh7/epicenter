import { describe, test } from 'bun:test';

/**
 * CLI End-to-End Tests
 *
 * SKIPPED: These tests require the contract-handler separation migration to be complete.
 *
 * The tests use the OLD pattern where `defineQuery`/`defineMutation` accept `handler`.
 * With the new architecture:
 * - `defineQuery`/`defineMutation` are contract-only (input, output, description)
 * - Handlers are bound via `.withHandlers()` on the workspace contract
 * - The CLI calls handlers on the bound client, not contracts directly
 *
 * Re-enable when `.withHandlers()` is implemented.
 * See: specs/20260101T014845-contract-handler-separation.md
 */
describe.skip('CLI End-to-End Tests (PENDING: contract-handler separation)', () => {
	test('CLI can create a post', () => {});
	test('CLI can query posts', () => {});
	test('CLI handles missing required options', () => {});
	test('CLI properly formats success output', () => {});
});
