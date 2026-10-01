import { defineConfig } from "vitest/config";

export default defineConfig({
  // o kit usa as cópias do módulo de react, react-router e lucide-react (peerDependencies):
  // processado pelo Vite junto com os testes, para não haver duas instâncias do roteador
  resolve: { dedupe: ["react", "react-dom", "react-router", "lucide-react"] },
  test: {
    include: ["compartilhado/**/*.test.ts", "api/testes/**/*.test.ts", "web/src/**/*.test.{ts,tsx}"],
    server: { deps: { inline: ["plataforma-kit"] } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
