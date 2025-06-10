// Assuming McpServer is the correct type.
// The path '@modelcontextprotocol/sdk/server/mcp.js' should resolve correctly
// if @modelcontextprotocol/sdk is installed in custom-mcp/node_modules.

// We need to import the actual class/type being used.
// Based on custom-server.js: import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// And then it's instantiated: const server = new McpServer({ name: CONFIG.name, version: CONFIG.version });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Declare the module path as it's used in the import statement in the test.
// The test uses 'custom-mcp/custom-server.js'.
// However, this .d.ts file is *alongside* custom-server.js, so it describes that module.
// TypeScript's module resolution should pick this up.

import { CallToolResult, RequestHandlerExtra } from "@modelcontextprotocol/sdk/types.js"; // Assuming types.js is the public export path

// Define a basic structure for a Prompt object based on its usage in custom-server.js
interface PromptVariable {
  name: string;
  description?: string;
  required?: boolean;
}

interface PromptObject {
  id: string;
  name: string;
  content: string;
  description: string;
  tags: string[];
  isTemplate: boolean;
  variables: PromptVariable[];
  createdAt: string;
  updatedAt: string;
}

export const server: McpServer;
export const listPromptsCallback: (params: any, extra?: RequestHandlerExtra) => Promise<CallToolResult>;
export const memoryPrompts: Record<string, PromptObject>;
