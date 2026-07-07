import { createStore } from "../apps/api/src/store.js";
import { closePostgresPool, maskDatabaseUrl } from "../apps/api/src/postgres.js";
import { summarizePostgresReports } from "../apps/api/src/postgres-reporting.js";
import { loadLocalEnv } from "./postgres-env.mjs";

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env before running the Postgres report summary.");
}

const args = parseArgs(process.argv.slice(2));
const store = createStore();
const user = args.email
  ? store.getUserByEmail(args.email)
  : { id: "admin-report-preview", role: "admin", isAdmin: true };

if (args.email && !user) {
  throw new Error(`No local state user found for ${args.email}. Omit --email for an admin-wide summary.`);
}

try {
  const summary = await summarizePostgresReports(user, {
    month: args.month,
    year: args.year,
    financialYear: args.financialYear,
    startDate: args.startDate,
    endDate: args.endDate,
  });
  console.log(`database: ${maskDatabaseUrl()}`);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await closePostgresPool();
}
