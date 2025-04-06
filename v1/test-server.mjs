import {
  show_databases,
  show_tables,
  describe_table,
  run_query,
} from "./server-mcp.mjs";

// ======= CONFIGURAÇÃO DOS TESTES =======
// Informe aqui o banco de dados e tabela que deseja testar
const TEST_DATABASE = "anestesia";
const TEST_TABLE = "medicos";
// =======================================

async function testShowDatabases() {
  console.log("Testando show_databases...");
  try {
    const result = await show_databases();
    console.log("Resultado:", result);
  } catch (error) {
    console.error("Erro:", error);
  }
}

async function testShowTables() {
  console.log("Testando show_tables...");
  try {
    const result = await show_tables({ database: TEST_DATABASE });
    console.log("Resultado:", result);
  } catch (error) {
    console.error("Erro:", error);
  }
}

async function testDescribeTable() {
  console.log("Testando describe_table...");
  try {
    const result = await describe_table({ database: TEST_DATABASE, table: TEST_TABLE });
    console.log("Resultado:", result);
  } catch (error) {
    console.error("Erro:", error);
  }
}

async function testRunQuery() {
  console.log("Testando run_query...");
  try {
    const result = await run_query({ database: TEST_DATABASE, sql: `SELECT * FROM \`${TEST_TABLE}\` LIMIT 5` });
    console.log("Resultado:", result);
  } catch (error) {
    console.error("Erro:", error);
  }
}

async function runAllTests() {
  await testShowDatabases();
//  await testShowTables();
//  await testDescribeTable();
//  await testRunQuery();
}

runAllTests().catch((error) => {
  console.error("Erro inesperado nos testes:", error);
});