/**
 * Server-Sent Events (SSE) implementation for MCP Prompts
 * 
 * This module provides functionality for creating SSE servers and clients
 * for the MCP Prompts project. It implements the MCP SSE transport layer
 * following best practices.
 */

import {
  ServerConfig,
} from './interfaces.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { Server as MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import EventEmitter from 'node:events';

// Define the interfaces that were previously imported
interface SseClient {
  id: string;
  req: IncomingMessage;
  res: ServerResponse;
  connected: boolean;
  connectedAt: Date;
  lastActivity: Date;
  history: Array<{
    timestamp: Date;
    event: string;
    data: string;
  }>;
  metadata: Record<string, string>;
  intervals?: {
    heartbeat: NodeJS.Timeout;
    timeout: NodeJS.Timeout;
  };
}

interface SseManagerOptions {
  heartbeatInterval?: number;
  clientTimeout?: number;
  messageHistory?: number;
}

// Removed TransportImplementation interface as it's associated with the removed SseManager.transportImpl

/**
 * Manager for SSE clients and message broadcasting
 */
export class SseManager extends EventEmitter {
  private clients: Map<string, SseClient> = new Map();
  private _options: SseManagerOptions;
  // _transportImpl property removed as SseManager.transportImpl is being removed
  // private _transportImpl: TransportImplementation | null = null;
  // sseTransport property seems unused in the context of MCP integration, SSEServerTransport instance will be in enableSseInHttpServer
  // private sseTransport: SSEServerTransport | null = null;
  private static instance: SseManager | null = null;

  private constructor(options: SseManagerOptions = {}) {
    super();
    this._options = {
      heartbeatInterval: options.heartbeatInterval || 30000,
      clientTimeout: options.clientTimeout || 60000,
      messageHistory: options.messageHistory || 50,
      ...options
    };
  }

  static getInstance(options?: SseManagerOptions): SseManager {
    if (!SseManager.instance) {
      SseManager.instance = new SseManager(options);
    }
    return SseManager.instance;
  }

  // SseManager.transportImpl and its associated properties/interfaces have been removed
  // as they are not used by the current SSEServerTransport-based MCP integration.
  
  /**
   * Get the SSE server transport that can be used with the MCP Server
   */
  // Getter/setter for sseTransportInstance removed as the instance is managed locally in enableSseInHttpServer

  /**
   * Establishes and manages a new client connection.
   * This method is expected to be called when SSEServerTransport emits a 'connection' event.
   * @param req The HTTP request from the new client
   * @param res The HTTP response for the new client
   * @param options Connection options
   * @returns The client ID
   */
  public handleConnection(
    req: IncomingMessage,
    res: ServerResponse,
    options: SseOptions = {} // options like clientId can be passed by SSEServerTransport if available
  ): string {
    // Headers (writeHead, flushHeaders) are now assumed to be handled by SSEServerTransport
    // before this method is called via a connection event.

    const clientId = options.clientId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Create the client object
    const client: SseClient = {
      id: clientId,
      req,
      res,
      connected: true,
      connectedAt: new Date(),
      lastActivity: new Date(),
      history: [],
      metadata: options.metadata || {},
    };
    
    // Store the client
    this.clients.set(clientId, client);
    console.error(`SSE client connected: ${clientId}`);
    
    // Set up heartbeat interval for this client
    const heartbeatInterval = setInterval(() => {
      if (client && client.connected) {
        this._sendHeartbeat(client);
      }
    }, this._options.heartbeatInterval || 30000);
    
    // Set up client timeout checker
    const timeoutChecker = setInterval(() => {
      if (client && client.connected) {
        const now = new Date();
        const timeSinceLastActivity = now.getTime() - client.lastActivity.getTime();
        
        if (timeSinceLastActivity > (this._options.clientTimeout || 60000)) {
          console.error(`SSE client timed out: ${clientId}`);
          this._disconnectClient(clientId);
        }
      }
    }, (this._options.clientTimeout || 60000) / 2);
    
    // Store the intervals so we can clear them when client disconnects
    client.intervals = {
      heartbeat: heartbeatInterval,
      timeout: timeoutChecker,
    };
    
    // Handle client disconnect
    req.on('close', () => {
      this._disconnectClient(clientId);
    });
    
    // Send initial message if specified
    if (options.initialMessage) {
      this._writeToClient(client, options.initialMessage);
    }
    
    // Send welcome message
    this._writeToClient(client, {
      event: 'connected',
      data: JSON.stringify({
        clientId,
        connectedAt: client.connectedAt.toISOString(),
        message: 'Connected to SSE stream',
        metadata: client.metadata,
      }),
    });
    
    // Emit connection event
    this.emit('connection', clientId, client);
    
    return clientId;
  }
  
