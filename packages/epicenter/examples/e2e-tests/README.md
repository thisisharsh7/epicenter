# Epicenter E2E Tests

End-to-end test suite for Epicenter that serves as both comprehensive examples and automated testing.

## Structure

- `epicenter.config.ts` - Full-featured blog workspace demonstrating all Epicenter capabilities
- `server.test.ts` - Tests for REST endpoints and MCP protocol
- `cli.test.ts` - Tests for CLI generation and configuration
- `.data/` - Test fixtures and SQLite database

## Running Tests

```bash
# Run all tests
bun test

# Run specific test files
bun test server.test.ts
bun test cli.test.ts
```

## What's Tested

### Server Tests
- REST endpoint creation and routing
- POST and GET request handling
- MCP protocol tool listing and invocation
- CRUD operations (create, read via mutations)

### CLI Tests
- CLI generation from config
- Schema converter integration
- Argument parsing

## Features Demonstrated

This example workspace showcases:
- Multiple schema types (text, integer, select, boolean)
- Both queries and mutations
- Multiple indexes (SQLite and Markdown)
- Relationships between entities (posts and comments)
- Input validation with Zod
- Action descriptions for MCP tools
