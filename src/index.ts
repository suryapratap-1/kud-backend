import { env } from "@/env";
import { createApp } from "@/app";
import { logger } from "@/lib/logger";

const server = createApp().listen(env.PORT, () => {
  logger.info(`Kudos API listening on ${env.API_URL} (port ${env.PORT}), accepting ${env.FRONTEND_URL}`);
});

// Finish in-flight requests before exiting, e.g. during a deploy.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}

process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled promise rejection"));
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});
