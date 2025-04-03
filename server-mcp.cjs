const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } = require("@modelcontextprotocol/sdk/types.js");
const { z } = require("zod");
const dotenv = require("dotenv");
const mariadb = require('mariadb');

dotenv.config();

const config = getConfigFromEnv();
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_ROW_LIMIT = 1000;
const schemas = {
    toolInputs: {
        show_databases: z.object({}),
        show_tables: z.object({
            database: z.string().optional(),
        }),
        describe_table: z.object({
            database: z.string().optional(),
            table: z.string(),
        }),
        run_query: z.object({
            sql: z.string(),
            database: z.string().optional(),
        })
    },
};

const TOOL_DEFINITIONS = [
    {
        name: "show_databases",
        description: "Listar todos os bancos de dados acessíveis no servidor",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "show_tables",
        description: "Listar todas as tabelas em um banco de dados especificado",
        inputSchema: {
            type: "object",
            id: "urn:jsonschema:database",
            properties: {
                database: {
                    type: "string",
                    description:
                        "Nome do banco de dados (opcional, usa o padrão se não for especificado)",
                },
            },
            required: [],
        },
    },
    {
        name: "describe_table",
        description: "Mostrar a estrutura de uma tabela específica",
        inputSchema: {
            type: "object",
            properties: {
                database: {
                    type: "string",
                    description:
                        "Nome do banco de dados (opcional, usa o padrão se não for especificado)",
                },
                table: {
                    type: "string",
                    description: "Nome da tabela",
                },
            },
            required: ["table"],
        },
    },
    {
        name: "run_query",
        description: "Executar consulta SQL",
        inputSchema: {
            type: "object",
            properties: {
                sql: {
                    type: "string",
                    description: `Instruções SQL permitidas: (SELECT, ${config.allow_insert ? "INSERT," : ""} ${config.allow_update ? "UPDATE," : ""} ${config.allow_delete ? "DELETE," : ""} SHOW, DESCRIBE, and EXPLAIN)`,
                },
                database: {
                    type: "string",
                    description:
                        "Nome do banco de dados (opcional, usa o padrão se não for especificado)",
                },
            },
            required: ["query"],
        },
    },
];

const toolHandlers = {
    show_databases: async (args) => {
        const { rows } = await executeQuery("SHOW DATABASES");
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(rows, null, 2),
                },
            ],
        };
    },

    show_tables: async (args) => {
        const parsed = schemas.toolInputs.show_tables.parse(args);
        const database = parsed.database ?? config.database;
        if (!database) {
            throw new McpError(ErrorCode.InvalidParams, "O nome do banco de dados é obrigatório");
        }
        const { rows } = await executeQuery("SHOW FULL TABLES", database);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(rows, null, 2),
                },
            ],
        };
    },

    describe_table: async (args) => {
        const parsed = schemas.toolInputs.describe_table.parse(args);
        const database = parsed.database ?? config.database;
        const table = parsed.table;
        if (!database) {
            throw new McpError(ErrorCode.InvalidParams, "O nome do banco de dados é obrigatório");
        }
        if (!table) {
            throw new McpError(ErrorCode.InvalidParams, "O nome da tabela é obrigatório");
        }
        const { rows } = await executeQuery(`DESCRIBE \`${table}\``, database);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(rows, null, 2),
                },
            ],
        };
    },

    run_query: async (args) => {
        const parsed = schemas.toolInputs.run_query.parse(args);
        const query = parsed.sql;
        const database = parsed.database ?? config.database;
        if (!database) {
            throw new McpError(ErrorCode.InvalidParams, "O nome do banco de dados é obrigatório");
        }
        if (!query) {
            throw new McpError(ErrorCode.InvalidParams, "Faltando comando SQL (MySQL)");
        }
        const { rows } = await executeQuery(query, database);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(rows, null, 2),
                },
            ],
        };
    },
};

const server = new Server({
    name: "mariadb-mcp-server",
    version: "0.1.0",
},
    {
        capabilities: {
            resources: {},
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOL_DEFINITIONS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        const handler = toolHandlers[name];
        if (!handler) throw new Error(`Ferramenta desconhecida: ${name}`);
        return await handler(args);
    } catch (error) {
        console.error(`Erro ao executar a ferramenta ${name}:`, error);
        throw error;
    }
});

async function main() {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
    } catch (error) {
        console.error("[Fatal] Falha ao iniciar o servidor:", error);
        process.exit(1);
    }
}

// Handle process termination
process.on("SIGINT", async () => {
    console.log("[Desligando] Fechando conexão com o servidor de banco de dados");
    process.exit(0);
});

