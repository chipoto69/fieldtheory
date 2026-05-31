import postgres from "postgres";
import { createPostgresSchema, POSTGRES_SCHEMA_VERSION } from "../src/lib/postgres-schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to migrate the Field Theory portal store.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
});

try {
  await createPostgresSchema(sql);
  console.log(`fieldtheory portal postgres schema v${POSTGRES_SCHEMA_VERSION} ready`);
} finally {
  await sql.end({ timeout: 5 });
}
