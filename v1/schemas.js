import { z } from "zod";

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

export { schemas, schemasConfig };