function getConfigFromEnv() {
    const host = process.env.MARIADB_HOST;
    const portStr = process.env.MARIADB_PORT;
    const user = process.env.MARIADB_USER;
    const password = process.env.MARIADB_PASSWORD;
    const database = process.env.MARIADB_DATABASE;
    const allow_insert = process.env.MARIADB_ALLOW_INSERT === "true";
    const allow_update = process.env.MARIADB_ALLOW_UPDATE === "true";
    const allow_delete = process.env.MARIADB_ALLOW_DELETE === "true";
    const port = portStr ? parseInt(portStr, 10) : 3306;

    if (!host) throw new Error("MARIADB_HOST variável de ambiente é obrigatória");
    if (!user) throw new Error("MARIADB_USER variável de ambiente é obrigatória");
    if (!password) throw new Error("MARIADB_PASSWORD variável de ambiente é obrigatória");

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

async function executeQuery(sql, database) {
    /*
    console.log("[Setup] Configuração do Servidor de Banco de Dados:", {
        host: config.host,
        port: config.port,
        user: config.user,
        database: (database ?? config.database) || "(padrão não definido)",
    });    
    console.log(`[SQL] Executando: ${sql}`);
    */
    const connection = await mariadb.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
    });
    try {
        if (database) {
            await connection.query(`USE \`${database}\``);
        }
        if (!isAlloowedQuery(sql)) {
            console.error(`[SQL] SQL não permitido: ${sql}`);
            throw new Error("SQL não permitido");
        }
        const [rows, fields] = await connection.query({
            metaAsArray: true,
            dateStrings: true,
            namedPlaceholders: true,
            insertIdAsNumber: true,
            decimalAsNumber: true,
            bigIntAsNumber: true,
            timeout: DEFAULT_TIMEOUT,
            sql: sql
        });
        const limitedRows =
            Array.isArray(rows) && rows.length > DEFAULT_ROW_LIMIT
                ? rows.slice(0, DEFAULT_ROW_LIMIT)
                : rows;
        return { rows: limitedRows, fields };
    } catch (error) {
        if (connection) {
            connection.end();
        }
        console.error("[Erro] SQL com falha:", error);
        throw error;
    } finally {
        if (connection) {
            connection.end();
        }
    }
}

function isAlloowedQuery(sql) {
    // Normalize query by removing comments and extra whitespace
    if (!sql || typeof sql !== "string") {
        console.error("[SQL] SQL deve ser uma string não vazia");
        return false;
    }
    const normalizedQuery = sql
        .replace(/--.*$/gm, "") // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim()
        .toUpperCase();
    const ALLOW_INSERT = config.allow_insert === "true";
    const ALLOW_UPDATE = config.allow_update === "true";
    const ALLOW_DELETE = config.allow_delete === "true";
    const ALLOWED_COMMANDS = [
        "SELECT",
        "SHOW",
        "DESCRIBE",
        "DESC",
        "EXPLAIN",
        "INSERT",
        "UPDATE",
        "DELETE",
    ];
    const DISALLOWED_COMMANDS = [
        "INSERT",
        "UPDATE",
        "DELETE",
        "DROP",
        "CREATE",
        "ALTER",
        "TRUNCATE",
        "RENAME",
        "REPLACE",
        "GRANT",
        "REVOKE",
        "LOCK",
        "UNLOCK",
        "CALL",
        "EXEC",
        "EXECUTE",
        "SET",
        "START",
        "BEGIN",
        "COMMIT",
        "ROLLBACK",
    ];

    // Check if query starts with an allowed command
    const startsWithAllowed = ALLOWED_COMMANDS.some(
        (cmd) => normalizedQuery.startsWith(cmd + " ") || normalizedQuery === cmd
    );
    const containsDisallowed = DISALLOWED_COMMANDS.some((cmd) => {
        if (cmd === "INSERT" && !ALLOW_INSERT) {
            return false; // Skip INSERT if not allowed
        }
        if (cmd === "UPDATE" && !ALLOW_UPDATE) {
            return false; // Skip UPDATE if not allowed
        }
        if (cmd === "DELETE" && !ALLOW_DELETE) {
            return false; // Skip DELETE if not allowed
        }
        const regex = new RegExp(`(^|\\s)${cmd}(\\s|$)`);
        return regex.test(normalizedQuery);
    });
    const hasMultipleStatements =
        normalizedQuery.includes(";") && !normalizedQuery.endsWith(";");
    const ret = startsWithAllowed && !containsDisallowed && !hasMultipleStatements;
    if (!ret) {
        console.error("[SQL] SQL contém comandos não permitidos ou não é permitida pela configuração atual!");
    }
    return ret;
}

const args = process.argv.slice(2);
if (args.length > 0) {
    const funcao = args[0];
    const input = args[1] ? JSON.parse(args[1]) : {};
    if (toolHandlers[funcao]) {
        toolHandlers[funcao](input).then((res) => {
            process.exit(0);
        }).catch((err) => {
            console.error(`Erro ao executar ${funcao}:`, err);
            process.exit(1);
        });
    } else {
        console.error(`❌ Função desconhecida: ${funcao}`);
        process.exit(1);
    }
} else {
    main().catch((error) => {
        console.error("Erro Fatal sem função para executar:", error);
        process.exit(1);
    });
}