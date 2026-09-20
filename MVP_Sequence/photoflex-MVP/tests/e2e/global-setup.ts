import { createServer, type ViteDevServer } from "vite";
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(_config: FullConfig) {
  const server: ViteDevServer = await createServer({
    mode: "e2e",
    server: { host: "127.0.0.1", port: 4173 },
  });
  await server.listen();

  return async () => {
    await server.close();
  };
}
