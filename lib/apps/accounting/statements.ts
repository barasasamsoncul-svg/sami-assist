import "server-only";

import {
  createHash,
} from "node:crypto";

import type {
  PoolClient,
} from "pg";

import {
  requireEnterpriseModuleTableContext,
} from "@/lib/apps/enterprise/service";
import {
  recordWorkspaceAuditEvent,
} from "@/lib/services/workspace-activity";
import {
  AccountingInputError,
  accountingId,
  decimalAmount,
} from "./validation";
import { convertForeignToBase } from "./fx-rules";
import type {
  AccountingStatementSourceType,
  AccountingStatementsWorkspace,
} from "./statements-types";


type NormalizedStatementTransaction = {
  transactionDate: string;
  valueDate: string | null;
  description: string;
  externalReference: string | null;
  externalTransactionId: string | null;
  counterparty: string | null;
  amount: string;
  raw: Record<string, unknown>;
};


function bodyOf(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountingInputError("Enter valid bank-statement data.");
  }
  return input as Record<string, unknown>;
}


function shortText(
  value: unknown,
  max: number,
  label: string,
  required = false,
) {
  if (value != null && typeof value !== "string") {
    throw new AccountingInputError(label + " must contain text.");
  }

  const result = typeof value === "string" ? value.trim() : "";

  if (required && !result) {
    throw new AccountingInputError(label + " is required.");
  }

  if (result.length > max) {
    throw new AccountingInputError(
      label + " must not exceed " + max + " characters.",
    );
  }

  return result;
}


function optionalText(
  value: unknown,
  max: number,
  label: string,
) {
  return shortText(value,max,label) || null;
}


function requestKey(value: unknown) {
  try {
    return accountingId(value);
  } catch {
    throw new AccountingInputError("A valid statement request key is required.");
  }
}


function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}


function requestHash(value: unknown) {
  return sha256(JSON.stringify(value));
}


function sourceType(value: unknown): AccountingStatementSourceType {
  const type = String(value || "").trim().toLowerCase();

  if (
    type !== "csv" &&
    type !== "ofx" &&
    type !== "qif" &&
    type !== "feed" &&
    type !== "manual"
  ) {
    throw new AccountingInputError(
      "Choose CSV, OFX, QIF, feed or manual statement source.",
    );
  }

  return type;
}


function signedCents(value: unknown) {
  const raw = String(value ?? "").trim().replace(/,/g,"");

  if (!/^[+-]?\d{1,18}(?:\.\d{1,8})?$/.test(raw)) {
    throw new AccountingInputError("Statement amount is not a valid decimal.");
  }

  const negative = raw.startsWith("-");
  const unsigned =
    raw.startsWith("-") || raw.startsWith("+")
      ? raw.slice(1)
      : raw;

  const [whole,fraction=""] = unsigned.split(".");
  const padded = fraction.padEnd(3,"0");

  let amount =
    BigInt(whole || "0") * BigInt(100) +
    BigInt(padded.slice(0,2) || "0");

  if (Number(padded[2] || "0") >= 5) {
    amount += BigInt(1);
  }

  return negative ? -amount : amount;
}


function dateValue(
  value: unknown,
  format: "auto" | "ymd" | "dmy" | "mdy" = "auto",
) {
  const raw = String(value || "").trim();

  if (!raw) {
    throw new AccountingInputError("Statement transaction date is required.");
  }

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) {
    return validDate(compact[1],compact[2],compact[3],raw);
  }

  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    return validDate(iso[1],iso[2],iso[3],raw);
  }

  const local = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (local) {
    const selected =
      format === "mdy"
        ? { y:local[3],m:local[1],d:local[2] }
        : { y:local[3],m:local[2],d:local[1] };

    if (format === "auto" && Number(local[1]) <= 12 && Number(local[2]) <= 12) {
      throw new AccountingInputError(
        "Ambiguous statement date '" + raw + "'. Choose DMY or MDY explicitly.",
      );
    }

    return validDate(selected.y,selected.m,selected.d,raw);
  }

  throw new AccountingInputError(
    "Unsupported statement date '" + raw + "'. Use YYYY-MM-DD, YYYYMMDD, DMY or MDY.",
  );
}


function validDate(
  year: string,
  month: string,
  day: string,
  raw: string,
) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(Date.UTC(y,m-1,d));

  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m-1 ||
    date.getUTCDate() !== d
  ) {
    throw new AccountingInputError("Invalid statement date '" + raw + "'.");
  }

  return [
    String(y).padStart(4,"0"),
    String(m).padStart(2,"0"),
    String(d).padStart(2,"0"),
  ].join("-");
}


function pageValue(value: unknown) {
  const page = Number(value || 1);
  return Number.isInteger(page) && page > 0 ? Math.min(page,100000) : 1;
}


function csvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i=0;i<content.length;i+=1) {
    const char = content[i];

    if (quoted) {
      if (char === '"' && content[i+1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/,""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new AccountingInputError("CSV contains an unterminated quoted field.");
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/,""));
    rows.push(row);
  }

  return rows.filter(candidate =>
    candidate.some(value => value.trim().length > 0)
  );
}


function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
}


