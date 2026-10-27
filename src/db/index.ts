import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

// prepare: false keeps it compatible with Supabase's transaction pooler and Neon's pooled endpoint.
const client = postgres(env.DATABASE_URL, { prepare: false, max: 10 });

export const db = drizzle(client, { schema });
export { schema };
