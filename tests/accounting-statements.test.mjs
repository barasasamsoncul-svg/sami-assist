import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCsv,
  parseOfx,
  parseQif,
} from "../lib/apps/accounting/statements.ts";


test("CSV parser handles quoted fields and explicit DMY dates", () => {
  const parsed = parseCsv(
    [
      "Date,Description,Amount,Reference,Transaction ID",
      '31/01/2026,"Fuel, Nairobi",-1500.50,ABC123,TX-1',
      '01/02/2026,"Customer receipt",2500.00,RCPT-2,TX-2',
    ].join("\n"),
    {
      dateFormat:"dmy",
    },
  );

  assert.equal(parsed.length,2);
  assert.deepEqual(
    parsed.map(row => ({
      date:row.transactionDate,
      description:row.description,
      amount:row.amount,
      id:row.externalTransactionId,
    })),
    [
      {
        date:"2026-01-31",
        description:"Fuel, Nairobi",
        amount:"-1500.50",
        id:"TX-1",
      },
      {
        date:"2026-02-01",
        description:"Customer receipt",
        amount:"2500.00",
        id:"TX-2",
      },
    ],
  );
});


test("CSV parser rejects ambiguous local dates in auto mode", () => {
  assert.throws(
    () => parseCsv(
      [
        "Date,Description,Amount",
        "01/02/2026,Ambiguous,100.00",
      ].join("\n"),
      {
        dateFormat:"auto",
      },
    ),
    /Ambiguous statement date/,
  );
});


test("OFX parser retains FITID for authoritative duplicate protection", () => {
  const parsed = parseOfx(
    `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260205120000
<TRNAMT>-42.75
<FITID>FIT-123
<NAME>Merchant
<MEMO>Lunch
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`,
  );

  assert.equal(parsed.length,1);
  assert.equal(parsed[0].transactionDate,"2026-02-05");
  assert.equal(parsed[0].amount,"-42.75");
  assert.equal(parsed[0].externalTransactionId,"FIT-123");
  assert.equal(parsed[0].counterparty,"Merchant");
});


test("QIF parser ignores the type header and honors selected date order", () => {
  const parsed = parseQif(
    [
      "!Type:Bank",
      "D2/5/2026",
      "T-123.45",
      "PPetrol Station",
      "MFuel",
      "NQ-77",
      "^",
    ].join("\n"),
    "mdy",
  );

  assert.equal(parsed.length,1);
  assert.equal(parsed[0].transactionDate,"2026-02-05");
  assert.equal(parsed[0].amount,"-123.45");
  assert.equal(parsed[0].counterparty,"Petrol Station");
  assert.equal(parsed[0].externalReference,"Q-77");
});
