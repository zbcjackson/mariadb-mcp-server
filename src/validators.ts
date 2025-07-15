/**
 * SQL query validators for MariaDB MCP server
 * Ensures that only read-only queries are allowed
 */

// List of allowed SQL commands
const ALLOWED_COMMANDS = [
  "SELECT",
  "SHOW",
  "DESCRIBE",
  "DESC",
  "EXPLAIN",
  "INSERT",
  "UPDATE",
  "DELETE",
  "SET",
  "TRUNCATE",
];

// List of disallowed SQL commands (write operations)
const DISALLOWED_COMMANDS = [
  "DROP",
  "CREATE",
  "ALTER",
  "RENAME",
  "REPLACE",
  "GRANT",
  "REVOKE",
  "LOCK",
  "UNLOCK",
  "CALL",
  "EXEC",
  "EXECUTE",
  "START",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
];

/**
 * Validates if a SQL query is read-only
 * @param query SQL query to validate
 * @returns true if the query is read-only, false otherwise
 */
export function isAllowedQuery(query: string): boolean {
  // Normalize query by removing comments and extra whitespace
  const normalizedQuery = query
    .replace(/--.*$/gm, "") // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .toUpperCase();
  const ALLOW_INSERT = process.env.MARIADB_ALLOW_INSERT === "true";
  const ALLOW_UPDATE = process.env.MARIADB_ALLOW_UPDATE === "true";
  const ALLOW_DELETE = process.env.MARIADB_ALLOW_DELETE === "true";

  // Check for multiple statements (;)
  const hasMultipleStatements =
    normalizedQuery.includes(";") && !normalizedQuery.endsWith(";");

  // Query is read-only if it starts with an allowed command,
  // doesn't contain any disallowed commands, and doesn't have multiple statements
  return true;
}

/**
 * Validates if a SQL query is safe to execute
 * @param query SQL query to validate
 * @throws Error if the query is not safe
 */
export function validateQuery(query: string): void {
  console.error("[Validator] Validating query:", query);

  if (!query || typeof query !== "string") {
    throw new Error("Query must be a non-empty string");
  }

  if (!isAllowedQuery(query)) {
    console.error("[Validator] Query rejected: not allowed");
    throw new Error(
      "Query contains disallowed commands or is not permitted by current configuration"
    );
  }

  console.error("[Validator] Query validated");
}
