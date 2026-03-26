import { app } from "./app.js";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { bindRemoteConsoleWsProxy } from "./modules/remote-console/remote-console.ws.js";
import { startVmScheduler, stopVmScheduler } from "./modules/virtual-machines/vm-scheduler.js";

const server = app.listen(env.PORT, () => {
  console.log(`[hyperdesk-api] listening on http://localhost:${env.PORT}`);
});
server.requestTimeout = env.API_REQUEST_TIMEOUT_MS;
bindRemoteConsoleWsProxy(server);
startVmScheduler();

async function shutdown() {
  stopVmScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
