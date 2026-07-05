import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
const client = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 1, // one connection per serverless instance
    connect_timeout: 10, // fail fast instead of hanging 300s
    idle_timeout: 20, // release connection after 20s idle
});
const queryLogger = process.env.LOG_QUERIES === 'true'
    ? {
        logQuery(sql, params) {
            console.log('[QUERY]', sql.trim(), params.length ? params : '');
        },
    }
    : undefined;
export const db = drizzle(client, { schema, logger: queryLogger });
