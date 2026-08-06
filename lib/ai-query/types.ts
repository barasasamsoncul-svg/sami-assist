import type { Pool } from "pg";

export type QueryIntent = "chat" | "read" | "write";
export type WriteOperation = "create" | "update";

export type QueryPlan = {
  intent: QueryIntent;
  explanation: string;
  sql?: string;
  params?: unknown[];
  write?: {
    operation: WriteOperation;
    table: string;
    values?: Record<string, unknown>;
    where?: Record<string, unknown>;
  };
};

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

export type QueryContext = {
  pool: Pool;
  question: string;
  schema: string;
};
