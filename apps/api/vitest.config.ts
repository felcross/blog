import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Testes compartilham o Postgres (login tokens, sessões).
    // Em paralelo, um arquivo apaga dados que outro ainda vai usar.
    fileParallelism: false,
  },
});
