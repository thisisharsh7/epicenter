// HTTP server with REST + MCP endpoints (SSE)
export { createHttpServer, createEpicenterServer } from './http';

// stdio MCP server (standard MCP transport)
export { createStdioServer } from './stdio';

// Legacy workspace server
export { createWorkspaceServer } from './workspace';
