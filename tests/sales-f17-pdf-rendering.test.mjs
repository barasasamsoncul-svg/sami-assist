import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales PDFs encode supported Unicode through WinAnsiEncoding and keep an explicit Unicode-font follow-up', async () => {
  const pdf = await source('lib/apps/sales/pdf.ts');
  assert.match(pdf, /WIN_ANSI_SPECIALS:[\s\S]*?['€']:\s*0x80/);
  for (const character of ['£', '¥', '‘', '’', '“', '”', '–', '—', '…']) {
    assert.ok(pdf.includes(character), 'expected a WinAnsi-compatible character mapping for ' + character);
  }
  assert.match(pdf, /TODO: embed a Unicode font/);
  assert.match(pdf, /BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(pdf, /BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
  assert.doesNotMatch(pdf, /item\.description\.slice\(\s*0,\s*43/);
});

test('Sales PDF descriptions use word wrapping and paginate at up to 18 item rows', async () => {
  const pdf = await source('lib/apps/sales/pdf.ts');
  assert.match(pdf, /export function wrap\(textValue: unknown, maxChars: number\): string\[\]/);
  assert.match(pdf, /while \(word\.length > limit\)/);
  assert.match(pdf, /current\.length >= 18/);
  assert.match(pdf, /wrap\(item\.description, 46\)/);
  assert.match(pdf, /function rowHeight\(item: PdfLine\)/);
  assert.match(pdf, /if \(finalPage\) \{/);
  assert.match(pdf, /document\.template\.secondaryColor/);
});

test('Sales quote PDF renders company address, salesperson, validity, signature and recorded consent', async () => {
  const [pdf, route] = await Promise.all([
    source('lib/apps/sales/pdf.ts'),
    source('app/api/apps/sales/quotes/[quoteId]/pdf/route.ts'),
  ]);
  assert.match(pdf, /document\.company\.address/);
  assert.match(pdf, /\['Salesperson', document\.salespersonName\]/);
  assert.match(pdf, /Validity window/);
  assert.match(pdf, /Accepted by: __________ Date: __________/);
  assert.match(pdf, /e-signature consent recorded at ' \+ document\.acceptedAt/);
  assert.match(route, /acceptedAt:\s*quote\.acceptedAt/);
  assert.match(route, /salespersonName:/);
  assert.match(route, /FROM tenant_users tenant_user[\s\S]*?INNER JOIN users u/);
});

test('Sales PDF logo Image XObject is optional, embedded, and referenced from page resources', async () => {
  const pdf = await source('lib/apps/sales/pdf.ts');
  assert.match(pdf, /export type SalesPdfLogoImageXObject = \{[\s\S]*?jpegBytes: Uint8Array/);
  assert.match(pdf, /logoImageXObject: SalesPdfLogoImageXObject \| null = null/);
  assert.match(pdf, /\/Subtype \/Image/);
  assert.match(pdf, /\/Filter \/DCTDecode/);
  assert.match(pdf, /\/XObject << \/Logo /);
  assert.match(pdf, /\/Logo Do/);
});

test('Sales order PDF shares the common renderer and supports proforma invoice title', async () => {
  const pdf = await source('lib/apps/sales/pdf.ts');
  assert.match(pdf, /import type \{\s*getSalesOrderDetail,\s*\} from '@\/lib\/apps\/sales\/queries'/);
  assert.match(pdf, /type Order = Awaited<ReturnType<typeof getSalesOrderDetail>>/);
  assert.match(pdf, /export function renderSalesOrderPdf\(/);
  assert.match(pdf, /documentTitle\?: 'SALES ORDER' \| 'PROFORMA INVOICE'/);
  assert.match(pdf, /documentTitle: options\.documentTitle \|\| 'SALES ORDER'/);
  assert.match(pdf, /return renderPdf\(document, options\.logoImageXObject \|\| null\)/);
});

test('F17 PDF regression tests are part of the Sales CI suite', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-f17-pdf-rendering\.test\.mjs/);
});
