import 'server-only';
import { config } from 'dotenv';
import { queryControl } from '@/lib/db/control';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { getSamiModuleManifest } from '@/lib/modules/registry';
import { runSamiModuleMigrations } from '@/lib/modules/migrations';

config({path:'.env.local'});
config();

async function main(){
  const manifest=getSamiModuleManifest('invoicing');
  if(!manifest||manifest.version!=='2.23.0') throw new Error('This release command is scoped to Invoicing 2.23.0.');
  const installed=await queryControl(
    "SELECT t.id::text AS tenant_id,t.name AS tenant_name,tm.version FROM tenant_modules tm JOIN modules m ON m.id=tm.module_id AND m.deleted_at IS NULL JOIN tenants t ON t.id=tm.tenant_id AND t.deleted_at IS NULL WHERE tm.deleted_at IS NULL AND LOWER(m.key)='invoicing' AND LOWER(COALESCE(tm.status,'')) IN ('installed','active','enabled') ORDER BY t.name"
  );
  const results=[];
  for(const row of installed.rows){
    const pool=await getTenantPoolByTenantId(String(row.tenant_id));
    const migrated=await runSamiModuleMigrations({
      tenantPool:pool,moduleKey:'invoicing',
      currentVersion:String(row.version||'1.0.0'),
      targetVersion:manifest.version,
    });
    results.push({...migrated,tenantId:String(row.tenant_id),tenantName:row.tenant_name,controlVersionUpdated:false});
  }
  console.log(JSON.stringify({release:'invoicing',mode:'expand-before-promote',targetVersion:manifest.version,results},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
