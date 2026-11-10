import { defineConfig, loadEnv } from 'vite'
import { inspectorApi } from './server/api.js'

export default defineConfig(({ mode }) => ({
  plugins: [inspectorApi(loadEnv(mode, process.cwd(), 'OPENAI_'))],
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/ai-history/**'],
    },
    watch: { ignored: ['**/ai-history/**'] },
  },
}))
