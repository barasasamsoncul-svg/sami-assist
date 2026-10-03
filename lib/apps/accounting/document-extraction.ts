import 'server-only';

import crypto from 'node:crypto';
import OpenAI from 'openai';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { AccountingInputError,accountingId } from '@/lib/apps/accounting/validation';
import { getPermissionContext } from '@/lib/auth/permission-context';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { requireSamiAiProviderConfig } from '@/lib/ai/config';
import { assertAiMonthlyUsageAvailable } from '@/lib/usage/entitlements';
import { getPrivateObjectBytes } from '@/lib/storage/object-storage';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

const MAX_EXTRACTION_BYTES=12*1024*1024;
const IMAGE_MIMES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const TEXT_MIMES=new Set(['text/plain','text/csv','application/json']);

function object(value:unknown) {
  return value&&typeof value==='object'&&!Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
}

function clean(value:unknown,max=500) {
  return typeof value==='string'
    ? value.replace(/\u0000/g,'').trim().slice(0,max)
    : '';
}

function extractionType(value:unknown) {
  return value==='receipt'
    ? 'receipt'
    : value==='supplier_credit'
      ? 'supplier_credit'
      : value==='invoice'
        ? 'invoice'
        : 'vendor_bill';
}

function parseJsonContent(content:string) {
  const trimmed=content.trim()
    .replace(/^\`\`\`(?:json)?\s*/i,'')
    .replace(/\s*\`\`\`$/,'')
    .trim();

  try {
    const parsed=JSON.parse(trimmed);
    if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) {
      throw new Error('Extraction response is not an object.');
    }
    return parsed as Record<string,unknown>;
  } catch {
    const start=trimmed.indexOf('{');
    const end=trimmed.lastIndexOf('}');
    if (start>=0&&end>start) {
      const parsed=JSON.parse(trimmed.slice(start,end+1));
      if (parsed && typeof parsed==='object' && !Array.isArray(parsed)) {
        return parsed as Record<string,unknown>;
      }
    }
    throw new AccountingInputError(
      'SaMi AI returned document data that could not be safely parsed. Retry with a clearer image or another configured vision-capable model.',
    );
  }
}

async function loadFile(
  pool:import('pg').Pool,
  companyId:string,
  fileId:string,
) {
  const result=await pool.query(
    `SELECT id::text,name,file_name,mime_type,extension,size_bytes,storage_key,status
     FROM files
     WHERE company_id=$1
       AND id=$2
       AND deleted_at IS NULL
       AND status='active'
     LIMIT 1`,
    [companyId,fileId],
  );
  if (!result.rows[0]) {
    throw new AccountingInputError('Choose an active file from the current company.');
  }
  return result.rows[0] as Record<string,unknown>;
}

function extractionPrompt(kind:string) {
  return [
    'You are SaMi AI performing accounting document data extraction.',
    'Return JSON only. Do not infer missing tax IDs, dates, currencies, totals or line values.',
    'Use null for unreadable or absent fields. Numbers must be plain decimal strings without currency symbols.',
    'Do not choose ledger accounts, tax codes, vendors or posting actions.',
    'This is review-only extraction and must never be described as posted accounting data.',
    'Document type requested: '+kind+'.',
    'Return exactly this shape:',
    JSON.stringify({
      documentType:kind,
      supplierName:null,
      supplierTaxNumber:null,
      documentNumber:null,
      documentDate:null,
      dueDate:null,
      currency:null,
      subtotal:null,
      taxAmount:null,
      totalAmount:null,
      reference:null,
      lineItems:[{
        description:null,
        quantity:null,
        unitPrice:null,
        taxAmount:null,
        lineTotal:null,
      }],
      confidence:{
        overall:0,
        supplierName:0,
        documentNumber:0,
        documentDate:0,
        currency:0,
        totalAmount:0,
        lineItems:0,
      },
    }),
  ].join('\n');
}

async function enforceExtractionRate(
  pool:import('pg').Pool,
  input:{
    userId:string;
    requestsPerMinute:number;
    requestsPerDay:number;
  },
) {
  const result=await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at>=NOW()-INTERVAL '1 minute')::int AS minute_count,
       COUNT(*) FILTER (WHERE created_at>=CURRENT_DATE)::int AS day_count
     FROM ai_runs
     WHERE user_id=$1`,
    [input.userId],
  );
  const minute=Number(result.rows[0]?.minute_count||0);
  const day=Number(result.rows[0]?.day_count||0);
  if(minute>=input.requestsPerMinute){
    throw new AccountingInputError(
      'SaMi AI is receiving too many requests for this user. Retry shortly.',
    );
  }
  if(day>=input.requestsPerDay){
    throw new AccountingInputError(
      'SaMi AI daily request allowance has been reached for this user.',
    );
  }
}

