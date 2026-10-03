import 'server-only';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { AccountingInputError } from '@/lib/apps/accounting/validation';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

function obj(value:unknown) {
  return value&&typeof value==='object'&&!Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
}

function text(value:unknown,max:number,label:string,required=false) {
  const result=typeof value==='string'?value.trim():'';
  if (required&&!result) throw new AccountingInputError(label+' is required.');
  if (result.length>max) throw new AccountingInputError(label+' is too long.');
  return result;
}

function country(value:unknown) {
  const code=text(value,2,'Country code',true).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new AccountingInputError('Country code must be two ISO letters.');
  return code;
}

function packKey(value:unknown) {
  const key=text(value,80,'Pack key',true).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{1,79}$/.test(key)) {
    throw new AccountingInputError('Pack key must use lowercase letters, numbers, dots, underscores or hyphens.');
  }
  return key;
}

function packVersion(value:unknown) {
  const version=text(value,40,'Pack version',true);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,39}$/.test(version)) {
    throw new AccountingInputError('Pack version is invalid.');
  }
  return version;
}

type PackBox={
  code:string;
  label:string;
  description:string|null;
  sequence:number;
};

type PackRule={
  boxCode:string;
  taxCode:string;
  direction:'sale'|'purchase'|'withholding'|'any';
  amountField:'taxable'|'tax'|'recoverable'|'nonrecoverable';
  multiplier:string;
};

function manifest(value:unknown) {
  const body=obj(value);
  const key=packKey(body.packKey);
  const version=packVersion(body.packVersion);
  const countryCode=country(body.countryCode);
  const jurisdictionCode=text(body.jurisdictionCode||countryCode,80,'Jurisdiction code',true).toUpperCase();
  const locale=text(body.locale||'en',40,'Locale',true);

  const rawBoxes=Array.isArray(body.boxes)?body.boxes:[];
  if (!rawBoxes.length||rawBoxes.length>200) {
    throw new AccountingInputError('Localization pack must contain between 1 and 200 report boxes.');
  }
  const seenBoxes=new Set<string>();
  const boxes:PackBox[]=rawBoxes.map((raw,index)=>{
    const row=obj(raw);
    const code=text(row.code,60,'Box code',true).toUpperCase();
    if (!/^[A-Z0-9_.-]+$/.test(code)) throw new AccountingInputError('Box code '+code+' is invalid.');
    if (seenBoxes.has(code)) throw new AccountingInputError('Box code '+code+' is duplicated.');
    seenBoxes.add(code);
    const sequence=Math.max(0,Math.min(100000,Number(row.sequence??(index+1)*10)||0));
    return {
      code,
      label:text(row.label,180,'Box label',true),
      description:text(row.description,2000,'Box description')||null,
      sequence,
    };
  });

  const rawRules=Array.isArray(body.rules)?body.rules:[];
  if (rawRules.length>1000) throw new AccountingInputError('Localization pack has too many reporting rules.');
  const rules:PackRule[]=rawRules.map(raw=>{
    const row=obj(raw);
    const boxCode=text(row.boxCode,60,'Rule box code',true).toUpperCase();
    if (!seenBoxes.has(boxCode)) throw new AccountingInputError('Rule references unknown box '+boxCode+'.');
    const taxCode=text(row.taxCode,60,'Tax code',true).toUpperCase();
    const direction=
      row.direction==='sale'||row.direction==='purchase'||row.direction==='withholding'
        ? row.direction
        : 'any';
    const amountField=
      row.amountField==='taxable'||row.amountField==='recoverable'||row.amountField==='nonrecoverable'
        ? row.amountField
        : 'tax';
    const multiplier=Number(row.multiplier??1);
    if (!Number.isFinite(multiplier)||multiplier===0||multiplier<-1000||multiplier>1000) {
      throw new AccountingInputError('Localization rule multiplier is invalid.');
    }
    return {
      boxCode,taxCode,direction,amountField,multiplier:multiplier.toFixed(4),
    };
  });

  return {
    packKey:key,
    packVersion:version,
    countryCode,
    jurisdictionCode,
    locale,
    accountingFramework:text(body.accountingFramework,80,'Accounting framework')||null,
    taxAuthorityName:text(body.taxAuthorityName,180,'Tax authority name')||null,
    filingFrequency:
      body.filingFrequency==='monthly'||body.filingFrequency==='quarterly'||body.filingFrequency==='annual'
        ? body.filingFrequency
        : 'monthly',
    boxes,
    rules,
    metadata:obj(body.metadata),
  };
}

