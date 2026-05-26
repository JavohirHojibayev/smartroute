import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3000'

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      // Cursor / VS Code Dev Tunnels va telefon brauzeri uchun Host tekshiruvi
      allowedHosts: ['.devtunnels.ms', '.cursor.sh', 'localhost', '192.168.0.3'],
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