async function insertAiRun(
  pool:import('pg').Pool,
  input:{
    userId:string;
    companyId:string;
    provider:string;
    model:string;
    correlationId:string;
  },
) {
  const result=await pool.query(
    `INSERT INTO ai_runs(
       conversation_id,user_id,company_id,provider,model,status,
       correlation_id,metadata,created_at
     ) VALUES(
       NULL,$1,$2,$3,$4,'running',$5,$6::jsonb,NOW()
     )
     RETURNING id::text`,
    [
      input.userId,
      input.companyId,
      input.provider,
      input.model,
      input.correlationId,
      JSON.stringify({
        purpose:'accounting_document_extraction',
        module:'accounting',
      }),
    ],
  );
  return String(result.rows[0].id);
}

async function finishAiRun(
  pool:import('pg').Pool,
  input:{
    id:string;
    userId:string;
    companyId:string;
    status:'completed'|'failed';
    usage?:{prompt_tokens?:number;completion_tokens?:number;total_tokens?:number};
    durationMs:number;
    errorMessage?:string|null;
  },
) {
  await pool.query(
    `UPDATE ai_runs
     SET status=$4,
         input_tokens=$5,
         output_tokens=$6,
         total_tokens=$7,
         tool_calls_count=0,
         duration_ms=$8,
         error_code=$9,
         error_message=$10,
         completed_at=NOW()
     WHERE id=$1 AND user_id=$2 AND company_id=$3`,
    [
      input.id,
      input.userId,
      input.companyId,
      input.status,
      input.usage?.prompt_tokens??null,
      input.usage?.completion_tokens??null,
      input.usage?.total_tokens??null,
      input.durationMs,
      input.status==='failed'?'DOCUMENT_EXTRACTION_FAILED':null,
      input.errorMessage||null,
    ],
  ).catch(()=>undefined);
}

export async function getAccountingDocumentCapture() {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_document_extractions',
    'report',
  );

  const [files,extractions]=await Promise.all([
    context.pool.query(
      `SELECT id::text,name,file_name,mime_type,extension,size_bytes,created_at::text
       FROM files
       WHERE company_id=$1
         AND deleted_at IS NULL
         AND status='active'
         AND (
           mime_type IN ('image/jpeg','image/png','image/webp','image/gif','text/plain','text/csv','application/json','application/pdf')
         )
       ORDER BY created_at DESC,id DESC
       LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT
         e.id::text,e.file_id::text,e.request_key::text,e.extraction_type,e.status,
         e.provider,e.model,e.source_digest,e.extracted_data,e.confidence,e.error_message,
         e.requested_by::text,e.reviewed_by::text,e.reviewed_at::text,
         e.created_at::text,e.updated_at::text,
         f.name AS file_name,f.mime_type
       FROM accounting_document_extractions e
       JOIN files f ON f.id=e.file_id AND f.company_id=e.company_id
       WHERE e.company_id=$1 AND e.deleted_at IS NULL
       ORDER BY e.created_at DESC,e.id DESC
       LIMIT 100`,
      [context.companyId],
    ),
  ]);

  return {
    companyId:context.companyId,
    currency:context.company.currentCompany.currency,
    files:files.rows,
    extractions:extractions.rows,
    supportedDirectMimeTypes:[...IMAGE_MIMES,...TEXT_MIMES],
    pdfNote:'Native PDF/image OCR can also be supplied through a configured Accounting document-extraction provider. Direct SaMi AI extraction currently requires a supported text or image file.',
  };
}

