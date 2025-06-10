// Import the specific callback, the server instance, and memoryPrompts
import {
  listPromptsCallback,
  server as mcpServerInstance, // To ensure custom-server.js runs and initializes its scope
  memoryPrompts
} from 'custom-mcp/custom-server.js';

// Import types
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // RequestHandlerExtra was incorrectly also imported here
import { RequestHandlerExtra as ProtocolRequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'; // Corrected path from previous step

// Define PromptObject and PromptVariable interfaces locally in the test for clarity,
// or import them if they were exported from the .d.ts (they are not directly exported, but part of memoryPrompts type)
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

describe('list_prompts tool callback', () => {
  // Mock RequestHandlerExtra. The actual listPromptsCallback doesn't use it,
  // but we need to provide a type-correct object.
  const mockExtra: ProtocolRequestHandlerExtra = { // Use the correctly imported type
    signal: new AbortController().signal, // Provide a real AbortSignal
  };

  // Helper function to clear memoryPrompts for test isolation
  const clearMemoryPrompts = () => {
    for (const key in memoryPrompts) {
      delete memoryPrompts[key];
    }
  };

  beforeEach(() => {
    // Clear memoryPrompts before each test to ensure a clean state
    clearMemoryPrompts();
    // Ensure mcpServerInstance is initialized (happens on import, but good to acknowledge)
    expect(mcpServerInstance).toBeDefined();
  });

  it('should return an empty list of prompts when memoryPrompts is empty', async () => {
    const mockParams = {}; // Parameters are not used by current listPromptsCallback logic

    const result: CallToolResult = await listPromptsCallback(mockParams, mockExtra);

    expect(result).toEqual({
      type: "object",
      object: {
        prompts: [],
      },
    });
  });

  it('should return prompts from memoryPrompts when it is populated', async () => {
    const samplePrompt: PromptObject = {
      id: 'test-prompt-1',
      name: 'Test Prompt 1',
      content: 'This is a test prompt.',
      description: 'A simple prompt for testing.',
      tags: ['test', 'sample'],
      isTemplate: false,
      variables: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Populate memoryPrompts directly
    memoryPrompts[samplePrompt.id] = samplePrompt;

    const mockParams = {}; // Parameters are not used by current listPromptsCallback logic
    const result: CallToolResult = await listPromptsCallback(mockParams, mockExtra);

    expect(result).toEqual({
      type: "object",
      object: {
        prompts: [samplePrompt], // Expect the callback to return the prompt we added
      },
    });
  });
});
