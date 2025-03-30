/**
 * MariaDB connection management for MCP server
 */

import mariadb from "mariadb";
import { MariaDBConfig } from "./types.js";
import { isAlloowedQuery } from "./validators.js";

// Default connection timeout in milliseconds
const DEFAULT_TIMEOUT = 10000;

// Default row limit for query results
const DEFAULT_ROW_LIMIT = 1000;

/**
 * Create a MariaDB connection pool
 */
export function createConnectionPool(config: MariaDBConfig): mariadb.Pool {
  console.error("[Setup] Creating MariaDB connection pool");

  try {
    return mariadb.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: 10,
      connectTimeout: DEFAULT_TIMEOUT,
    });
  } catch (error) {
    console.error("[Error] Failed to create connection pool:", error);
    throw error;
  }
}

/**
 * Execute a query with error handling and logging
 */
export async function executeQuery(
  pool: mariadb.Pool,
  sql: string,
  params: any[] = [],
  database?: string
): Promise<{ rows: any; fields: mariadb.FieldInfo[] }> {
  console.error(`[Query] Executing: ${sql}`);

  let connection: mariadb.PoolConnection | null = null;

  try {
    // Get connection from pool
    connection = await pool.getConnection();

    // Use specific database if provided
    if (database) {
      console.error(`[Query] Using database: ${database}`);
      await connection.query(`USE \`${database}\``);
    }
    if (!isAlloowedQuery(sql)) {
      throw new Error("Query not allowed");
    }
    // Execute query with timeout
    const [rows, fields] = await Promise.race([
      connection.query(sql, params),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Query timeout")), DEFAULT_TIMEOUT);
      }),
    ]);

    // Apply row limit if result is an array
    console.error(
      `[Query] rows: ${JSON.stringify(rows)} limit: ${DEFAULT_ROW_LIMIT}`
    );
    const limitedRows =
      Array.isArray(rows) && rows.length > DEFAULT_ROW_LIMIT
        ? rows.slice(0, DEFAULT_ROW_LIMIT)
        : rows;

    // Log result summary
    console.error(
      `[Query] Success: ${Array.isArray(rows) ? rows.length : 1} rows returned`
    );

    return { rows: limitedRows, fields };
  } catch (error) {
    if (connection) {
      connection.release();
    }
    console.error("[Error] Query execution failed:", error);
    throw error;
  } finally {
    // Release connection back to pool
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get MariaDB connection configuration from environment variables
 */
export function getConfigFromEnv(): MariaDBConfig {
  const host = process.env.MARIADB_HOST;
  const portStr = process.env.MARIADB_PORT;
  const user = process.env.MARIADB_USER;
  const password = process.env.MARIADB_PASSWORD;
  const database = process.env.MARIADB_DATABASE;
  const allow_insert = process.env.MARIADB_ALLOW_INSERT === "true";
  const allow_update = process.env.MARIADB_ALLOW_UPDATE === "true";
  const allow_delete = process.env.MARIADB_ALLOW_DELETE === "true";

  if (!host) throw new Error("MARIADB_HOST environment variable is required");
  if (!user) throw new Error("MARIADB_USER environment variable is required");
  if (!password)
    throw new Error("MARIADB_PASSWORD environment variable is required");

  const port = portStr ? parseInt(portStr, 10) : 3306;

  return {
    host,
    port,
    user,
    password,
    database,
    allow_insert,
    allow_update,
    allow_delete,
  };
}
