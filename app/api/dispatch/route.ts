import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { databasePool, query } from "@/lib/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
const tokenHash = (value:string) => createHash("sha256").update(value).digest("hex");
const validEmail = (value:string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function error(message:string,status=400){return NextResponse.json({error:message},{status});}

export async function GET(request:Request){
  const action = new URL(request.url).searchParams.get("action") || "";
  if(action==="health"){
    try{const r=await query("SELECT (SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1) AS schema_version");return NextResponse.json({status:"ok",app:"SaMi Errands",database:"connected",schemaVersion:r.rows[0]?.schema_version||null});}
    catch{return error("Database connectivity or schema check failed.",503);}
  }
  const user=await getCurrentUser().catch(()=>null);
  if(action==="me")return user?NextResponse.json({user}):error("Not signed in.",401);
  if(!user)return error("Sign in to continue.",401);
  if(action==="errands"){
    try{
      let r;
      if(user.role==="admin")r=await query("SELECT e.*,c.full_name AS customer_name,p.full_name AS provider_name FROM errands e JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id ORDER BY CASE WHEN e.status IN ('requested','disputed') THEN 0 ELSE 1 END,e.created_at DESC LIMIT 200");
      else if(user.role==="provider")r=await query("SELECT e.*,c.full_name AS customer_name,p.full_name AS provider_name FROM errands e JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id WHERE e.provider_id=$1 ORDER BY e.created_at DESC LIMIT 100",[user.id]);
      else r=await query("SELECT e.*,c.full_name AS customer_name,p.full_name AS provider_name FROM errands e JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id WHERE e.customer_id=$1 ORDER BY e.created_at DESC LIMIT 100",[user.id]);
      return NextResponse.json({errands:r.rows});
    }catch{return error("Unable to load errands right now.",503);}
  }
  if(action==="providers"){
    if(user.role!=="admin")return error("Operations access is required.",403);
    try{const r=await query("SELECT u.id AS user_id,u.full_name,u.email,pp.provider_type,pp.business_name,pp.service_area,pp.service_categories,pp.approval_status,pp.available FROM users u JOIN provider_profiles pp ON pp.user_id=u.id WHERE u.role='provider' ORDER BY CASE pp.approval_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,pp.created_at DESC LIMIT 200");return NextResponse.json({providers:r.rows});}
    catch{return error("Provider list is temporarily unavailable.",503);}
  }
  return error("Unknown operation.",404);
}

export async function POST(request:Request){
  const action = new URL(request.url).searchParams.get("action") || "";
  const body=await request.json().catch(()=>null);
  const op=action || (typeof body?.action==="string"?body.action:"");
  if(op==="register"){
    const fullName=typeof body?.fullName==="string"?body.fullName.trim():"";
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const phone=typeof body?.phone==="string"?body.phone.trim().slice(0,32):"";
    const role=body?.role==="provider"?"provider":"customer";
    const password=typeof body?.password==="string"?body.password:"";
    if(fullName.length<2||fullName.length>120)return error("Enter your full name.");
    if(!validEmail(email)||email.length>254)return error("Enter a valid email address.");
    if(password.length<10||password.length>128)return error("Password must be 10–128 characters.");
    const client=await databasePool().connect();
    try{
      await client.query("BEGIN");
      const hash=await bcrypt.hash(password,12);
      const r=await client.query("INSERT INTO users(full_name,email,phone,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,full_name,email,role",[fullName,email,phone||null,hash,role]);
      if(role==="provider")await client.query("INSERT INTO provider_profiles(user_id) VALUES($1)",[r.rows[0].id]);
      await client.query("COMMIT");await createSession(r.rows[0].id);
      return NextResponse.json({user:r.rows[0]}, {status:201});
    }catch(e){await client.query("ROLLBACK").catch(()=>undefined);if(typeof e==="object"&&e!==null&&"code" in e&&(e as {code?:string}).code==="23505")return error("An account with that email already exists.",409);return error("Account creation failed. Please try again.",500);}
    finally{client.release();}
  }
  if(op==="login"){
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const password=typeof body?.password==="string"?body.password:"";
    if(!email||!password||email.length>254||password.length>128)return error("Enter your email and password.");
    try{const r=await query("SELECT id,password_hash,is_active FROM users WHERE lower(email)=$1 LIMIT 1",[email]);const u=r.rows[0];if(!u||!u.is_active||!(await bcrypt.compare(password,u.password_hash)))return error("Email or password is incorrect.",401);await createSession(u.id);return NextResponse.json({ok:true});}
    catch{return error("Sign-in is temporarily unavailable.",503);}
  }
  if(op==="logout"){await destroySession().catch(()=>undefined);return NextResponse.json({ok:true});}
  if(op==="bootstrap"){
    const expected=process.env.ADMIN_BOOTSTRAP_TOKEN||"";
    const supplied=request.headers.get("x-admin-bootstrap-token")||"";
    if(expected.length<32||supplied.length<32||supplied!==expected)return error("Administrator setup token is invalid or not configured.",403);
    const fullName=typeof body?.fullName==="string"?body.fullName.trim():"";
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const password=typeof body?.password==="string"?body.password:"";
    if(fullName.length<2||fullName.length>120||!validEmail(email)||password.length<12||password.length>128)return error("Enter a name, valid email and password of at least 12 characters.");
    const client=await databasePool().connect();let adminId:string;
    try{await client.query("BEGIN");const current=await client.query("SELECT id FROM users WHERE role='admin' LIMIT 1");if(current.rowCount){await client.query("ROLLBACK");return error("An administrator already exists. Sign in normally.",409);}const hash=await bcrypt.hash(password,12);const created=await client.query("INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,'admin') RETURNING id",[fullName,email,hash]);adminId=created.rows[0].id;await client.query("COMMIT");}
    catch(e){await client.query("ROLLBACK").catch(()=>undefined);if(typeof e==="object"&&e!==null&&"code" in e&&(e as {code?:string}).code==="23505")return error("That email is already registered.",409);return error("Administrator setup failed.",500);}
    finally{client.release();}
    await createSession(adminId!);return NextResponse.json({ok:true,message:"Administrator created and signed in."},{status:201});
  }
  const user=await getCurrentUser().catch(()=>null);
  if(!user)return error("Sign in to continue.",401);
  if(op==="createErrand"){
    if(user.role!=="customer")return error("Only customer accounts can submit requests.",403);
    const title=typeof body?.title==="string"?body.title.trim():"";
    const category=typeof body?.category==="string"?body.category.trim():"";
    const description=typeof body?.description==="string"?body.description.trim():"";
    const serviceArea=typeof body?.serviceArea==="string"?body.serviceArea.trim():"";
    const pickup=typeof body?.pickupLocation==="string"?body.pickupLocation.trim():"";
    const destination=typeof body?.destinationLocation==="string"?body.destinationLocation.trim():"";
    const allowed=new Set(["shopping","pickup_delivery","personal_errand","business_support","local_assistance","other"]);
    const budget=body?.budgetAmount===""||body?.budgetAmount==null?null:Number(body.budgetAmount);
    const due=typeof body?.dueAt==="string"&&body.dueAt?new Date(body.dueAt):null;
    if(title.length<3||title.length>160||description.length<5||description.length>5000||serviceArea.length<2||serviceArea.length>180||!allowed.has(category))return error("Check the title, task details, category and service area.");
    if(budget!==null&&(!Number.isFinite(budget)||budget<0||budget>100000000))return error("Enter a valid budget.");
    if(due&&(!Number.isFinite(due.getTime())||due.getTime()<Date.now()-86400000))return error("Choose a valid due date.");
    const code="SE-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+randomBytes(3).toString("hex").toUpperCase();
    const client=await databasePool().connect();
    try{await client.query("BEGIN");const r=await client.query("INSERT INTO errands(public_code,customer_id,title,category,description,pickup_location,destination_location,service_area,due_at,budget_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[code,user.id,title,category,description,pickup||null,destination||null,serviceArea,due,budget]);await client.query("INSERT INTO errand_events(errand_id,actor_id,event_type,to_status,note) VALUES($1,$2,'request_created','requested','Customer submitted an errand request.')",[r.rows[0].id,user.id]);await client.query("COMMIT");return NextResponse.json({errand:r.rows[0]},{status:201});}
    catch{await client.query("ROLLBACK").catch(()=>undefined);return error("The request could not be saved. Please retry.",503);}
    finally{client.release();}
  }
  if(op==="providerReview"){
    if(user.role!=="admin")return error("Operations access is required.",403);
    const providerId=typeof body?.providerId==="string"?body.providerId:"";
    const decision=body?.decision;
    if(!providerId||!["approve","reject"].includes(decision))return error("Choose a provider and review decision.");
    try{const status=decision==="approve"?"approved":"rejected";const r=await query("UPDATE provider_profiles pp SET approval_status=$2,updated_at=now() FROM users u WHERE pp.user_id=$1 AND u.id=pp.user_id AND u.role='provider' RETURNING pp.user_id",[providerId,status]);if(!r.rowCount)return error("Provider profile not found.",404);return NextResponse.json({ok:true,message:"Provider "+status+"."});}
    catch{return error("Provider review failed.",503);}
  }
  if(op==="errandAction"){
    const id=typeof body?.id==="string"?body.id:"";const act=typeof body?.errandAction==="string"?body.errandAction:"";
    if(!id)return error("Errand identifier is missing.");
    const client=await databasePool().connect();
    try{
      await client.query("BEGIN");const selected=await client.query("SELECT * FROM errands WHERE id=$1 FOR UPDATE",[id]);const e=selected.rows[0];if(!e){await client.query("ROLLBACK");return error("Errand not found.",404);}
      const old=e.status as string;let next=old;let note="";let event=act;
      if(act==="quote"){
        if(user.role!=="admin"||!["requested","declined","quoted"].includes(old))throw new Error("Only operations can quote requests awaiting review.");
        const amount=Number(body.amount);const payout=body.providerPayout==null||body.providerPayout===""?null:Number(body.providerPayout);
        if(!Number.isFinite(amount)||amount<0||amount>100000000||(payout!==null&&(!Number.isFinite(payout)||payout<0||payout>amount)))throw new Error("Enter a valid quote and payout; payout cannot exceed the quote.");
        next="quoted";note="Operations prepared or updated the customer quote.";await client.query("UPDATE errands SET quote_amount=$2,provider_payout=$3,status=$4,updated_at=now() WHERE id=$1",[id,amount,payout,next]);
      }else if(act==="assign"){
        if(user.role!=="admin"||!["requested","quoted","declined"].includes(old))throw new Error("Only operations can assign a request awaiting assignment.");
        const pid=typeof body.providerId==="string"?body.providerId:"";const p=await client.query("SELECT u.id FROM users u JOIN provider_profiles pp ON pp.user_id=u.id WHERE u.id=$1 AND u.role='provider' AND u.is_active=true AND pp.approval_status='approved' AND pp.available=true",[pid]);if(!p.rowCount)throw new Error("Choose an active, approved provider.");
        next="assigned";note="Operations assigned the errand to an approved provider.";await client.query("UPDATE errands SET provider_id=$2,status=$3,updated_at=now() WHERE id=$1",[id,pid,next]);
      }else if(act==="accept"||act==="decline"){
        if(user.role!=="provider"||e.provider_id!==user.id||old!=="assigned")throw new Error("Only the assigned provider can respond to this assignment.");
        next=act==="accept"?"accepted":"declined";note=act==="accept"?"Provider accepted the assignment.":"Provider declined the assignment.";await client.query("UPDATE errands SET status=$2,updated_at=now() WHERE id=$1",[id,next]);
      }else if(act==="start"){
        if(user.role!=="provider"||e.provider_id!==user.id||old!=="accepted")throw new Error("Only the assigned provider can start an accepted task.");
        next="in_progress";note="Provider marked the task as in progress.";await client.query("UPDATE errands SET status=$2,updated_at=now() WHERE id=$1",[id,next]);
      }else if(act==="complete"){
        if(user.role!=="provider"||e.provider_id!==user.id||old!=="in_progress")throw new Error("Only the assigned provider can submit completion from an in-progress task.");
        note=typeof body.completionNotes==="string"?body.completionNotes.trim().slice(0,4000):"";if(note.length<3)throw new Error("Add completion notes before submitting.");next="completion_submitted";await client.query("UPDATE errands SET status=$2,completion_notes=$3,updated_at=now() WHERE id=$1",[id,next,note]);
      }else if(act==="confirm"||act==="dispute"){
        if(user.role!=="customer"||e.customer_id!==user.id||old!=="completion_submitted")throw new Error("Only the requesting customer can confirm or dispute submitted completion.");
        if(act==="confirm"){next="completed";note="Customer confirmed completion.";await client.query("UPDATE errands SET status=$2,customer_confirmed_at=now(),updated_at=now() WHERE id=$1",[id,next]);}
        else{note=typeof body.note==="string"?body.note.trim().slice(0,1000):"";if(note.length<3)throw new Error("Explain the issue before opening a dispute.");next="disputed";await client.query("UPDATE errands SET status=$2,updated_at=now() WHERE id=$1",[id,next]);}
      }else if(act==="cancel"){
        const customerCan=user.role==="customer"&&e.customer_id===user.id&&["requested","quoted","assigned"].includes(old);const adminCan=user.role==="admin"&&!["completed","cancelled"].includes(old);
        if(!customerCan&&!adminCan)throw new Error("This errand can no longer be cancelled by this account.");next="cancelled";note="Errand cancelled by "+user.role+".";await client.query("UPDATE errands SET status=$2,updated_at=now() WHERE id=$1",[id,next]);
      }else if(act==="mark_paid"){
        if(user.role!=="admin")throw new Error("Only operations can record payments.");
        const amount=Number(body.amount);const method=typeof body.method==="string"?body.method.trim().slice(0,80):"";const reference=typeof body.reference==="string"?body.reference.trim().slice(0,160):"";
        if(!Number.isFinite(amount)||amount<0||amount>100000000||method.length<2)throw new Error("Enter a valid amount and payment method.");
        await client.query("INSERT INTO payment_records(errand_id,recorded_by,record_type,amount,currency,method,reference,status,notes) VALUES($1,$2,'customer_payment',$3,'KES',$4,$5,'recorded','Manually recorded by operations.')",[id,user.id,amount,method,reference||null]);await client.query("UPDATE errands SET payment_status='paid',payment_method=$2,payment_reference=$3,updated_at=now() WHERE id=$1",[id,method,reference||null]);note="Operations recorded a customer payment of KES "+amount.toFixed(2)+" ("+method+").";
      }else if(act==="record_payout"){
        if(user.role!=="admin"||!e.provider_id)throw new Error("Only operations can record payout for an assigned provider.");
        const amount=Number(body.amount);const method=typeof body.method==="string"?body.method.trim().slice(0,80):"";const reference=typeof body.reference==="string"?body.reference.trim().slice(0,160):"";
        if(!Number.isFinite(amount)||amount<0||amount>100000000||method.length<2)throw new Error("Enter a valid payout amount and method.");
        await client.query("INSERT INTO payment_records(errand_id,recorded_by,record_type,amount,currency,method,reference,status,notes) VALUES($1,$2,'provider_payout',$3,'KES',$4,$5,'recorded','Manually recorded by operations.')",[id,user.id,amount,method,reference||null]);note="Operations recorded a provider payout of KES "+amount.toFixed(2)+".";
      }else throw new Error("Unsupported errand action.");
      await client.query("INSERT INTO errand_events(errand_id,actor_id,event_type,from_status,to_status,note,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",[id,user.id,event,old,next,note,JSON.stringify({role:user.role})]);
      await client.query("COMMIT");return NextResponse.json({ok:true,message:"Errand "+e.public_code+" updated.",status:next});
    }catch(ex){await client.query("ROLLBACK").catch(()=>undefined);const message=ex instanceof Error?ex.message:"Errand action failed.";return error(message,message.startsWith("Only ")||message.startsWith("This errand")?403:400);}
    finally{client.release();}
  }
  return error("Unknown operation.",404);
}