const HEADER_ALIASES = {
  date: ["date","transactiondate","postingdate","posteddate","transdate"],
  valueDate: ["valuedate","valuedt","settlementdate"],
  description: ["description","details","narration","memo","particulars","transactiondetails"],
  amount: ["amount","transactionamount","amt"],
  debit: ["debit","withdrawal","moneyout","paidout"],
  credit: ["credit","deposit","moneyin","paidin"],
  reference: ["reference","ref","transactionreference","checknum","chequenumber"],
  transactionId: ["transactionid","transaction_id","id","fitid","externalid"],
  counterparty: ["counterparty","payee","payer","merchant","name"],
} as const;


function findHeader(
  headers: string[],
  configured: unknown,
  aliases: readonly string[],
) {
  const explicit = String(configured || "").trim();

  if (explicit) {
    const index = headers.findIndex(header =>
      header === normalizedHeader(explicit)
    );

    if (index < 0) {
      throw new AccountingInputError(
        "CSV column '" + explicit + "' was not found.",
      );
    }

    return index;
  }

  return headers.findIndex(header => aliases.some(alias => alias === header));
}


export function parseCsv(
  content: string,
  mappingInput: unknown,
): NormalizedStatementTransaction[] {
  const rows = csvRows(content);

  if (rows.length < 2) {
    throw new AccountingInputError("CSV must contain a header and at least one transaction.");
  }

  const headers = rows[0].map(normalizedHeader);
  const mapping =
    mappingInput && typeof mappingInput === "object" && !Array.isArray(mappingInput)
      ? mappingInput as Record<string,unknown>
      : {};

  const dateIndex = findHeader(headers,mapping.dateColumn,HEADER_ALIASES.date);
  const valueDateIndex = findHeader(headers,mapping.valueDateColumn,HEADER_ALIASES.valueDate);
  const descriptionIndex = findHeader(headers,mapping.descriptionColumn,HEADER_ALIASES.description);
  const amountIndex = findHeader(headers,mapping.amountColumn,HEADER_ALIASES.amount);
  const debitIndex = findHeader(headers,mapping.debitColumn,HEADER_ALIASES.debit);
  const creditIndex = findHeader(headers,mapping.creditColumn,HEADER_ALIASES.credit);
  const referenceIndex = findHeader(headers,mapping.referenceColumn,HEADER_ALIASES.reference);
  const transactionIdIndex = findHeader(headers,mapping.transactionIdColumn,HEADER_ALIASES.transactionId);
  const counterpartyIndex = findHeader(headers,mapping.counterpartyColumn,HEADER_ALIASES.counterparty);

  if (dateIndex < 0) {
    throw new AccountingInputError("CSV needs a transaction-date column.");
  }

  if (amountIndex < 0 && debitIndex < 0 && creditIndex < 0) {
    throw new AccountingInputError(
      "CSV needs either one signed amount column or debit/credit columns.",
    );
  }

  const dateFormatRaw = String(mapping.dateFormat || "auto").toLowerCase();
  const dateFormat =
    dateFormatRaw === "dmy" || dateFormatRaw === "mdy" || dateFormatRaw === "ymd"
      ? dateFormatRaw
      : "auto";

  return rows.slice(1).map((row,index) => {
    const amount =
      amountIndex >= 0
        ? signedCents(row[amountIndex])
        : signedCents(row[creditIndex] || "0") - signedCents(row[debitIndex] || "0");

    if (amount === BigInt(0)) {
      throw new AccountingInputError(
        "CSV row " + (index+2) + " has a zero transaction amount.",
      );
    }

    const description =
      descriptionIndex >= 0
        ? String(row[descriptionIndex] || "").trim()
        : "";

    return {
      transactionDate: dateValue(row[dateIndex],dateFormat),
      valueDate:
        valueDateIndex >= 0 && String(row[valueDateIndex] || "").trim()
          ? dateValue(row[valueDateIndex],dateFormat)
          : null,
      description: description || "Bank transaction",
      externalReference:
        referenceIndex >= 0
          ? String(row[referenceIndex] || "").trim() || null
          : null,
      externalTransactionId:
        transactionIdIndex >= 0
          ? String(row[transactionIdIndex] || "").trim() || null
          : null,
      counterparty:
        counterpartyIndex >= 0
          ? String(row[counterpartyIndex] || "").trim() || null
          : null,
      amount: decimalAmount(amount),
      raw: Object.fromEntries(
        headers.map((header,column) => [header || "column_"+column,row[column] ?? ""]),
      ),
    };
  });
}


function tagValue(block: string, tag: string) {
  const xml = block.match(new RegExp("<"+tag+"[^>]*>([^<\\r\\n]+)","i"));
  if (xml) return xml[1].trim();

  const sgml = block.match(new RegExp("<"+tag+">([^<\\r\\n]+)","i"));
  return sgml ? sgml[1].trim() : "";
}


