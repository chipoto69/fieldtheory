import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to read the Field Theory portal schema version.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
});

try {
  const rows = await sql<{ version: number; applied_at: string }[]>`
    select version, applied_at
    from fieldtheory_schema_version
    order by version
  `;
  console.log(JSON.stringify({ fieldtheory_schema_version: rows }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
