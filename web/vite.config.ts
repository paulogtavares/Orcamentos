import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Tela do Orçamentos. base "./": os assets são relativos ao <base href> que o servidor escreve,
 * então o mesmo build funciona em "/" e em "/financeiro/orcamentos/".
 */
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react()],
  // o kit usa as cópias do módulo (peerDependencies)
  resolve: { dedupe: ["react", "react-dom", "react-router", "lucide-react"] },
  build: { outDir: "dist/public", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:3333", "/modulo.json": "http://127.0.0.1:3333" },
  },
});