export function parseOfx(content: string): NormalizedStatementTransaction[] {
  const blocks =
    content.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ||
    content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ||
    [];

  if (!blocks.length) {
    throw new AccountingInputError("OFX file contains no statement transactions.");
  }

  return blocks.map((block,index) => {
    const amount = signedCents(tagValue(block,"TRNAMT"));

    if (amount === BigInt(0)) {
      throw new AccountingInputError("OFX transaction " + (index+1) + " has a zero amount.");
    }

    const memo = tagValue(block,"MEMO");
    const name = tagValue(block,"NAME");

    return {
      transactionDate: dateValue(tagValue(block,"DTPOSTED"),"ymd"),
      valueDate: tagValue(block,"DTUSER")
        ? dateValue(tagValue(block,"DTUSER"),"ymd")
        : null,
      description: memo || name || tagValue(block,"TRNTYPE") || "OFX transaction",
      externalReference: tagValue(block,"CHECKNUM") || null,
      externalTransactionId: tagValue(block,"FITID") || null,
      counterparty: name || null,
      amount: decimalAmount(amount),
      raw: {
        trnType: tagValue(block,"TRNTYPE") || null,
        name: name || null,
        memo: memo || null,
      },
    };
  });
}


export function parseQif(
  content: string,
  dateFormat: "auto" | "ymd" | "dmy" | "mdy" = "mdy",
): NormalizedStatementTransaction[] {
  const cleaned = content
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith("!Type:"))
    .join("\n");

  const entries = cleaned
    .split(/^\^\s*$/m)
    .map(value => value.trim())
    .filter(value => value && !value.startsWith("!Type:"));

  if (!entries.length) {
    throw new AccountingInputError("QIF file contains no statement transactions.");
  }

  return entries.map((entry,index) => {
    const values = new Map<string,string>();

    for (const line of entry.split(/\r?\n/)) {
      if (!line) continue;
      const key = line[0];
      const value = line.slice(1).trim();
      if (!values.has(key)) values.set(key,value);
    }

    const amount = signedCents(values.get("T") || "");

    if (amount === BigInt(0)) {
      throw new AccountingInputError("QIF transaction " + (index+1) + " has a zero amount.");
    }

    const payee = values.get("P") || null;
    const memo = values.get("M") || "";

    return {
      transactionDate: dateValue(values.get("D") || "",dateFormat),
      valueDate: null,
      description: memo || payee || "QIF transaction",
      externalReference: values.get("N") || null,
      externalTransactionId: null,
      counterparty: payee,
      amount: decimalAmount(amount),
      raw: Object.fromEntries(values.entries()),
    };
  });
}


function normalizedFeedTransactions(
  value: unknown,
): NormalizedStatementTransaction[] {
  if (!Array.isArray(value) || !value.length || value.length > 10000) {
    throw new AccountingInputError(
      "Feed import needs between 1 and 10,000 normalized transactions.",
    );
  }

  return value.map((raw,index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new AccountingInputError("Feed transaction " + (index+1) + " is invalid.");
    }

    const row = raw as Record<string,unknown>;
    const amount = signedCents(row.amount);

    if (amount === BigInt(0)) {
      throw new AccountingInputError("Feed transaction " + (index+1) + " has a zero amount.");
    }

    return {
      transactionDate: dateValue(row.transactionDate,"ymd"),
      valueDate: row.valueDate ? dateValue(row.valueDate,"ymd") : null,
      description: shortText(row.description,2000,"Description",true),
      externalReference: optionalText(row.externalReference,255,"Reference"),
      externalTransactionId: optionalText(row.externalTransactionId,255,"Transaction ID"),
      counterparty: optionalText(row.counterparty,255,"Counterparty"),
      amount: decimalAmount(amount),
      raw: row,
    };
  });
}


function fingerprint(
  transaction: NormalizedStatementTransaction,
) {
  return requestHash({
    transactionDate: transaction.transactionDate,
    valueDate: transaction.valueDate,
    description: transaction.description.trim().toLowerCase(),
    externalReference: transaction.externalReference?.trim().toLowerCase() || null,
    counterparty: transaction.counterparty?.trim().toLowerCase() || null,
    amount: transaction.amount,
  });
}


async function financialAccount(
  client: PoolClient,
  companyId: string,
  id: string,
) {
  const result = await client.query(
    `SELECT b.id::text,b.name,b.account_type,b.currency,b.status,c.currency AS company_currency
     FROM accounting_bank_accounts b
     JOIN companies c ON c.id=b.company_id
     WHERE b.company_id=$1 AND b.id=$2 AND b.deleted_at IS NULL
     LIMIT 1`,
    [companyId,id],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AccountingInputError("Financial account not found.");
  }

  if (row.status !== "active") {
    throw new AccountingInputError("Statements can only be imported into an active financial account.");
  }

  return row;
}


async function statementRate(
  client: PoolClient,
  companyId: string,
  accountCurrency: string,
  baseCurrency: string,
  transactionDate: string,
) {
  if (accountCurrency === baseCurrency) return "1.00000000";

  const result = await client.query(
    `SELECT rate_to_base::text
     FROM accounting_exchange_rates
     WHERE company_id=$1
       AND currency=$2
       AND base_currency=$3
       AND is_active=TRUE
       AND effective_date<=$4
       AND rate_type='spot'
     ORDER BY effective_date DESC,
       CASE source_type WHEN 'manual' THEN 0 WHEN 'provider' THEN 1 WHEN 'invoicing' THEN 2 ELSE 3 END,
       id DESC
     LIMIT 1`,
    [companyId,accountCurrency,baseCurrency,transactionDate],
  );

  if (!result.rows[0]) {
    throw new AccountingInputError(
      "No spot exchange rate is available for " +
      accountCurrency + "/" + baseCurrency +
      " on or before " + transactionDate + ". Add the rate in Accounting → Foreign Currency.",
    );
  }

  return String(result.rows[0].rate_to_base);
}


