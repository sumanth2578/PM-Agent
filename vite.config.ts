import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'
import type { IncomingMessage, ServerResponse } from 'http'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const recallRegion = env.VITE_RECALL_REGION || 'us-east-1'
  const recallApiKey = env.VITE_RECALL_API_KEY

  return {
    plugins: [
      react(),
      {
        name: 'recall-api-proxy',
        configureServer(server) {
          server.middlewares.use('/api/recall', (req: IncomingMessage, res: ServerResponse) => {
            const targetPath = '/api/v1' + (req.url || '/');
            const chunks: Buffer[] = [];

            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => {
              const body = chunks.length > 0 ? Buffer.concat(chunks) : null;

              const options = {
                hostname: `${recallRegion}.recall.ai`,
                port: 443,
                path: targetPath,
                method: req.method,
                headers: {
                  'Authorization': `Token ${recallApiKey}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Host': `${recallRegion}.recall.ai`,
                  ...(body && body.length > 0 ? { 'Content-Length': String(body.length) } : {}),
                },
              };

              const proxyReq = https.request(options, (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 500, {
                  'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                });
                proxyRes.pipe(res);
              });

              proxyReq.on('error', (err: Error) => {
                console.error('Recall proxy error:', err.message);
                res.writeHead(502);
                res.end(JSON.stringify({ error: err.message }));
              });

              if (body && body.length > 0) proxyReq.write(body);
              proxyReq.end();
            });
          });
        },
      },
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