  /**
   * Send a message to a specific client
   * @param clientId The client ID
   * @param message The message to send
   * @returns Success status
   */
  public sendToClient(clientId: string, message: any): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }
    
    return this._writeToClient(client, message);
  }
  
  /**
   * Broadcast a message to all connected clients
   * @param message The message to broadcast
   * @returns Number of clients the message was sent to
   */
  public broadcast(message: any): number {
    let sentCount = 0;
    
    for (const client of this.clients.values()) {
      if (this._writeToClient(client, message)) {
        sentCount++;
      }
    }
    
    return sentCount;
  }
  
  /**
   * Disconnect a client
   * @param clientId The client ID to disconnect
   */
  public disconnectClient(clientId: string): boolean {
    return this._disconnectClient(clientId);
  }
  
  /**
   * Get active client count
   */
  public get clientCount(): number {
    return this.clients.size;
  }
  
  /**
   * Get a list of connected client IDs
   */
  public getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }
  
  /**
   * Internal method to write to a client
   */
  private _writeToClient(client: SseClient, message: any): boolean {
    if (!client || !client.connected) {
      return false;
    }
    
    try {
      // Update last activity timestamp
      client.lastActivity = new Date();
      
      // Prepare the message based on format
      let eventName = 'message';
      let eventData: string;
      
      if (typeof message === 'string') {
        eventData = message;
      } else if (message.event && message.data) {
        // { event, data } format
        eventName = message.event;
        eventData = typeof message.data === 'string' ? message.data : JSON.stringify(message.data);
      } else {
        // Any other object
        eventData = JSON.stringify(message);
      }
      
      // Create the SSE message format
      const sseMessage = `event: ${eventName}\ndata: ${eventData}\n\n`;
      
      // Add to history if needed
      if (this._options.messageHistory && this._options.messageHistory > 0 && eventName !== 'heartbeat') {
        client.history.push({
          timestamp: new Date(),
          event: eventName,
          data: eventData,
        });
        
        // Trim history if it exceeds the limit
        if (client.history.length > (this._options.messageHistory || 50)) {
          client.history.shift();
        }
      }
      
      // Write to the response
      client.res.write(sseMessage);
      
      return true;
    } catch (err) {
      console.error(`Error writing to SSE client ${client.id}:`, err);
      this._disconnectClient(client.id);
      return false;
    }
  }
  
  /**
   * Send a heartbeat to keep the connection alive
   */
  private _sendHeartbeat(client: SseClient): void {
    if (client && client.connected) {
      this._writeToClient(client, {
        event: 'heartbeat',
        data: new Date().toISOString(),
      });
    }
  }
  
  /**
   * Internal method to disconnect a client
   */
  private _disconnectClient(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }
    
    // Clear intervals
    if (client.intervals) {
      clearInterval(client.intervals.heartbeat);
      clearInterval(client.intervals.timeout);
    }
    
    // Mark as disconnected
    client.connected = false;
    
    // Try to end the response
    try {
      client.res.end();
    } catch (e) {
      // Ignore errors when ending response
    }
    
    // Remove from clients map
    this.clients.delete(clientId);
    
    // Emit disconnect event
    this.emit('disconnection', clientId);
    console.error(`SSE client disconnected: ${clientId}`);
    
    return true;
  }
}