async function createImportBatch(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    bankAccountId: string;
    feedConnectionId?: string | null;
    key: string;
    hash: string;
    sourceType: AccountingStatementSourceType;
    filename?: string | null;
    sourceSha?: string | null;
    statementFrom?: string | null;
    statementTo?: string | null;
    openingBalance?: string | null;
    closingBalance?: string | null;
    currency: string;
  },
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    ["accounting:statement-import:"+input.key],
  );

  const replay = await client.query(
    `SELECT id::text,request_hash,status
     FROM accounting_statement_import_batches
     WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL
     LIMIT 1`,
    [input.companyId,input.key],
  );

  if (replay.rows[0]) {
    if (String(replay.rows[0].request_hash) !== input.hash) {
      throw new AccountingInputError(
        "This statement request key was already used with different content.",
      );
    }

    return {
      id:String(replay.rows[0].id),
      replayed:true,
    };
  }

  if (input.sourceSha) {
    const sameFile = await client.query(
      `SELECT id::text
       FROM accounting_statement_import_batches
       WHERE company_id=$1
         AND bank_account_id=$2
         AND source_sha256=$3
         AND deleted_at IS NULL
         AND status <> 'cancelled'
       LIMIT 1`,
      [input.companyId,input.bankAccountId,input.sourceSha],
    );

    if (sameFile.rows[0]) {
      return {
        id:String(sameFile.rows[0].id),
        replayed:true,
      };
    }
  }

  const result = await client.query(
    `INSERT INTO accounting_statement_import_batches (
       company_id,bank_account_id,feed_connection_id,request_key,request_hash,
       source_type,source_filename,source_sha256,statement_from,statement_to,
       opening_balance,closing_balance,currency,status,imported_by,created_by,updated_by
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'imported',$14,$14,$14
     )
     RETURNING id::text`,
    [
      input.companyId,input.bankAccountId,input.feedConnectionId || null,
      input.key,input.hash,input.sourceType,input.filename || null,input.sourceSha || null,
      input.statementFrom || null,input.statementTo || null,
      input.openingBalance || null,input.closingBalance || null,input.currency,input.userId,
    ],
  );

  return {
    id:String(result.rows[0].id),
    replayed:false,
  };
}


