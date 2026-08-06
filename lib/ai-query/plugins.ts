export type QueryPlugin = {
  key: string;
  tables: string[];
};

export const QUERY_PLUGINS: QueryPlugin[] = [
  { key: "crm", tables: ["leads", "opportunities", "crm_activities"] },
  { key: "customers", tables: ["customers"] },
  { key: "sales", tables: ["quotations", "quotation_items", "sales_orders", "sales_order_items"] },
  { key: "invoices", tables: ["invoices", "invoice_items", "payments"] },
  { key: "products", tables: ["products"] },
  { key: "inventory", tables: ["products", "warehouses", "stock_levels", "stock_movements"] },
];
