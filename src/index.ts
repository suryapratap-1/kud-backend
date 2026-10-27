import { env } from "@/env";
import { createApp } from "@/app";

const server = createApp().listen(env.PORT, () => {
  console.log(`Kudos API listening on ${env.API_URL} (port ${env.PORT}), accepting ${env.FRONTEND_URL}`);
});

// Finish in-flight requests before exiting, e.g. during a deploy.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