async function importNormalizedTransactions(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    bankAccountId: string;
    batchId: string;
    sourceType: AccountingStatementSourceType;
    accountCurrency: string;
    baseCurrency: string;
    transactions: NormalizedStatementTransaction[];
  },
) {
  if (input.transactions.length > 10000) {
    throw new AccountingInputError("One statement import cannot exceed 10,000 transactions.");
  }

  let imported = 0;
  let duplicates = 0;
  let errors = 0;

  for (let index=0;index<input.transactions.length;index+=1) {
    const transaction = input.transactions[index];
    const rowNumber = index+1;
    const fp = fingerprint(transaction);
    const savepoint = "statement_import_row_" + rowNumber;

    await client.query("SAVEPOINT " + savepoint);

    try {
      const exchangeRate = await statementRate(
        client,input.companyId,input.accountCurrency,input.baseCurrency,transaction.transactionDate,
      );
      const baseAmount = convertForeignToBase(transaction.amount,exchangeRate);

      const duplicate = await client.query(
        `SELECT id::text
         FROM accounting_bank_statement_lines
         WHERE company_id=$1
           AND bank_account_id=$2
           AND deleted_at IS NULL
           AND (
             ($3::varchar IS NOT NULL AND external_transaction_id=$3)
             OR fingerprint=$4
           )
         ORDER BY created_at,id
         LIMIT 1`,
        [
          input.companyId,
          input.bankAccountId,
          transaction.externalTransactionId,
          fp,
        ],
      );

      if (duplicate.rows[0]) {
        await client.query(
          `INSERT INTO accounting_statement_import_rows (
             company_id,batch_id,row_number,transaction_date,value_date,description,
             external_reference,external_transaction_id,counterparty,amount,fingerprint,
             currency,exchange_rate,base_amount,
             import_status,duplicate_of_line_id,raw_payload,created_by,updated_by
           )
           VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'duplicate',$15,$16::jsonb,$17,$17
           )`,
          [
            input.companyId,input.batchId,rowNumber,transaction.transactionDate,
            transaction.valueDate,transaction.description,transaction.externalReference,
            transaction.externalTransactionId,transaction.counterparty,transaction.amount,
            fp,input.accountCurrency,exchangeRate,baseAmount,
            String(duplicate.rows[0].id),JSON.stringify(transaction.raw),input.userId,
          ],
        );
        await client.query("RELEASE SAVEPOINT " + savepoint);
        duplicates += 1;
        continue;
      }

      const importedRow = await client.query(
        `INSERT INTO accounting_statement_import_rows (
           company_id,batch_id,row_number,transaction_date,value_date,description,
           external_reference,external_transaction_id,counterparty,amount,fingerprint,
           currency,exchange_rate,base_amount,
           import_status,raw_payload,created_by,updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15::jsonb,$16,$16
         )
         RETURNING id::text`,
        [
          input.companyId,input.batchId,rowNumber,transaction.transactionDate,
          transaction.valueDate,transaction.description,transaction.externalReference,
          transaction.externalTransactionId,transaction.counterparty,transaction.amount,
          fp,input.accountCurrency,exchangeRate,baseAmount,JSON.stringify(transaction.raw),input.userId,
        ],
      );

      const rowId = String(importedRow.rows[0].id);
      const line = await client.query(
        `INSERT INTO accounting_bank_statement_lines (
           company_id,bank_account_id,transaction_date,description,external_reference,amount,
           reconciliation_status,import_batch_id,import_row_id,source_type,
           external_transaction_id,fingerprint,value_date,counterparty,raw_details,
           currency,exchange_rate,base_amount,created_by,updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,'unmatched',$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$18
         )
         RETURNING id::text`,
        [
          input.companyId,input.bankAccountId,transaction.transactionDate,
          transaction.description,transaction.externalReference,transaction.amount,
          input.batchId,rowId,input.sourceType,transaction.externalTransactionId,fp,
          transaction.valueDate,transaction.counterparty,JSON.stringify(transaction.raw),
          input.accountCurrency,exchangeRate,baseAmount,input.userId,
        ],
      );

      await client.query(
        `UPDATE accounting_statement_import_rows
         SET import_status='imported',statement_line_id=$4,updated_by=$5,updated_at=NOW()
         WHERE company_id=$1 AND batch_id=$2 AND id=$3`,
        [input.companyId,input.batchId,rowId,String(line.rows[0].id),input.userId],
      );
      await client.query("RELEASE SAVEPOINT " + savepoint);
      imported += 1;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT " + savepoint);
      await client.query(
        `INSERT INTO accounting_statement_import_rows (
           company_id,batch_id,row_number,transaction_date,value_date,description,
           external_reference,external_transaction_id,counterparty,amount,fingerprint,
           import_status,error_message,raw_payload,created_by,updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'error',$12,$13::jsonb,$14,$14
         )
         ON CONFLICT (company_id,batch_id,row_number)
         WHERE deleted_at IS NULL
         DO UPDATE SET
           import_status='error',
           error_message=EXCLUDED.error_message,
           updated_by=EXCLUDED.updated_by,
           updated_at=NOW()`,
        [
          input.companyId,input.batchId,rowNumber,transaction.transactionDate,
          transaction.valueDate,transaction.description,transaction.externalReference,
          transaction.externalTransactionId,transaction.counterparty,transaction.amount,
          fp,error instanceof Error ? error.message : "Import row failed",
          JSON.stringify(transaction.raw),input.userId,
        ],
      );
      await client.query("RELEASE SAVEPOINT " + savepoint);
      errors += 1;
    }
  }

  const status =
    errors > 0
      ? imported > 0 || duplicates > 0
        ? "partial"
        : "rejected"
      : "imported";

  await client.query(
    `UPDATE accounting_statement_import_batches
     SET total_rows=$3,imported_rows=$4,duplicate_rows=$5,error_rows=$6,status=$7,
         updated_by=$8,updated_at=NOW()
     WHERE company_id=$1 AND id=$2`,
    [
      input.companyId,input.batchId,input.transactions.length,imported,
      duplicates,errors,status,input.userId,
    ],
  );

  return { imported,duplicates,errors,status };
}