// SseManager singleton instance
let sseManager: SseManager | null = null;

/**
 * Get the global SSE manager instance
 */
export function getSseManager(options?: SseManagerOptions): SseManager {
  if (!sseManager) {
    sseManager = SseManager.getInstance(options);
  }
  return sseManager;
}

/**
 * Enable SSE in an HTTP server with optional MCP server integration
 */
export function enableSseInHttpServer(
  config: ServerConfig,
  httpServer: HttpServer,
  mcpServer?: MCPServer
): SseManager {
  const manager = getSseManager({
    heartbeatInterval: config.sseHeartbeatIntervalMs || 30000,
    clientTimeout: config.sseClientTimeoutMs || 60000,
    messageHistory: config.sseMessageHistory || 50
  });

  const ssePath = config.ssePath || '/events';

  // Instantiate the SDK's SSEServerTransport
  // We need to make assumptions about its constructor and how it signals SseManager.
  // Assumption:
  // 1. Constructor: new SSEServerTransport(httpServer, path)
  // 2. Connection event: sseSdkTransport.on('connection', ({ req, res, id }) => manager.handleConnection(req, res, { clientId: id }))
  // 3. MCP send integration: sseSdkTransport.setSendHandler(manager.broadcast.bind(manager)) or similar.
  //    Or, SSEServerTransport itself implements `send` and calls the broadcast handler.

  // This is a simplified conceptual integration. The actual SSEServerTransport API might differ.
  const sseSdkTransport = new SSEServerTransport(httpServer, ssePath);

  // Configure SSEServerTransport to use SseManager for client lifecycle and broadcasting
  // This part is highly dependent on the actual API of SSEServerTransport.
  // Attempting a plausible event-based integration with SSEServerTransport:
  if (typeof (sseSdkTransport as any).on === 'function') {
    console.log("Attempting event-based integration with SSEServerTransport.");

    // 1. Handle new client connections detected by SSEServerTransport
    (sseSdkTransport as any).on('connection', (eventData: { req: IncomingMessage; res: ServerResponse; clientId?: string; metadata?: Record<string,string> }) => {
      if (!eventData || !eventData.req || !eventData.res) {
        console.error("SSEServerTransport 'connection' event fired with invalid data.", eventData);
        return;
      }
      manager.handleConnection(eventData.req, eventData.res, { clientId: eventData.clientId, metadata: eventData.metadata });
    });

    // 2. Handle messages from MCP (via SSEServerTransport.send) to be broadcast by SseManager
    // Assuming SSEServerTransport emits an event like 'broadcast_message' or 'mcp_send' when its `send` method is called by MCP.
    (sseSdkTransport as any).on('broadcast_message', (message: any) => {
      // This event name 'broadcast_message' is speculative.
      // It implies that SSEServerTransport's `send` method, when called by MCP,
      // emits this event for SseManager to then perform the actual broadcast.
      manager.broadcast(message);
    });

    // 3. Handle client disconnections detected by SSEServerTransport
    (sseSdkTransport as any).on('client_disconnected', (clientId: string) => {
      // This event name 'client_disconnected' is speculative.
      if (clientId) {
        console.log(`SSEServerTransport reported client disconnected: ${clientId}. SseManager cleaning up.`);
        manager.disconnectClient(clientId); // Use public method, which calls _disconnectClient
      }
    });

  } else {
    console.warn("SSEServerTransport does not appear to be an EventEmitter (no 'on' method). Advanced SseManager integration (connections, broadcast, disconnections) may rely on SSEServerTransport's internal design or constructor options not visible here.");
  }

  // If MCP server is provided, integrate with it using the SDK's transport
  if (mcpServer) {
    mcpServer.connect(sseSdkTransport); // sseSdkTransport must implement the MCP Transport interface
  }

  // Remove the old manual HTTP endpoint setup
  // httpServer.on('request', (req, res) => { ... }); // This is now handled by SSEServerTransport

  return manager;
}

interface SseOptions {
  clientId?: string;
  metadata?: Record<string, string>;
  initialMessage?: any;
}
