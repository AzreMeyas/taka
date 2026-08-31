import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");

// prepare: false is required by Supabase's transaction pooler (pgbouncer).
// The client is cached on globalThis so hot reload in dev does not open a new
// pool on every file save.
const globalForDb = globalThis as unknown as { _sql?: ReturnType<typeof postgres> };
const client = globalForDb._sql ?? postgres(url, { prepare: false, max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb._sql = client;

export const db = drizzle(client, { schema });