export async function getAccountingStatements(
  input: { batchId?: unknown; page?: unknown } = {},
): Promise<AccountingStatementsWorkspace> {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_statement_import_batches",
    "report",
  );
  const page = pageValue(input.page);
  const batchId = input.batchId ? accountingId(input.batchId) : null;
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const [accounts,batches,connections,metrics] = await Promise.all([
      client.query(
        `SELECT id::text,name,account_type,currency,status
         FROM accounting_bank_accounts
         WHERE company_id=$1 AND deleted_at IS NULL
         ORDER BY status,account_type,name,id`,
        [context.companyId],
      ),
      client.query(
        `SELECT b.id::text,b.bank_account_id::text,a.name AS bank_account_name,b.source_type,
                b.source_filename,b.statement_from::text,b.statement_to::text,
                b.opening_balance::text,b.closing_balance::text,b.currency,b.total_rows,b.imported_rows,
                b.duplicate_rows,b.error_rows,b.status,b.imported_at::text
         FROM accounting_statement_import_batches b
         JOIN accounting_bank_accounts a
           ON a.company_id=b.company_id AND a.id=b.bank_account_id AND a.deleted_at IS NULL
         WHERE b.company_id=$1 AND b.deleted_at IS NULL
         ORDER BY b.imported_at DESC,b.created_at DESC,b.id DESC
         LIMIT 50 OFFSET $2`,
        [context.companyId,(page-1)*50],
      ),
      client.query(
        `SELECT c.id::text,c.bank_account_id::text,a.name AS bank_account_name,
                c.provider_key,c.provider_label,c.external_account_reference,c.status,
                c.last_synced_at::text,c.last_error
         FROM accounting_bank_feed_connections c
         JOIN accounting_bank_accounts a
           ON a.company_id=c.company_id AND a.id=c.bank_account_id AND a.deleted_at IS NULL
         WHERE c.company_id=$1 AND c.deleted_at IS NULL
         ORDER BY c.status,c.provider_label,a.name,c.id`,
        [context.companyId],
      ),
      client.query(
        `SELECT
           COALESCE(SUM(imported_rows) FILTER (
             WHERE imported_at >= DATE_TRUNC('month',CURRENT_DATE)
           ),0)::int AS imported_this_month,
           COALESCE(SUM(duplicate_rows) FILTER (
             WHERE imported_at >= DATE_TRUNC('month',CURRENT_DATE)
           ),0)::int AS duplicates_this_month,
           COALESCE(SUM(error_rows) FILTER (
             WHERE imported_at >= DATE_TRUNC('month',CURRENT_DATE)
           ),0)::int AS errors_this_month,
           (
             SELECT COUNT(*)::int
             FROM accounting_bank_feed_connections
             WHERE company_id=$1 AND deleted_at IS NULL AND status='active'
           ) AS active_feeds
         FROM accounting_statement_import_batches
         WHERE company_id=$1 AND deleted_at IS NULL`,
        [context.companyId],
      ),
    ]);

    const selectedBatchId =
      batchId ||
      (batches.rows[0] ? String(batches.rows[0].id) : null);

    const rows = selectedBatchId
      ? await client.query(
          `SELECT id::text,batch_id::text,row_number,transaction_date::text,value_date::text,
                  description,external_reference,external_transaction_id,counterparty,amount::text,
                  currency,exchange_rate::text,base_amount::text,
                  import_status,error_message,statement_line_id::text,duplicate_of_line_id::text
           FROM accounting_statement_import_rows
           WHERE company_id=$1 AND batch_id=$2 AND deleted_at IS NULL
           ORDER BY row_number
           LIMIT 500`,
          [context.companyId,selectedBatchId],
        )
      : { rows: [] };

    await client.query("COMMIT");

    const m = metrics.rows[0] || {};

    return {
      companyId:context.companyId,
      currency:context.company.currentCompany.currency,
      accounts:accounts.rows as AccountingStatementsWorkspace["accounts"],
      batches:batches.rows as AccountingStatementsWorkspace["batches"],
      rows:rows.rows as AccountingStatementsWorkspace["rows"],
      connections:connections.rows as AccountingStatementsWorkspace["connections"],
      metrics:{
        importedThisMonth:Number(m.imported_this_month || 0),
        duplicatesThisMonth:Number(m.duplicates_this_month || 0),
        errorsThisMonth:Number(m.errors_this_month || 0),
        activeFeeds:Number(m.active_feeds || 0),
      },
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function importStatementFile(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_statement_import_batches",
    "create",
  );
  const body = bodyOf(input);
  const bankAccountId = accountingId(body.bankAccountId);
  const key = requestKey(body.requestKey);
  const type = sourceType(body.sourceType);

  if (type !== "csv" && type !== "ofx" && type !== "qif") {
    throw new AccountingInputError("File imports support CSV, OFX or QIF.");
  }

  const filename = shortText(body.filename,255,"Filename",true);
  const content = shortText(body.content,5_000_000,"Statement file",true);

  if (Buffer.byteLength(content,"utf8") > 5_000_000) {
    throw new AccountingInputError("Statement file cannot exceed 5 MB.");
  }

  const transactions =
    type === "csv"
      ? parseCsv(content,body.csvMapping)
      : type === "ofx"
        ? parseOfx(content)
        : parseQif(
            content,
            String(body.qifDateFormat || "mdy").toLowerCase() === "dmy"
              ? "dmy"
              : String(body.qifDateFormat || "mdy").toLowerCase() === "ymd"
                ? "ymd"
                : "mdy",
          );

  const sourceSha = sha256(content);
  const hash = requestHash({
    bankAccountId,type,filename,sourceSha,csvMapping:body.csvMapping || null,
  });

  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");
    const account = await financialAccount(client,context.companyId,bankAccountId);
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["accounting:statement-account:" + bankAccountId],
    );

    const batch = await createImportBatch(client,{
      companyId:context.companyId,userId:context.userId,bankAccountId,
      key,hash,sourceType:type,filename,sourceSha,
      statementFrom:transactions.map(t=>t.transactionDate).sort()[0] || null,
      statementTo:transactions.map(t=>t.transactionDate).sort().at(-1) || null,
      currency:String(account.currency).toUpperCase(),
    });

    if (batch.replayed) {
      await client.query("COMMIT");
      return { batchId:batch.id,replayed:true };
    }

    const result = await importNormalizedTransactions(client,{
      companyId:context.companyId,userId:context.userId,bankAccountId,
      batchId:batch.id,sourceType:type,
      accountCurrency:String(account.currency).toUpperCase(),
      baseCurrency:String(account.company_currency).toUpperCase(),
      transactions,
    });

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:"accounting.statement.imported",
      module:"accounting",
      resourceType:"accounting_statement_import_batches",
      resourceId:batch.id,
      summary:"Bank statement file imported",
      result:"success",
      metadata:{ sourceType:type,filename,...result },
    }).catch(error =>
      console.error("[Accounting] Statement import audit delivery failed",error),
    );

    return { batchId:batch.id,replayed:false,...result };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function createFeedConnection(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_bank_feed_connections",
    "create",
  );
  const body = bodyOf(input);
  const bankAccountId = accountingId(body.bankAccountId);
  const providerKey = shortText(body.providerKey,100,"Provider key",true).toLowerCase();
  const providerLabel = shortText(body.providerLabel,160,"Provider name",true);
  const externalAccountReference =
    optionalText(
      body.externalAccountReference,255,"External account reference",
    ) || "";
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");
    await financialAccount(client,context.companyId,bankAccountId);

    const result = await client.query(
      `INSERT INTO accounting_bank_feed_connections (
         company_id,bank_account_id,provider_key,provider_label,
         external_account_reference,status,created_by,updated_by
       )
       VALUES ($1,$2,$3,$4,$5,'active',$6,$6)
       ON CONFLICT (
         company_id,bank_account_id,provider_key,external_account_reference
       )
       WHERE deleted_at IS NULL AND status <> 'disconnected'
       DO UPDATE SET
         provider_label=EXCLUDED.provider_label,
         status='active',
         last_error=NULL,
         updated_by=EXCLUDED.updated_by,
         updated_at=NOW()
       RETURNING id::text`,
      [
        context.companyId,bankAccountId,providerKey,providerLabel,
        externalAccountReference,context.userId,
      ],
    );

    await client.query("COMMIT");
    return { id:String(result.rows[0].id) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function changeFeedConnectionStatus(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_bank_feed_connections",
    "edit",
  );
  const body = bodyOf(input);
  const id = accountingId(body.id);
  const status = String(body.status || "").trim();

  if (!["active","paused","disconnected"].includes(status)) {
    throw new AccountingInputError("Choose active, paused or disconnected.");
  }

  const result = await context.pool.query(
    `UPDATE accounting_bank_feed_connections
     SET status=$3,last_error=NULL,updated_by=$4,updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
     RETURNING id::text`,
    [context.companyId,id,status,context.userId],
  );

  if (!result.rows[0]) {
    throw new AccountingInputError("Feed connection not found.");
  }

  return { id,status };
}


