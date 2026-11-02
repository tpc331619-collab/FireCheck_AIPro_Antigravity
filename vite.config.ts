import path from 'path';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 本機開發用：讓 `npm run dev` 也能呼叫 /api/gemini（正式環境由 Vercel Function 處理）。
 * 伺服器端密鑰只透過 process.env 提供給 api/ 下的程式，絕不 define 進前端 bundle。
 */
function localApiPlugin(serverEnv: Record<string, string>): Plugin {
  return {
    name: 'local-api-functions',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // 僅把伺服器端需要的變數注入 Node 環境（不會進前端）
      for (const key of ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID']) {
        if (serverEnv[key] && !process.env[key]) process.env[key] = serverEnv[key];
      }

      server.middlewares.use('/api/gemini', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/gemini.ts');
          const handler = req.method === 'POST' ? mod.POST : mod.GET;

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = Buffer.concat(chunks);

          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
          }

          const request = new Request(`http://localhost${req.originalUrl || req.url}`, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
          });

          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e: any) {
          console.error('[local-api] /api/gemini failed:', e?.message);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'LOCAL_API_ERROR' }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), localApiPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
            ui: ['lucide-react', '@tanstack/react-query'],
            utils: ['xlsx']
          }
        }
      }
    }
  };
});
