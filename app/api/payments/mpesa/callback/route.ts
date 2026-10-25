import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { databasePool } from "@/lib/db";

export const runtime = "nodejs";
const text = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0,max) : "";
function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left,right);
}
function normalizedPhone(value: unknown): string {
  const input = String(value ?? "").replace(/\D/g,"");
  if (input.startsWith("0")) return "254" + input.slice(1);
  if (input.startsWith("7") || input.startsWith("1")) return "254" + input;
  return input;
}
function callbackMetadata(stk: any): Map<string,unknown> {
  const items = stk?.CallbackMetadata?.Item;
  return new Map(Array.isArray(items) ? items.filter((item:any)=>item && typeof item.Name==="string").map((item:any)=>[item.Name,item.Value]) : []);
}
function ack(description = "Accepted") {
  return NextResponse.json({ ResultCode: 0, ResultDesc: description });
}

export async function POST(request: Request) {
  const expected = process.env.MPESA_CALLBACK_TOKEN || "";
  const supplied = new URL(request.url).searchParams.get("token") || "";
  if (expected.length < 32 || !sameSecret(expected,supplied)) return NextResponse.json({ error:"Not authorized" },{status:403});
  let payload: any;
  try { payload = await request.json(); } catch { return NextResponse.json({ error:"Invalid callback body" },{status:400}); }
  const stk = payload?.Body?.stkCallback;
  const checkoutId = text(stk?.CheckoutRequestID,200);
  if (!checkoutId) return ack("No checkout identifier; callback ignored.");

  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const lookup = await client.query("SELECT errand_id FROM payment_attempts WHERE checkout_request_id=$1", [checkoutId]);
    if (!lookup.rowCount) { await client.query("COMMIT"); return ack("Unknown checkout; callback ignored."); }
    const errandId = lookup.rows[0].errand_id;
    const errandResult = await client.query("SELECT * FROM errands WHERE id=$1 FOR UPDATE", [errandId]);
    const attemptResult = await client.query("SELECT * FROM payment_attempts WHERE checkout_request_id=$1 FOR UPDATE", [checkoutId]);
    const errand = errandResult.rows[0];
    const attempt = attemptResult.rows[0];
    if (!errand || !attempt) { await client.query("COMMIT"); return ack("Payment attempt no longer exists."); }
    if (attempt.status === "succeeded") { await client.query("COMMIT"); return ack("Payment already recorded."); }

    const resultCode = Number(stk.ResultCode);
    const resultDescription = text(stk.ResultDesc,500) || (resultCode === 0 ? "M-PESA payment succeeded." : "M-PESA payment failed.");
    if (!Number.isFinite(resultCode)) { await client.query("ROLLBACK"); return NextResponse.json({error:"Missing payment result code"},{status:400}); }
    if (resultCode !== 0) {
      await client.query("UPDATE payment_attempts SET status='failed',provider_result_code=$2,provider_result_description=$3,callback_payload=$4::jsonb,updated_at=now() WHERE id=$1", [attempt.id,resultCode,resultDescription,JSON.stringify(payload)]);
      if (errand.app_payment_reference === checkoutId && errand.payment_status !== "paid") await client.query("UPDATE errands SET payment_status='unpaid',app_payment_checkout_status='failed',version=version+1,updated_at=now() WHERE id=$1", [errandId]);
      await client.query("INSERT INTO errand_events(errand_id,actor_id,event_type,from_status,to_status,note,metadata) VALUES($1,$2,'service_payment_failed',$3,$3,$4,$5::jsonb)", [errandId,attempt.customer_id,errand.status,"M-PESA checkout failed: " + resultDescription,JSON.stringify({checkoutRequestId:checkoutId,resultCode})]);
      await client.query("COMMIT");
      return ack("Payment failure recorded.");
    }

    const meta = callbackMetadata(stk);
    const actualAmount = Number(meta.get("Amount"));
    const receipt = text(meta.get("MpesaReceiptNumber"),80);
    const actualPhone = normalizedPhone(meta.get("PhoneNumber"));
    const expectedPhone = normalizedPhone(attempt.phone_number);
    const merchantRequestMatches = !attempt.merchant_request_id || text(stk.MerchantRequestID,200) === attempt.merchant_request_id;
    const validSuccess = receipt.length >= 6 && Number.isFinite(actualAmount) && actualAmount === Number(attempt.amount) && actualPhone === expectedPhone && merchantRequestMatches;
    if (!validSuccess) {
      await client.query("UPDATE payment_attempts SET status='verification_pending',provider_result_code=0,provider_result_description='Success callback received but transaction details need verification.',callback_payload=$2::jsonb,updated_at=now() WHERE id=$1", [attempt.id,JSON.stringify(payload)]);
      await client.query("UPDATE errands SET app_payment_checkout_status='initiated',version=version+1,updated_at=now() WHERE id=$1 AND payment_status<>'paid'", [errandId]);
      await client.query("INSERT INTO errand_events(errand_id,actor_id,event_type,from_status,to_status,note,metadata) VALUES($1,$2,'service_payment_verification_required',$3,$3,$4,$5::jsonb)", [errandId,attempt.customer_id,errand.status,"M-PESA reported success, but the amount, phone or receipt did not match the stored checkout. Operations must reconcile it.",JSON.stringify({checkoutRequestId:checkoutId,callbackAmount:Number.isFinite(actualAmount)?actualAmount:null,receiptPresent:!!receipt})]);
      await client.query("COMMIT");
      return ack("Payment sent for verification.");
    }

    await client.query("UPDATE payment_attempts SET status='succeeded',provider_receipt=$2,provider_result_code=0,provider_result_description=$3,callback_payload=$4::jsonb,updated_at=now() WHERE id=$1", [attempt.id,receipt,resultDescription,JSON.stringify(payload)]);
    await client.query(
      "INSERT INTO payment_records(errand_id,recorded_by,record_type,amount,currency,method,reference,status,notes,idempotency_key) VALUES($1,$2,'service_payment',$3,'KES','M-Pesa',$4,'recorded','Confirmed by the M-PESA STK Push callback. Seller goods are paid separately.',$5) ON CONFLICT(errand_id,idempotency_key) DO NOTHING",
      [errandId,attempt.customer_id,Number(attempt.amount),receipt,"mpesa-stk-"+checkoutId]
    );
    await client.query("UPDATE errands SET payment_status='paid',payment_method='M-Pesa',payment_reference=$2,app_payment_reference=$3,app_payment_checkout_status='succeeded',paid_at=now(),version=version+1,updated_at=now() WHERE id=$1", [errandId,receipt,checkoutId]);
    await client.query("INSERT INTO errand_events(errand_id,actor_id,event_type,from_status,to_status,note,metadata) VALUES($1,$2,'service_payment_succeeded',$3,$3,$4,$5::jsonb)", [errandId,attempt.customer_id,errand.status,"Errand service fee paid by M-PESA. Seller goods are separate.",JSON.stringify({checkoutRequestId:checkoutId,receipt,amount:Number(attempt.amount)})]);
    await client.query("INSERT INTO notifications(user_id,kind,title,body,href,entity_type,entity_id) VALUES($1,'payment','Errand service fee paid',$2,'/','errand',$3)", [attempt.customer_id,errand.public_code+" · M-PESA payment confirmed.",errandId]);
    await client.query("COMMIT");
    return ack("Payment confirmed and recorded.");
  } catch {
    await client.query("ROLLBACK").catch(()=>undefined);
    return NextResponse.json({error:"Could not persist the payment callback; retry delivery."},{status:500});
  } finally { client.release(); }
}