export type TrustedAccountingFeedRuntime = {
  tenantId: string;
  companyId: string;
  userId: string;
  pool: import('pg').Pool;
};

async function ingestNormalizedFeedForRuntime(
  runtime: TrustedAccountingFeedRuntime,
  input: unknown,
) {
  const body = bodyOf(input);
  const connectionId = accountingId(body.connectionId);
  const key = requestKey(body.requestKey);
  const transactions = normalizedFeedTransactions(body.transactions);
  const cursor = optionalText(body.cursor,4000,"Feed cursor");
  const client = await runtime.pool.connect();

  try {
    await client.query("BEGIN");

    const connectionResult = await client.query(
      `SELECT id::text,bank_account_id::text,status,provider_key,provider_label
       FROM accounting_bank_feed_connections
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [runtime.companyId,connectionId],
    );
    const connection = connectionResult.rows[0];

    if (!connection || connection.status !== "active") {
      throw new AccountingInputError("Feed connection must be active before syncing.");
    }

    const account = await financialAccount(
      client,runtime.companyId,String(connection.bank_account_id),
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["accounting:statement-account:" + String(connection.bank_account_id)],
    );

    const hash = requestHash({
      connectionId,cursor,transactions,
    });

    const batch = await createImportBatch(client,{
      companyId:runtime.companyId,userId:runtime.userId,
      bankAccountId:String(connection.bank_account_id),
      feedConnectionId:connectionId,key,hash,sourceType:"feed",
      statementFrom:transactions.map(t=>t.transactionDate).sort()[0] || null,
      statementTo:transactions.map(t=>t.transactionDate).sort().at(-1) || null,
      currency:String(account.currency).toUpperCase(),
    });

    if (batch.replayed) {
      await client.query("COMMIT");
      return { batchId:batch.id,replayed:true };
    }

    const result = await importNormalizedTransactions(client,{
      companyId:runtime.companyId,userId:runtime.userId,
      bankAccountId:String(connection.bank_account_id),
      batchId:batch.id,sourceType:"feed",
      accountCurrency:String(account.currency).toUpperCase(),
      baseCurrency:String(account.company_currency).toUpperCase(),
      transactions,
    });

    await client.query(
      `UPDATE accounting_bank_feed_connections
       SET sync_cursor=$3,last_synced_at=NOW(),last_error=NULL,updated_by=$4,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [runtime.companyId,connectionId,cursor,runtime.userId],
    );

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId:runtime.tenantId,
      companyId:runtime.companyId,
      userId:runtime.userId,
      action:"accounting.statement.feed_synced",
      module:"accounting",
      resourceType:"accounting_bank_feed_connections",
      resourceId:connectionId,
      summary:"Normalized bank feed transactions synchronized",
      result:"success",
      metadata:{ providerKey:connection.provider_key,...result },
    }).catch(error =>
      console.error("[Accounting] Feed sync audit delivery failed",error),
    );

    return { batchId:batch.id,replayed:false,...result };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
      await runtime.pool.query(
        `UPDATE accounting_bank_feed_connections
         SET status='error',last_error=$3,updated_by=$4,updated_at=NOW()
         WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`,
        [
          runtime.companyId,
          connectionId,
          error instanceof Error ? error.message.slice(0,2000) : "Feed sync failed",
          runtime.userId,
        ],
      ).catch(()=>{});
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}



}

