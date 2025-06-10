#!/usr/bin/env node

/**
 * Simple SSE Test Script
 * 
 * This script demonstrates how to use the SSE functionality
 * in the MCP Prompts project. It creates a simple SSE server
 * and connects to it as a client.
 * 
 * Usage:
 *   npm run test:sse
 */

import * as http from 'http';
import { hostname } from 'os'; // Note: hostname is imported but not used. Could be removed.
import { ServerConfig, MCPServer, MCPTransport } from '../interfaces.js'; // Assuming MCPServer and MCPTransport might be defined in interfaces.ts
import { enableSseInHttpServer, getSseManager } from '../sse.js';
import EventEmitter from 'node:events'; // For the mock MCP Server

// Simple test for the SSE functionality, updated for SSEServerTransport integration

const port = Number(process.env.PORT || 3333);
const path = process.env.SSE_PATH || '/events';

// Interface for EventSource events since we don't have DOM types
interface EventSourceEvent {
  type: string;
  data: string;
  lastEventId?: string;
  origin?: string;
}

// Create a partial config with just the required properties for our test
const serverConfig: ServerConfig = {
  name: 'sse-test-server',
  version: '1.0.0',
  host: process.env.HOST || '0.0.0.0',
  port,
  enableSSE: true,
  ssePath: path,
  storageType: 'memory',
  promptsDir: './prompts', // Required by ServerConfig
  backupsDir: './backups', // Required by ServerConfig
  logLevel: 'info',       // Required by ServerConfig
  httpServer: true,       // Required by ServerConfig
  // Assuming other ServerConfig fields have defaults or are not strictly needed for this SSE test server
  mcpServerUrl: '',
  mcpServerId: '',
  mcpServerName: '',
  mcpServerVersion: '',
  maxContextLength: 0,
  defaultModel: '',
  defaultMaxTokens: 0,
  sseHeartbeatIntervalMs: 30000,
  sseClientTimeoutMs: 60000,
  sseMessageHistory: 50,
};

// Mock MCP Server
class MockMCPServer extends EventEmitter implements MCPServer {
  private transport: MCPTransport | null = null;
  public connectedTransports: MCPTransport[] = [];

  constructor() {
    super();
  }

  connect(transport: MCPTransport): Promise<void> {
    console.log('[MockMCPServer] Transport connect called.');
    this.transport = transport;
    this.connectedTransports.push(transport);
    // Simulate the transport starting, which might involve the transport
    // itself emitting events or becoming ready.
    if (transport.start) {
      transport.start().then(() => {
        console.log('[MockMCPServer] Transport started.');
      }).catch(err => {
        console.error('[MockMCPServer] Error starting transport:', err);
      });
    }
    return Promise.resolve();
  }

  disconnect(transportType?: string): Promise<void> {
    console.log(`[MockMCPServer] Transport disconnect called (type: ${transportType}).`);
    if (this.transport) {
      if (this.transport.close) {
        this.transport.close().catch(err => console.error('[MockMCPServer] Error closing transport:', err));
      }
      this.transport = null;
      this.connectedTransports = this.connectedTransports.filter(t => t !== this.transport);
    }
    return Promise.resolve();
  }

  // Method to simulate MCP server wanting to send a message
  simulateSendToClients(message: any): void {
    if (this.transport && this.transport.send) {
      console.log('[MockMCPServer] Simulating send to clients via transport.send().');
      this.transport.send(message).catch(err => {
        console.error('[MockMCPServer] Error in transport.send():', err);
      });
    } else {
      console.warn('[MockMCPServer] No active transport or transport.send is not available to simulate send.');
    }
  }

  // Other MCPServer methods (if any are called by the system under test)
  getTransport(type: string): MCPTransport | undefined { return this.connectedTransports.find(t => t.type === type); }
  handleMessage(message: any, transportId?: string): Promise<void> {
    console.log(`[MockMCPServer] handleMessage called with: ${JSON.stringify(message)} from ${transportId}`);
    return Promise.resolve();
  }
  isStarted(): boolean { return true; }
  start(): Promise<void> { return Promise.resolve(); }
  stop(): Promise<void> { return Promise.resolve(); }
}


// Create a simple client to test connection
function createSseClient(url: string, onMessage: (event: EventSourceEvent) => void, onError: (error: Error) => void): any {
  // Polyfill EventSource if needed
  // In Node.js environment, we'll use a simple implementation or a library
  const EventSource = require('eventsource');
  
  // Create the SSE client
  const source = new EventSource(url);
  
  // Set up event listeners
  source.onmessage = (event: EventSourceEvent) => {
    // console.log(`Client received generic message: ${event.data}`);
    onMessage(event);
  };
  
  source.addEventListener('connected', (event: EventSourceEvent) => {
    console.log(`Client received 'connected' event: ${event.data}`);
    onMessage(event);
  });

  source.addEventListener('test', (event: EventSourceEvent) => {
    console.log(`Client received 'test' event: ${event.data}`);
    onMessage(event);
  });
  
  // Error handling
  source.onerror = (error: Error) => {
    // console.error('SSE client error:', error);
    onError(error);
  };
  
  return source; // This is an instance of eventsource
}

