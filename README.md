# MariaDB / MySQL Database Access MCP Server

This MCP server provides access to MariaDB / MySQL databases.

It allows you to:
- List available databases
- List tables in a database
- Describe table schemas
- Execute SQL queries

## Security Features
- **Read-only access Default**: SELECT, SHOW, DESCRIBE, and EXPLAIN
- **Query validation**: Prevents SQL injection and blocks any data modification attempts
- **Query timeout**: Prevents long-running queries from consuming resources
- **Row limit**: Prevents excessive data return

## Installation
### Option 1: Install from NPM (Recommended)
```bash
# Install globally
npm install -g mariadb-mcp-server

# Or install locally in your project
npm install mariadb-mcp-server
```

### Option 2: Build from Source
```bash
# Clone the repository
git clone https://github.com/rjsalgado/mariadb-mcp-server.git
cd mariadb-mcp-server

# Install dependencies and build
npm install
npm run build
```

### 2. Configure environment variables
The server requires the following environment variables:

- MARIADB_HOST: Database server hostname
- MARIADB_PORT: Database server port (default: 3306)
- MARIADB_USER: Database username
- MARIADB_PASSWORD: Database password
- MARIADB_DATABASE: Default database name (optional)
- MARIADB_ALLOW_INSERT: false
- MARIADB_ALLOW_UPDATE: false
- MARIADB_ALLOW_DELETE: false        


### 3. Add to MCP settings
Add the following configuration to your MCP settings file:

If you installed via npm (Option 1):
```json
{
  "mcpServers": {
    "mariadb": {
      "command": "npx",
      "args": ["mariadb-mcp-server"],
      "env": {
        "MARIADB_HOST": "your-host",
        "MARIADB_PORT": "3306",
        "MARIADB_USER": "your-user",
        "MARIADB_PASSWORD": "your-password",
        "MARIADB_DATABASE": "your-database",
        "MARIADB_ALLOW_INSERT": "false",
        "MARIADB_ALLOW_UPDATE": "false",
        "MARIADB_ALLOW_DELETE": "false"        
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

If you built from source (Option 2):
```json
{
  "mcpServers": {
    "mariadb": {
      "command": "node",
      "args": ["/path/to/mariadb-mcp-server/dist/index.js"],
      "env": {
        "MARIADB_HOST": "your-host",
        "MARIADB_PORT": "3306",
        "MARIADB_USER": "your-user",
        "MARIADB_PASSWORD": "your-password",
        "MARIADB_DATABASE": "your-default-database",
        "MARIADB_ALLOW_INSERT": "false",
        "MARIADB_ALLOW_UPDATE": "false",
        "MARIADB_ALLOW_DELETE": "false"        
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Available Tools
**"server_name": "mariadb"** or **"server_name": "mysql"** 


### list_databases
Lists all accessible databases on the MariaDB / MySQL server.
**Parameters**: None

**Example**:
```json
{
  "server_name": "mariadb",
  "tool_name": "list_databases",
  "arguments": {}
}
```

### list_tables
Lists all tables in a specified database.

**Parameters**:
- `database` (optional): Database name (uses default if not specified)

**Example**:
```json
{
  "server_name": "mariadb",
  "tool_name": "list_tables",
  "arguments": {
    "database": "my_database"
  }
}
```

### describe_table
Shows the schema for a specific table.

**Parameters**:
- `database` (optional): Database name (uses default if not specified)
- `table` (required): Table name

**Example**:
```json
{
  "server_name": "mariadb",
  "tool_name": "describe_table",
  "arguments": {
    "database": "my_database",
    "table": "my_table"
  }
}
```

### execute_query
Executes a SQL query.

**Parameters**:
- `query` (required): SQL query
- `database` (optional): Database name (uses default if not specified)

**Example**:
```json
{
  "server_name": "mariadb",
  "tool_name": "execute_query",
  "arguments": {
    "database": "my_database",
    "query": "SELECT * FROM my_table LIMIT 10"
  }
}
```

## Testing
The server includes test scripts to verify functionality with your MariaDB / MySQL setup:

### 1. Setup Test Database
This script creates a test database, table, and sample data:

```bash
# Set your MariaDB / MySQL credentials as environment variables
export MARIADB_HOST=localhost
export MARIADB_PORT=3306
export MARIADB_USER=your_username
export MARIADB_PASSWORD=your_password
export MARIADB_ALLOW_INSERT: false
export MARIADB_ALLOW_UPDATE: false
export MARIADB_ALLOW_DELETE: false


# Run the setup script
npm run test:setup
```

### 2. Test MCP Tools
This script tests each of the MCP tools against the test database:

```bash
# Set your MariaDB / MySQL credentials as environment variables
export MARIADB_HOST=localhost
export MARIADB_PORT=3306
export MARIADB_USER=your_username
export MARIADB_PASSWORD=your_password
export MARIADB_DATABASE=mcp_test_db
export MARIADB_ALLOW_INSERT: false
export MARIADB_ALLOW_UPDATE: false
export MARIADB_ALLOW_DELETE: false


# Run the tools test script
npm run test:tools
```

### 3. Run All Tests
To run both setup and tool tests:

```bash
# Set your MariaDB / MySQL credentials as environment variables
export MARIADB_HOST=localhost
export MARIADB_PORT=3306
export MARIADB_USER=your_username
export MARIADB_PASSWORD=your_password
export MARIADB_ALLOW_INSERT: false
export MARIADB_ALLOW_UPDATE: false
export MARIADB_ALLOW_DELETE: false

# Run all tests
npm test
```

## Troubleshooting
If you encounter issues:

1. Check the server logs for error messages
2. Verify your MariaDB/MySQL credentials and connection details
3. Ensure your MariaDB/MySQL user has appropriate permissions
4. Check that your query is read-only and properly formatted


**Inspiration**
**https://github.com/dpflucas/mysql-mcp-server**

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