export async function ingestNormalizedFeed(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_statement_import_batches",
    "create",
  );

  return ingestNormalizedFeedForRuntime(
    {
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      pool:context.pool,
    },
    input,
  );
}

export async function ingestNormalizedFeedTrusted(
  runtime: TrustedAccountingFeedRuntime,
  input: unknown,
) {
  return ingestNormalizedFeedForRuntime(
    runtime,
    input,
  );
}


export async function cancelStatementImportBatch(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_statement_import_batches",
    "edit",
  );
  const body = bodyOf(input);
  const batchId = accountingId(body.batchId);
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const batchResult = await client.query(
      `SELECT id::text,status,bank_account_id::text,source_filename
       FROM accounting_statement_import_batches
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [context.companyId,batchId],
    );
    const batch = batchResult.rows[0];

    if (!batch) {
      throw new AccountingInputError("Statement import batch not found.");
    }

    if (batch.status === "cancelled") {
      await client.query("COMMIT");
      return { batchId,replayed:true };
    }

    const used = await client.query(
      `SELECT 1
       FROM accounting_bank_statement_lines
       WHERE company_id=$1
         AND import_batch_id=$2
         AND deleted_at IS NULL
         AND reconciliation_status='matched'
       LIMIT 1`,
      [context.companyId,batchId],
    );

    if (used.rows[0]) {
      throw new AccountingInputError(
        "A statement batch with matched reconciliation lines cannot be undone.",
      );
    }

    await client.query(
      `UPDATE accounting_bank_statement_lines
       SET deleted_at=NOW(),updated_by=$3,updated_at=NOW()
       WHERE company_id=$1
         AND import_batch_id=$2
         AND deleted_at IS NULL
         AND reconciliation_status IN ('unmatched','suggested','excluded')`,
      [context.companyId,batchId,context.userId],
    );

    await client.query(
      `UPDATE accounting_statement_import_rows
       SET import_status='ignored',updated_by=$3,updated_at=NOW()
       WHERE company_id=$1
         AND batch_id=$2
         AND deleted_at IS NULL
         AND import_status IN ('imported','duplicate','error','pending')`,
      [context.companyId,batchId,context.userId],
    );

    await client.query(
      `UPDATE accounting_statement_import_batches
       SET status='cancelled',updated_by=$3,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,batchId,context.userId],
    );

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:"accounting.statement.import_cancelled",
      module:"accounting",
      resourceType:"accounting_statement_import_batches",
      resourceId:batchId,
      summary:"Statement import batch undone before reconciliation",
      result:"success",
      metadata:{
        bankAccountId:String(batch.bank_account_id),
        sourceFilename:batch.source_filename || null,
      },
    }).catch(error =>
      console.error("[Accounting] Statement import cancellation audit delivery failed",error),
    );

    return { batchId,replayed:false };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function acceptPossibleDuplicate(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_statement_import_rows",
    "edit",
  );
  const body = bodyOf(input);
  const rowId = accountingId(body.rowId);
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT r.*,b.bank_account_id::text,b.source_type
       FROM accounting_statement_import_rows r
       JOIN accounting_statement_import_batches b
         ON b.company_id=r.company_id AND b.id=r.batch_id AND b.deleted_at IS NULL
       WHERE r.company_id=$1 AND r.id=$2 AND r.deleted_at IS NULL
       LIMIT 1
       FOR UPDATE OF r`,
      [context.companyId,rowId],
    );
    const row = result.rows[0];

    if (!row || row.import_status !== "duplicate") {
      throw new AccountingInputError("Only a possible duplicate import row can be accepted.");
    }

    if (row.external_transaction_id) {
      throw new AccountingInputError(
        "A duplicate external transaction ID cannot be force-imported.",
      );
    }

    const line = await client.query(
      `INSERT INTO accounting_bank_statement_lines (
         company_id,bank_account_id,transaction_date,description,external_reference,amount,
         reconciliation_status,import_batch_id,import_row_id,source_type,
         fingerprint,value_date,counterparty,raw_details,currency,exchange_rate,base_amount,created_by,updated_by
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,'unmatched',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17
       )
       RETURNING id::text`,
      [
        context.companyId,row.bank_account_id,row.transaction_date,row.description,
        row.external_reference,row.amount,row.batch_id,rowId,row.source_type,row.fingerprint,
        row.value_date,row.counterparty,JSON.stringify(row.raw_payload || {}),
        row.currency,row.exchange_rate,row.base_amount,context.userId,
      ],
    );

    await client.query(
      `UPDATE accounting_statement_import_rows
       SET import_status='imported',statement_line_id=$3,duplicate_of_line_id=NULL,
           error_message=NULL,updated_by=$4,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,rowId,String(line.rows[0].id),context.userId],
    );

    await client.query(
      `UPDATE accounting_statement_import_batches
       SET imported_rows=imported_rows+1,duplicate_rows=GREATEST(duplicate_rows-1,0),
           updated_by=$3,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,row.batch_id,context.userId],
    );

    await client.query("COMMIT");

    return { rowId,statementLineId:String(line.rows[0].id) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
