import dotenv from "dotenv";
import mariadb from "mariadb";
import { schemasConfig } from "./schemas.js";

dotenv.config();

const DEFAULT_TIMEOUT = process.env.MARIADB_TIMEOUT_MS
	? Number.parseInt(process.env.MARIADB_TIMEOUT_MS, 10)
	: 10000;
const DEFAULT_ROW_LIMIT = process.env.MARIADB_ROW_LIMIT
	? Number.parseInt(process.env.MARIADB_ROW_LIMIT, 10)
	: 1000;
const DEBUG_SQL = process.env.DEBUG_SQL === "true";

function getConfigFromEnv() {
	const host = schemasConfig.host.parse(process.env.MARIADB_HOST);
	const port = schemasConfig.port.parse(
		process.env.MARIADB_PORT
			? Number.parseInt(process.env.MARIADB_PORT, 10)
			: 3306,
	);
	const user = schemasConfig.user.parse(process.env.MARIADB_USER);
	const password = schemasConfig.password.parse(process.env.MARIADB_PASSWORD);
	const database = schemasConfig.database.parse(process.env.MARIADB_DATABASE);
	const allow_insert = schemasConfig.allow_insert.parse(
		process.env.MARIADB_ALLOW_INSERT === "true",
	);
	const allow_update = schemasConfig.allow_update.parse(
		process.env.MARIADB_ALLOW_UPDATE === "true",
	);
	const allow_delete = schemasConfig.allow_delete.parse(
		process.env.MARIADB_ALLOW_DELETE === "true",
	);

	if (!host) throw new Error("MARIADB_HOST variável de ambiente é obrigatória");
	if (!user) throw new Error("MARIADB_USER variável de ambiente é obrigatória");
	if (!password)
		throw new Error("MARIADB_PASSWORD variável de ambiente é obrigatória");

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

const config = getConfigFromEnv();

const pool = mariadb.createPool({
	host: config.host,
	port: config.port,
	user: config.user,
	password: config.password,
	connectionLimit: 5,
});

async function executeQuery(sql, database) {
	const connection = await pool.getConnection();
	try {
		if (DEBUG_SQL) console.log("[SQL] Nova conexão adquirida do pool");
		if (database) {
			if (DEBUG_SQL) console.log(`[SQL] USE \`${database}\``);
			await connection.query(`USE \`${database}\``);
		}
		if (DEBUG_SQL) console.log(`[SQL] Executando: ${sql}`);
		const [rows, fields] = await connection.query({
			metaAsArray: true,
			dateStrings: true,
			namedPlaceholders: true,
			insertIdAsNumber: true,
			decimalAsNumber: true,
			bigIntAsNumber: true,
			timeout: DEFAULT_TIMEOUT,
			sql: sql,
		});
		const limitedRows =
			Array.isArray(rows) && rows.length > DEFAULT_ROW_LIMIT
				? rows.slice(0, DEFAULT_ROW_LIMIT)
				: rows;
		return { rows: limitedRows, fields };
	} catch (error) {
		console.error("[Erro] SQL com falha:", error);
		throw error;
	} finally {
		if (connection) {
			connection.release();
			if (DEBUG_SQL) console.log("[SQL] Conexão devolvida ao pool");
		}
	}
}

export {
	DEFAULT_TIMEOUT,
	DEFAULT_ROW_LIMIT,
	DEBUG_SQL,
	config,
	pool,
	getConfigFromEnv,
	executeQuery,
};
