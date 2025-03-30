#!/usr/bin/env node

/**
 * Test script for MariaDB MCP server tools
 * 
 * This script tests each of the MCP tools:
 * 1. list_databases
 * 2. list_tables
 * 3. describe_table
 * 4. execute_query
 * 
 * Usage:
 *   node test-tools.js
 * 
 * Environment variables:
 *   MARIADB_HOST - host (default: localhost)
 *   MARIADB_PORT - port (default: 3306)
 *   MARIADB_USER - username
 *   MARIADB_PASSWORD - password
 *   MARIADB_DATABASE - database
 *   MARIADB_ALLOW_INSERT - false
 *   MARIADB_ALLOW_UPDATE - false
 *   MARIADB_ALLOW_DELETE - false
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the built MCP server
const SERVER_PATH = resolve(__dirname, 'dist/index.js');

// Configuration from environment variables
const config = {
  host: process.env.MARIADB_HOST || 'localhost',
  port: process.env.MARIADB_PORT || '3306',
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE || 'teste_db',
  allowInsert: process.env.MARIADB_ALLOW_INSERT !== 'false',
  allowUpdate: process.env.MARIADB_ALLOW_UPDATE !== 'false',
  allowDelete: process.env.MARIADB_ALLOW_DELETE !== 'false',
};

// Check required environment variables
if (!config.user || !config.password) {
  console.error('Error: MARIADB_USER and MARIADB_PASSWORD environment variables are required');
  console.error('Example usage:');
  console.error('  MARIADB_USER=root MARIADB_PASSWORD=password node test-tools.js');
  process.exit(1);
}

// MCP message IDs
let messageId = 1;

/**
 * Main function
 */
async function main() {
  console.log('MariaDB MCP Server Tool Tests');
  console.log('==========================');
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`User: ${config.user}`);
  console.log(`Database: ${config.database}`);
  console.log(`Allow Insert: ${config.allowInsert}`);
  console.log(`Allow Update: ${config.allowUpdate}`);
  console.log(`Allow Delete: ${config.allowDelete}`);
  console.log();

  // Start the MCP server
  console.log('Starting MCP server...');
  const server = startServer();
  
  try {
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test list_databases
    console.log('\n1. Testing list_databases tool...');
    const databases = await callTool(server, 'list_databases', {});
    console.log('Result:', JSON.stringify(databases, null, 2));
    
    const table = 'users';
    // Test list_tables
    console.log('\n2. Testing list_tables tool...');
    const tables = await callTool(server, 'list_tables', { database: config.database });
    console.log('Result:', JSON.stringify(tables, null, 2));
    
    // Test describe_table
    console.log('\n3. Testing describe_table tool...');
    const tableSchema = await callTool(server, 'describe_table', { 
      database: config.database,
      table
    });
    console.log('Result:', JSON.stringify(tableSchema, null, 2));
    
    // Test execute_query
    console.log('\n4. Testing execute_query tool...');
    const queryResult = await callTool(server, 'execute_query', {
      database: config.database,
      query: `SELECT * FROM ${table} LIMIT 3`
    });
    console.log('Result:', JSON.stringify(queryResult, null, 2));
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    // Kill the server
    server.kill();
  }
}

/**
 * Start the MCP server
 */
function startServer() {
  const env = {
    ...process.env,
    MARIADB_HOST: config.host,
    MARIADB_PORT: config.port,
    MARIADB_USER: config.user,
    MARIADB_PASSWORD: config.password,
    MARIADB_DATABASE: config.database,
    MARIADB_ALLOW_INSERT: String(config.allowInsert),
    MARIADB_ALLOW_UPDATE: String(config.allowUpdate),
    MARIADB_ALLOW_DELETE: String(config.allowDelete),
  };
  
  const server = spawn('node', [SERVER_PATH], { env });
  
  server.stderr.on('data', (data) => {
    // Show server logs
    console.error(`Server: ${data}`);
  });
  
  return server;
}

/**
 * Call an MCP tool
 */
async function callTool(server, toolName, args) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    
    // Create MCP request
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };
    
    // Send request to server
    const requestStr = JSON.stringify(request);
    console.log(`Sending request: ${requestStr}`);
    server.stdin.write(requestStr + '\n');
    
    // Handle response
    const onData = (data) => {
      try {
        const dataStr = data.toString().trim();
        console.log(`Received data: ${dataStr}`);
        
        const responses = dataStr.split('\n');
        
        for (const responseStr of responses) {
          if (!responseStr) continue;
          
          console.log(`Processing response: ${responseStr}`);
          const response = JSON.parse(responseStr);
          
          if (response.id === id) {
            server.stdout.removeListener('data', onData);
            
            if (response.error) {
              console.log(`Error response: ${JSON.stringify(response.error)}`);
              reject(new Error(response.error.message));
            } else {
              console.log(`Success response: ${JSON.stringify(response.result)}`);
              // Parse the text content from the response
              try {
                const content = response.result.content[0].text;
                resolve(JSON.parse(content));
              } catch (e) {
                console.log(`Failed to parse content: ${e.message}`);
                resolve(response.result);
              }
            }
          }
        }
      } catch (error) {
        console.log(`Error processing response: ${error.message}`);
        reject(error);
      }
    };
    
    server.stdout.on('data', onData);
    
    // Set timeout
    setTimeout(() => {
      server.stdout.removeListener('data', onData);
      reject(new Error(`Timeout waiting for response to ${toolName}`));
    }, 5000);
  });
}

// Run the main function
main().catch(console.error);
