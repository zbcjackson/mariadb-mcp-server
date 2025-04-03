const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} = require("@modelcontextprotocol/sdk/types.js");
const { z } = require("zod");
const dotenv = require("dotenv");
const mariadb = require("mariadb");

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
    }),
  },
};
const schemasConfig = {
  host: z.string(),
  port: z.number(),
  user: z.string(),
  password: z.string(),
  database: z.string().optional(),
  allow_insert: z.boolean().default(false),
  allow_update: z.boolean().default(false),
  allow_delete: z.boolean().default(false),
};
const config = getConfigFromEnv();

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
          description: `Instruções SQL permitidas: (SELECT, ${
            config.allow_insert ? "INSERT," : ""
          } ${config.allow_update ? "UPDATE," : ""} ${
            config.allow_delete ? "DELETE," : ""
          } SHOW, DESCRIBE, and EXPLAIN)`,
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

const server = new Server(
  {
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

function getConfigFromEnv() {
  dotenv.config();
  const host = schemasConfig.host.parse(process.env.MARIADB_HOST);
  const port = schemasConfig.port.parse(
    process.env.MARIADB_PORTr ? parseInt(process.env.MARIADB_PORT, 10) : 3306
  );
  const user = schemasConfig.user.parse(process.env.MARIADB_USER);
  const password = schemasConfig.password.parse(process.env.MARIADB_PASSWORD);
  const database = schemasConfig.database.parse(process.env.MARIADB_DATABASE);
  const allow_insert = schemasConfig.allow_insert.parse(
    process.env.MARIADB_ALLOW_INSERT === "true"
  );
  const allow_update = schemasConfig.allow_update.parse(
    process.env.MARIADB_ALLOW_UPDATE === "true"
  );
  const allow_delete = schemasConfig.allow_delete.parse(
    process.env.MARIADB_ALLOW_DELETE === "true"
  );

  if (!host)
    throw new McpError(
      ErrorCode.InvalidParams,
      "MARIADB_HOST variável de ambiente é obrigatória"
    );
  if (!user)
    throw new McpError(
      ErrorCode.InvalidParams,
      "MARIADB_USER variável de ambiente é obrigatória"
    );
  if (!password)
    throw new McpError(
      ErrorCode.InvalidParams,
      "MARIADB_PASSWORD variável de ambiente é obrigatória"
    );

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

async function show_databases() {
  const { rows } = await executeQuery("SHOW DATABASES");
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(rows, null, 2),
      },
    ],
  };
}

async function show_tables(args) {
  const parsed = schemas.toolInputs.show_tables.parse(args);
  const database = parsed.database ?? config.database;
  if (!database) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "O nome do banco de dados é obrigatório"
    );
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
}

async function describe_table(args) {
  const parsed = schemas.toolInputs.describe_table.parse(args);
  const database = parsed.database ?? config.database;
  const table = parsed.table;
  if (!database) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "O nome do banco de dados é obrigatório"
    );
  }
  if (!table) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "O nome da tabela é obrigatório"
    );
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
}

async function run_query(args) {
  const parsed = schemas.toolInputs.run_query.parse(args);
  const query = parsed.sql;
  const database = parsed.database ?? config.database;
  if (!database) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "O nome do banco de dados é obrigatório"
    );
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
      throw new McpError(ErrorCode.InvalidParams, "SQL não permitido");
    }
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
    if (connection) {
      connection.end();
    }
    console.error("[Erro] SQL com falha:", error);
    throw new McpError(ErrorCode.InvalidParams, error);
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
    if (cmd === "INSERT" && !config.allow_insert) {
      return false; // Skip INSERT if not allowed
    }
    if (cmd === "UPDATE" && !config.allow_update) {
      return false; // Skip UPDATE if not allowed
    }
    if (cmd === "DELETE" && !config.allow_delete) {
      return false; // Skip DELETE if not allowed
    }
    const regex = new RegExp(`(^|\\s)${cmd}(\\s|$)`);
    return regex.test(normalizedQuery);
  });
  const hasMultipleStatements =
    normalizedQuery.includes(";") && !normalizedQuery.endsWith(";");
  const ret =
    startsWithAllowed && !containsDisallowed && !hasMultipleStatements;
  if (!ret) {
    console.error(
      "[SQL] SQL contém comandos não permitidos ou não é permitida pela configuração atual!"
    );
  }
  return ret;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOL_DEFINITIONS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "show_databases": {
        return show_databases();
      }
      case "show_tables": {
        return show_tables(request.params.arguments);
      }
      case "describe_table": {
        return describe_table(request.params.arguments);
      }
      case "run_query": {
        return run_query(request.params.arguments);
      }
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `[Error] Ferramenta desconhecida: ${request.params.name}`,
          request.params.arguments
        );
    }
  } catch (error) {
    console.error(
      `Erro ao executar a ferramenta ${request.params.name}:`,
      error
    );
    // Format error message for client
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  console.log("Servidor MariaDB-MCP iniciando...");
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

main().catch((error) => {
  console.error("Erro Fatal sem função para executar:", error);
  process.exit(1);
});