export async function extractAccountingDocument(input:unknown) {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_document_extractions',
    'create',
  );
  const body=object(input);
  const fileId=accountingId(body.fileId);
  const requestKey=accountingId(body.requestKey);
  const kind=extractionType(body.extractionType);

  const permissions=await getPermissionContext();
  if (
    permissions.tenantId!==context.tenantId ||
    permissions.userId!==context.userId ||
    (!permissions.isOwner&&!permissions.permissionSet.has(SAMI_PERMISSIONS.FILES_VIEW))
  ) {
    throw new AccountingInputError('Files permission is required to extract an Accounting document.');
  }

  const existing=await context.pool.query(
    `SELECT id::text,status,extracted_data,confidence,error_message
     FROM accounting_document_extractions
     WHERE company_id=$1 AND request_key=$2
     LIMIT 1`,
    [context.companyId,requestKey],
  );
  if (existing.rows[0]) {
    return {...existing.rows[0],replayed:true};
  }

  const file=await loadFile(context.pool,context.companyId,fileId);
  const mime=String(file.mime_type||'').trim().toLowerCase();
  const size=Number(file.size_bytes||0);

  if (size<=0||size>MAX_EXTRACTION_BYTES) {
    throw new AccountingInputError('Direct document extraction supports files up to 12 MB.');
  }
  if (!IMAGE_MIMES.has(mime)&&!TEXT_MIMES.has(mime)) {
    throw new AccountingInputError(
      mime==='application/pdf'
        ? 'Direct PDF extraction requires a configured document-extraction provider. For SaMi AI direct extraction, upload an image or supported text file.'
        : 'This file type is not supported for direct Accounting extraction.',
    );
  }

  await assertAiMonthlyUsageAvailable({
    tenantId:context.tenantId,
    userId:context.userId,
  });

  const config=requireSamiAiProviderConfig();
  await enforceExtractionRate(context.pool,{
    userId:context.userId,
    requestsPerMinute:config.requestsPerMinute,
    requestsPerDay:config.requestsPerDay,
  });
  const bytes=await getPrivateObjectBytes(String(file.storage_key));
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  const correlationId=crypto.randomUUID();

  const reserved=await context.pool.query(
    `INSERT INTO accounting_document_extractions(
       company_id,file_id,request_key,extraction_type,status,
       source_digest,requested_by,created_at,updated_at
     ) VALUES($1,$2,$3,$4,'pending',$5,$6,NOW(),NOW())
     ON CONFLICT(company_id,request_key) DO NOTHING
     RETURNING id::text`,
    [context.companyId,fileId,requestKey,kind,digest,context.userId],
  );

  if (!reserved.rows[0]) {
    const replay=await context.pool.query(
      `SELECT id::text,status,extracted_data,confidence,error_message
       FROM accounting_document_extractions
       WHERE company_id=$1 AND request_key=$2 LIMIT 1`,
      [context.companyId,requestKey],
    );
    return {...replay.rows[0],replayed:true};
  }

  const extractionId=String(reserved.rows[0].id);
  const runId=await insertAiRun(context.pool,{
    userId:context.userId,
    companyId:context.companyId,
    provider:config.provider,
    model:config.model,
    correlationId,
  });
  const started=Date.now();

  try {
    const client=new OpenAI({apiKey:config.apiKey,baseURL:config.baseUrl});
    const prompt=extractionPrompt(kind);
    const userContent:unknown[]=IMAGE_MIMES.has(mime)
      ? [
          {type:'text',text:'Extract the accounting fields from this private workspace document image.'},
          {type:'image_url',image_url:{url:`data:${mime};base64,${bytes.toString('base64')}`,detail:'high'}},
        ]
      : [
          {type:'text',text:'Extract the accounting fields from this private workspace document text:\n\n'+bytes.toString('utf8').slice(0,200000)},
        ];

    const response=await client.chat.completions.create({
      model:config.model,
      temperature:0,
      messages:[
        {role:'system',content:prompt},
        {role:'user',content:userContent as never},
      ],
    } as never);

    const message=response.choices[0]?.message?.content;
    if (typeof message!=='string'||!message.trim()) {
      throw new Error('The configured SaMi AI provider returned no extraction result.');
    }

    const parsed=parseJsonContent(message);
    const confidence=object(parsed.confidence);
    delete parsed.confidence;

    await context.pool.query(
      `UPDATE accounting_document_extractions
       SET status='extracted',provider=$3,model=$4,
           extracted_data=$5::jsonb,confidence=$6::jsonb,
           error_message=NULL,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [
        context.companyId,
        extractionId,
        config.provider,
        config.model,
        JSON.stringify(parsed),
        JSON.stringify(confidence),
      ],
    );

    await finishAiRun(context.pool,{
      id:runId,
      userId:context.userId,
      companyId:context.companyId,
      status:'completed',
      usage:response.usage||undefined,
      durationMs:Date.now()-started,
    });

    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      actorType:'ai',
      action:'accounting.document.extracted',
      module:'accounting',
      resourceType:'accounting_document_extractions',
      resourceId:extractionId,
      summary:'SaMi AI extracted reviewable fields from an Accounting document.',
      result:'success',
      metadata:{
        fileId,
        extractionType:kind,
        provider:config.provider,
        model:config.model,
        sourceDigest:digest,
        reviewRequired:true,
      },
    }).catch(()=>undefined);

    return {
      id:extractionId,
      status:'extracted',
      extractedData:parsed,
      confidence,
      provider:config.provider,
      model:config.model,
      replayed:false,
    };
  } catch (error) {
    const message=error instanceof Error
      ? error.message.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,1200)
      : 'Document extraction failed.';

    await context.pool.query(
      `UPDATE accounting_document_extractions
       SET status='failed',provider=$3,model=$4,error_message=$5,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,extractionId,config.provider,config.model,message],
    ).catch(()=>undefined);

    await finishAiRun(context.pool,{
      id:runId,
      userId:context.userId,
      companyId:context.companyId,
      status:'failed',
      durationMs:Date.now()-started,
      errorMessage:message,
    });

    throw new AccountingInputError(
      'Document extraction failed with the configured SaMi AI provider. '+message,
    );
  }
}