// Test server
async function main() {
  console.log(`Starting SSE integration test server on port ${port}...`);

  const httpServer = http.createServer();
  const mockMcpServer = new MockMCPServer();
  
  // Pass the mock MCP server to enableSseInHttpServer
  // SseManager will be initialized and events from SSEServerTransport will be wired up (based on sse.ts)
  const sseManagerInstance = enableSseInHttpServer(serverConfig, httpServer, mockMcpServer);
  
  httpServer.listen(serverConfig.port, serverConfig.host, () => {
    console.log(`Test server listening at http://${serverConfig.host}:${serverConfig.port}`);
    console.log(`SSE endpoint available at http://${serverConfig.host}:${serverConfig.port}${serverConfig.ssePath}`);
    
    let connectedClientSource: any | null = null;
    let testMessageCounter = 0;

    // Send periodic messages via the mock MCP server
    const messageInterval = setInterval(() => {
      const clientCount = sseManagerInstance.clientCount;
      console.log(`[Server] SseManager current client count: ${clientCount}`);
      
      if (clientCount > 0) {
        testMessageCounter++;
        const messagePayload = {
          event: 'test', // SseManager's _writeToClient expects this structure for named events
          data: {
            sequence: testMessageCounter,
            timestamp: new Date().toISOString(),
            message: 'Hello from MockMCP Server via SSEServerTransport and SseManager!',
            activeClients: sseManagerInstance.getClientIds()
          }
        };
        console.log(`[Server] MockMCPServer about to simulate send for message #${testMessageCounter}`);
        mockMcpServer.simulateSendToClients(messagePayload);
      } else {
        // console.log('[Server] No clients connected, skipping broadcast.');
      }
    }, 5000);
    
    // Create a test client if CREATE_TEST_CLIENT is set
    if (process.env.CREATE_TEST_CLIENT) {
      setTimeout(() => {
        console.log('[Server] Creating test client...');
        const clientUrl = `http://localhost:${serverConfig.port}${serverConfig.ssePath}`;
        let receivedMessages = 0;
        let receivedTestEvents = 0;

        connectedClientSource = createSseClient(
          clientUrl,
          (event: EventSourceEvent) => { // onMessage callback
            // console.log(`[Client] Received event via callback: Type: ${event.type}, Data: ${event.data}`);
            receivedMessages++;
            if (event.type === 'test') {
              receivedTestEvents++;
              try {
                const parsedData = JSON.parse(event.data);
                console.log(`[Client] Parsed 'test' event data: Seq ${parsedData.sequence}`);
                if (parsedData.sequence > 2 && connectedClientSource) { // Let a few messages pass
                    console.log(`[Client] Received ${receivedTestEvents} 'test' events. Closing client. Total messages: ${receivedMessages}.`);
                    connectedClientSource.close(); // Close after a few test messages
                    connectedClientSource = null;
                }
              } catch (e) {
                console.error("[Client] Error parsing test event data", e);
              }
            } else if (event.type === 'connected') {
              console.log("[Client] Successfully connected to SSE stream.");
            }
          },
          (error: Error) => { // onError callback
            console.error('[Client] SSE connection error:', error.message);
            // If client cannot connect, stop server to prevent test hanging
            if (error.message.includes('ECONNREFUSED')) {
                console.error("[Client] Connection refused. Stopping test server.");
                clearInterval(messageInterval);
                httpServer.close();
                process.exit(1);
            }
          }
        );
        
        // Monitor client state changes on the server
        // Check client count after a delay to allow for connection
        setTimeout(() => {
          console.log(`[Server] After client connection attempt, SseManager client count: ${sseManagerInstance.clientCount}`);
        }, 2000);

        // Check client count after client is supposed to close
        // This checks if the disconnect is registered by SseManager
        const checkDisconnectInterval = setInterval(() => {
            if (!connectedClientSource) { // client has closed
                // Wait a moment for server-side disconnect logic to fire
                setTimeout(() => {
                    console.log(`[Server] After client disconnection, SseManager client count: ${sseManagerInstance.clientCount}`);
                    if (sseManagerInstance.clientCount === 0) {
                        console.log("[Server] Client successfully disconnected and SseManager updated. Test assumed successful.");
                        clearInterval(messageInterval);
                        clearInterval(checkDisconnectInterval);
                        httpServer.close(() => {
                           console.log("[Server] Test server closed.");
                           process.exit(0); // Exit cleanly
                        });
                    } else {
                        console.warn(`[Server] Client disconnected, but SseManager count is ${sseManagerInstance.clientCount}. Disconnect might not be fully processed.`);
                    }
                }, 1000);
            }
        }, 500);

      }, 1000); // Delay for server to be fully up
    } else {
        console.log("[Server] CREATE_TEST_CLIENT not set. Server will run without an internal test client.");
    }
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[Server] SIGINT received. Shutting down...');
    httpServer.close(() => {
      console.log('[Server] HTTP server closed.');
      process.exit(0);
    });
  });
}

main().catch(error => {
  console.error('Error in SSE test:', error);
  process.exit(1);
}); 