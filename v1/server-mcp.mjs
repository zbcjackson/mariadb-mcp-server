import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { schemas } from "./schemas.js";
import { config, executeQuery } from "./db.js";

const TOOL_DEFINITIONS = [
  {
    name: "show_databases",
    description: "Retorna uma lista com os nomes de todos os bancos de dados acessíveis no servidor MariaDB.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "show_tables",
    description: "Retorna uma lista com os nomes e tipos de todas as tabelas do banco de dados especificado. Se nenhum banco de dados for informado, utiliza o banco de dados padrão.",
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
    description: "Retorna a estrutura detalhada (colunas, tipos, nulabilidade, etc.) de uma tabela específica em um banco de dados. O banco de dados pode ser especificado ou será usado o padrão.",
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
    description: "Executa uma consulta SQL no banco de dados especificado ou padrão, retornando o resultado da consulta.",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: `Instruções SQL permitidas: (SELECT${config.allow_insert ? ", INSERT" : ""}${config.allow_update ? ", UPDATE" : ""}${config.allow_delete ? ", DELETE" : ""}, SHOW, DESCRIBE, EXPLAIN)`,
        },
        database: {
          type: "string",
          description:
            "Nome do banco de dados (opcional, usa o padrão se não for especificado)",
        },
      },
      required: ["sql"],
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

function isAllowedQuery(sql) {
  if (!sql || typeof sql !== "string") {
    console.error("[SQL] SQL deve ser uma string não vazia");
    return false;
  }
  const normalizedQuery = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
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

  const startsWithAllowed = ALLOWED_COMMANDS.some(
    (cmd) => normalizedQuery.startsWith(`${cmd} `) || normalizedQuery === cmd
  );

  const containsDisallowed = DISALLOWED_COMMANDS.some((cmd) => {
    if (cmd === "INSERT" && config.allow_insert) return false;
    if (cmd === "UPDATE" && config.allow_update) return false;
    if (cmd === "DELETE" && config.allow_delete) return false;
    const regex = new RegExp(`(^|\\s)${cmd}(\\s|$)`);
    return regex.test(normalizedQuery);
  });

  const hasMultipleStatements =
    normalizedQuery.includes(";") && !normalizedQuery.endsWith(";");

  const allowed = startsWithAllowed && !containsDisallowed && !hasMultipleStatements;

  if (!allowed) {
    console.error(
      "[SQL] SQL contém comandos não permitidos ou não é permitida pela configuração atual!"
    );
  }
  return allowed;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOL_DEFINITIONS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "show_databases":
        return show_databases();
      case "show_tables":
        return show_tables(request.params.arguments);
      case "describe_table":
        return describe_table(request.params.arguments);
      case "run_query":
        return run_query(request.params.arguments);
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

process.on("SIGINT", async () => {
  console.log("[Desligando] Fechando conexão com o servidor de banco de dados");
  process.exit(0);
});

main().catch((error) => {
  console.error("Erro Fatal sem função para executar:", error);
  process.exit(1);
});

export {
  show_databases,
  show_tables,
  describe_table,
  run_query,
  isAllowedQuery,
};