export async function importAccountingLocalizationPack(input:unknown) {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_localization_pack_history',
    'settings',
  );
  const body=obj(input);
  const pack=manifest(body.manifest??body);

  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['accounting:localization-pack:'+context.companyId],
    );

    const taxCodes=[...new Set(pack.rules.map(rule=>rule.taxCode))];
    const taxResult=taxCodes.length
      ? await client.query(
          `SELECT id::text,UPPER(code) AS code
           FROM accounting_tax_codes
           WHERE company_id=$1
             AND deleted_at IS NULL
             AND status='active'
             AND UPPER(code)=ANY($2::text[])
           FOR SHARE`,
          [context.companyId,taxCodes],
        )
      : {rows:[]};

    const taxByCode=new Map(taxResult.rows.map(row=>[String(row.code),String(row.id)]));
    const missing=taxCodes.filter(code=>!taxByCode.has(code));
    if (missing.length) {
      throw new AccountingInputError(
        'Localization pack references tax codes that are not configured in this company: '+missing.join(', ')+'. Configure effective-dated tax codes first.',
      );
    }

    const previous=await client.query(
      `SELECT pack_key,pack_version
       FROM accounting_localization_settings
       WHERE company_id=$1 AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [context.companyId],
    );

    await client.query(
      `INSERT INTO accounting_localization_settings(
         company_id,enabled,country_code,jurisdiction_code,locale,accounting_framework,
         tax_authority_name,filing_frequency,pack_key,pack_version,status,metadata,
         created_by,updated_by,created_at,updated_at,deleted_at
       ) VALUES(
         $1,TRUE,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10::jsonb,$11,$11,NOW(),NOW(),NULL
       )
       ON CONFLICT(company_id) DO UPDATE SET
         enabled=TRUE,country_code=EXCLUDED.country_code,jurisdiction_code=EXCLUDED.jurisdiction_code,
         locale=EXCLUDED.locale,accounting_framework=EXCLUDED.accounting_framework,
         tax_authority_name=EXCLUDED.tax_authority_name,filing_frequency=EXCLUDED.filing_frequency,
         pack_key=EXCLUDED.pack_key,pack_version=EXCLUDED.pack_version,status='active',
         metadata=EXCLUDED.metadata,updated_by=EXCLUDED.updated_by,updated_at=NOW(),deleted_at=NULL`,
      [
        context.companyId,
        pack.countryCode,
        pack.jurisdictionCode,
        pack.locale,
        pack.accountingFramework,
        pack.taxAuthorityName,
        pack.filingFrequency,
        pack.packKey,
        pack.packVersion,
        JSON.stringify({
          ...pack.metadata,
          importedManifest:true,
          taxRatesIncluded:false,
          importedAt:new Date().toISOString(),
        }),
        context.userId,
      ],
    );

    const boxIds=new Map<string,string>();
    for(const box of pack.boxes) {
      const saved=await client.query(
        `INSERT INTO accounting_localization_report_boxes(
           company_id,code,label,description,sequence,status,created_by,updated_by,created_at,updated_at,deleted_at
         ) VALUES($1,$2,$3,$4,$5,'active',$6,$6,NOW(),NOW(),NULL)
         ON CONFLICT(company_id,code) WHERE deleted_at IS NULL
         DO UPDATE SET
           label=EXCLUDED.label,description=EXCLUDED.description,sequence=EXCLUDED.sequence,
           status='active',updated_by=EXCLUDED.updated_by,updated_at=NOW()
         RETURNING id::text`,
        [context.companyId,box.code,box.label,box.description,box.sequence,context.userId],
      );
      boxIds.set(box.code,String(saved.rows[0].id));
    }

    // Archive old rules for boxes owned by the newly imported manifest, then rebuild
    // them only from already-configured company tax codes. No tax rate is imported.
    const ownedBoxIds=[...boxIds.values()];
    if (ownedBoxIds.length) {
      await client.query(
        `UPDATE accounting_localization_report_rules
         SET status='archived',updated_by=$3,updated_at=NOW()
         WHERE company_id=$1
           AND box_id=ANY($2::uuid[])
           AND deleted_at IS NULL
           AND status='active'`,
        [context.companyId,ownedBoxIds,context.userId],
      );
    }

    let ruleCount=0;
    for(const rule of pack.rules) {
      const boxId=boxIds.get(rule.boxCode);
      const taxCodeId=taxByCode.get(rule.taxCode);
      if (!boxId||!taxCodeId) continue;
      await client.query(
        `INSERT INTO accounting_localization_report_rules(
           company_id,box_id,tax_code_id,direction,amount_field,multiplier,status,
           created_by,updated_by,created_at,updated_at,deleted_at
         ) VALUES($1,$2,$3,$4,$5,$6,'active',$7,$7,NOW(),NOW(),NULL)
         ON CONFLICT(company_id,box_id,tax_code_id,direction,amount_field) WHERE deleted_at IS NULL
         DO UPDATE SET
           multiplier=EXCLUDED.multiplier,status='active',
           updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [
          context.companyId,boxId,taxCodeId,rule.direction,rule.amountField,
          rule.multiplier,context.userId,
        ],
      );
      ruleCount+=1;
    }

    const previousKey=previous.rows[0]?.pack_key?String(previous.rows[0].pack_key):null;
    const previousVersion=previous.rows[0]?.pack_version?String(previous.rows[0].pack_version):null;
    const action=previousKey===pack.packKey
      ? previousVersion===pack.packVersion?'reinstalled':'updated'
      : 'installed';

    await client.query(
      `INSERT INTO accounting_localization_pack_history(
         company_id,pack_key,pack_version,country_code,action,installed_by,metadata,
         created_at,updated_at,deleted_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW(),NOW(),NULL)`,
      [
        context.companyId,pack.packKey,pack.packVersion,pack.countryCode,action,
        context.userId,
        JSON.stringify({
          jurisdictionCode:pack.jurisdictionCode,
          boxCount:pack.boxes.length,
          ruleCount,
          source:'manifest_import',
          taxRatesImported:false,
        }),
      ],
    );

    await client.query('COMMIT');

    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:'accounting.localization.pack_imported',
      module:'accounting',
      resourceType:'accounting_localization_settings',
      resourceId:context.companyId,
      summary:'Versioned Accounting localization pack imported.',
      result:'success',
      metadata:{
        packKey:pack.packKey,
        packVersion:pack.packVersion,
        countryCode:pack.countryCode,
        boxCount:pack.boxes.length,
        ruleCount,
        taxRatesImported:false,
      },
    }).catch(()=>undefined);

    return {
      packKey:pack.packKey,
      packVersion:pack.packVersion,
      countryCode:pack.countryCode,
      boxCount:pack.boxes.length,
      ruleCount,
      action,
    };
  } catch(error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export function accountingLocalizationPackTemplate() {
  return {
    packKey:'country.vat.reporting',
    packVersion:'1.0.0',
    countryCode:'XX',
    jurisdictionCode:'XX',
    locale:'en',
    accountingFramework:'local-gaap',
    taxAuthorityName:'Tax authority',
    filingFrequency:'monthly',
    boxes:[
      {code:'SALES_TAX',label:'Sales tax',description:'Example reporting box.',sequence:10},
      {code:'PURCHASE_TAX',label:'Purchase tax',description:'Example reporting box.',sequence:20},
    ],
    rules:[
      {boxCode:'SALES_TAX',taxCode:'EXISTING-SALE-TAX-CODE',direction:'sale',amountField:'tax',multiplier:1},
      {boxCode:'PURCHASE_TAX',taxCode:'EXISTING-PURCHASE-TAX-CODE',direction:'purchase',amountField:'recoverable',multiplier:1},
    ],
    metadata:{
      note:'This manifest maps existing company tax codes. It does not create tax rates or claim statutory certification.',
    },
  };
}
