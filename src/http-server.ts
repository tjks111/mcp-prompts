import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';
import cors from 'cors';
import { enableSseInHttpServer } from './sse.js';

export interface HttpServerConfig {
  port: number;
  host: string;
  corsOrigin?: string;
  enableSSE?: boolean;
  ssePath?: string;
}

export async function startHttpServer(
  server: Server,
  config: HttpServerConfig
): Promise<void> {
  const app = express();

  // Enable CORS
  app.use(cors({
    origin: config.corsOrigin || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // Handle preflight requests
  app.options('*', (req, res) => {
    res.status(204).end();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Start the server
  await new Promise<void>((resolve, reject) => {
    let httpServer: ReturnType<typeof app.listen> | null = null;
    try {
      httpServer = app.listen(config.port, config.host, () => {
        console.log(`HTTP server listening at http://${config.host}:${config.port}`);
        // Set up SSE if enabled
        if (config.enableSSE && httpServer) {
          enableSseInHttpServer(config, httpServer, server);
        }
        resolve();
      });

      httpServer.on('error', (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
} 