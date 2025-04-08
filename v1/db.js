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
const DEBUG_SQL = process.env.MARIADB_DEBUG_SQL === "true";
const LOG_LEVEL = process.env.MARIADB_LOG_LEVEL || "info"; // info, warn, error, debug

function log(level, message, ...args) {
	const levels = ["error", "warn", "info", "debug"];
	if (levels.indexOf(level) <= levels.indexOf(LOG_LEVEL)) {
		console[level === "warn" ? "warn" : (level === "error" || level === 'debug') ? "error" : "log"](
			message,
			...args,
		);
	}
}

function parseArgsAndEnv() {
	const cliArgs = process.argv.slice(2);
	const envConfig = {
		host: process.env.MARIADB_HOST,
		port: process.env.MARIADB_PORT ?? "3306",
		user: process.env.MARIADB_USER,
		password: process.env.MARIADB_PASSWORD,
		database: process.env.MARIADB_DATABASE,
		allow_insert: process.env.MARIADB_ALLOW_INSERT === "true",
		allow_update: process.env.MARIADB_ALLOW_UPDATE === "true",
		allow_delete: process.env.MARIADB_ALLOW_DELETE === "true",
	};
	for (const arg of cliArgs) {
		if (arg.startsWith("host=")) envConfig.host = arg.split("=")[1];
		else if (arg.startsWith("port=")) envConfig.port = arg.split("=")[1];
		else if (arg.startsWith("user=")) envConfig.user = arg.split("=")[1];
		else if (arg.startsWith("password="))
			envConfig.password = arg.split("=")[1];
		else if (arg.startsWith("database="))
			envConfig.database = arg.split("=")[1];
	}

	return envConfig;
}

function validateConfig(rawConfig) {
	const host = schemasConfig.host.parse(rawConfig.host);
	const port = schemasConfig.port.parse(Number.parseInt(rawConfig.port, 10));
	const user = schemasConfig.user.parse(rawConfig.user);
	const password = schemasConfig.password.parse(rawConfig.password);
	const database = schemasConfig.database.parse(rawConfig.database);
	const allow_insert = schemasConfig.allow_insert.parse(rawConfig.allow_insert);
	const allow_update = schemasConfig.allow_update.parse(rawConfig.allow_update);
	const allow_delete = schemasConfig.allow_delete.parse(rawConfig.allow_delete);

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

function getConfigFromEnv() {
	const rawConfig = parseArgsAndEnv();
	return validateConfig(rawConfig);
}

function getPoolKey(cfg) {
	const strHost = cfg.host.split(".").join("_");
	return `${strHost}_${cfg.user}_${cfg.database}`;
}

const config = getConfigFromEnv();
const pools = [];

async function executeQuery(sql, database) {
	const key = getPoolKey(config);

	if (!pools[key]) {
		log("info", `[DB] Criando novo pool para ${key}`);
		pools[key] = mariadb.createPool({
			host: config.host,
			port: config.port,
			user: config.user,
			password: config.password,
			connectionLimit: 1,
			connectTimeout: DEFAULT_TIMEOUT,
		});
		if (DEBUG_SQL) {
			log("debug", `[DB] Criando novo pool para ${key} : ${new Date().toLocaleString("pt-BR")}`);
			log('debug', "****************************");
			log('debug', `** Host: ${config.host}`);
			log('debug', `** Port: ${config.port}`);
			log('debug', `** User: ${config.user}`);
			log('debug', `** Database: ${config.database}`);
			log('debug', "****************************");
		}
	}
	if (!pools[key]) {
		throw new Error(`Não foi possível criar o pool para ${key}`);
	}
	const connection = await pools[key].getConnection();
	if (DEBUG_SQL) {
		log("debug", `[DB] conexão para ${key} Id: ${connection.threadId}`);
	}

	try {
		if (DEBUG_SQL) log("debug", "[SQL] Nova conexão adquirida do pool");
		if (database) {
			if (DEBUG_SQL) log("debug", `[SQL] USE \`${database}\``);
			await connection.query(`USE \`${database}\``);
		}
		if (DEBUG_SQL) log("debug", `[SQL] Executando: ${sql}`);
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
		log("error", "[Erro] SQL com falha:", error, "Query:", sql);
		throw error;
	} finally {
		if (connection) {
			connection.release();
			if (DEBUG_SQL) log("debug", "[SQL] Conexão devolvida ao pool");
		}
	}
}

async function closeAllPools() {
	for (const key of Object.keys(pools)) {
		try {
			await pools[key].end();
			log("info", `[DB] Pool fechado para ${key}`);
		} catch (err) {
			log("warn", `[DB] Erro ao fechar pool ${key}:`, err);
		}
	}
}

export {
	DEFAULT_TIMEOUT,
	DEFAULT_ROW_LIMIT,
	DEBUG_SQL,
	config,
	pools,
	getConfigFromEnv,
	executeQuery,
	closeAllPools,
};