export async function reviewAccountingDocumentExtraction(input:unknown) {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_document_extractions',
    'edit',
  );
  const body=object(input);
  const id=accountingId(body.id);
  const decision=body.decision==='reject'?'rejected':'reviewed';

  const result=await context.pool.query(
    `UPDATE accounting_document_extractions
     SET status=$3,reviewed_by=$4,reviewed_at=NOW(),updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
       AND status='extracted'
     RETURNING id::text,status`,
    [context.companyId,id,decision,context.userId],
  );
  if (!result.rows[0]) {
    throw new AccountingInputError('Only an extracted document can be reviewed or rejected.');
  }

  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,
    companyId:context.companyId,
    userId:context.userId,
    action:'accounting.document.'+decision,
    module:'accounting',
    resourceType:'accounting_document_extractions',
    resourceId:id,
    summary:decision==='reviewed'
      ? 'Accounting document extraction reviewed by a user.'
      : 'Accounting document extraction rejected by a user.',
    result:'success',
    metadata:{reviewRequired:false},
  }).catch(()=>undefined);

  return result.rows[0];
}

export async function recordExternalAccountingDocumentExtraction(input:{
  tenantId:string;
  companyId:string;
  userId:string;
  providerKey:string;
  externalEventId:string;
  requestKey:string;
  payload:unknown;
}) {
  const body=object(input.payload);
  const fileId=accountingId(body.fileId);
  const pool=(await import('@/lib/db/tenant')).getTenantPoolByTenantId;
  const tenantPool=await pool(input.tenantId);
  await loadFile(tenantPool,input.companyId,fileId);

  const data=object(body.extractedData);
  const confidence=object(body.confidence);
  const kind=extractionType(body.extractionType);
  const requestKey=accountingId(input.requestKey);

  const result=await tenantPool.query(
    `INSERT INTO accounting_document_extractions(
       company_id,file_id,request_key,extraction_type,status,provider,model,
       extracted_data,confidence,requested_by,created_at,updated_at
     ) VALUES(
       $1,$2,$3,$4,'extracted',$5,$6,$7::jsonb,$8::jsonb,$9,NOW(),NOW()
     )
     ON CONFLICT(company_id,request_key) DO UPDATE SET
       updated_at=accounting_document_extractions.updated_at
     RETURNING id::text,status`,
    [
      input.companyId,
      fileId,
      requestKey,
      kind,
      input.providerKey,
      clean(body.model,180)||'external_ocr',
      JSON.stringify(data),
      JSON.stringify(confidence),
      input.userId,
    ],
  );

  await recordWorkspaceAuditEvent({
    tenantId:input.tenantId,
    companyId:input.companyId,
    userId:input.userId,
    actorType:'system',
    action:'accounting.document.external_extraction_received',
    module:'accounting',
    resourceType:'accounting_document_extractions',
    resourceId:String(result.rows[0].id),
    summary:'Verified external OCR/document extraction received for user review.',
    result:'success',
    metadata:{
      fileId,
      providerKey:input.providerKey,
      externalEventId:input.externalEventId,
      reviewRequired:true,
    },
  }).catch(()=>undefined);

  return result.rows[0];
}
