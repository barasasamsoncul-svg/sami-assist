import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { databasePool, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const text = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
function normalizePhone(value: unknown): string | null {
  const input = text(value, 40).replace(/[\s()-]/g, "");
  let phone = input;
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  if (/^[71]\d{8}$/.test(phone)) phone = "254" + phone;
  return /^254(?:7|1)\d{8}$/.test(phone) ? phone : null;
}
function nairobiTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return map.year + map.month + map.day + map.hour + map.minute + map.second;
}
function configuration() {
  const environment = process.env.MPESA_ENV === "production" ? "production" : "sandbox";
  const shortcode = process.env.MPESA_SHORTCODE || "";
  const consumerKey = process.env.MPESA_CONSUMER_KEY || "";
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET || "";
  const passkey = process.env.MPESA_PASSKEY || "";
  const callbackToken = process.env.MPESA_CALLBACK_TOKEN || "";
  const transactionType = process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline";
  const missing = [
    ["MPESA_SHORTCODE", shortcode], ["MPESA_CONSUMER_KEY", consumerKey],
    ["MPESA_CONSUMER_SECRET", consumerSecret], ["MPESA_PASSKEY", passkey],
    ["MPESA_CALLBACK_TOKEN", callbackToken]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (!["CustomerPayBillOnline", "CustomerBuyGoodsOnline"].includes(transactionType)) missing.push("MPESA_TRANSACTION_TYPE (CustomerPayBillOnline or CustomerBuyGoodsOnline)");
  return { environment, shortcode, consumerKey, consumerSecret, passkey, callbackToken, transactionType, missing };
}
async function markAttemptFailed(id: string, errandId: string, message: string) {
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const attempt = await client.query("UPDATE payment_attempts SET status='failed',provider_result_description=$2,updated_at=now() WHERE id=$1 AND status='initiating' RETURNING checkout_request_id", [id, message.slice(0, 500)]);
    if (attempt.rowCount) await client.query("UPDATE errands SET app_payment_checkout_status='failed',payment_status='unpaid',version=version+1,updated_at=now() WHERE id=$1 AND payment_status<>'paid'", [errandId]);
    await client.query("COMMIT");
  } catch { await client.query("ROLLBACK").catch(()=>undefined); }
  finally { client.release(); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("Cross-origin checkout is not permitted.", 403);
  const user = await getCurrentUser(request).catch(() => null);
  if (!user || user.role !== "customer") return fail("Sign in with a customer account to pay for an errand.", 401);
  const config = configuration();
  if (config.missing.length) {
    console.error("[SaMi M-PESA] In-app checkout is disabled because server configuration is incomplete.");
    return fail("In-app M-PESA payments are temporarily unavailable. Choose cash payment or contact SaMi support.", 503);
  }

  let body: any;
  try { body = await request.json(); } catch { return fail("Invalid checkout request."); }
  const errandId = text(body.errandId, 80);
  const phone = normalizePhone(body.phone);
  if (!errandId) return fail("Choose an errand before starting checkout.");
  if (!phone) return fail("Enter a valid Kenyan M-PESA mobile number, such as 07XXXXXXXX or 2547XXXXXXXX.");

  const client = await databasePool().connect();
  let attemptId = "";
  let amount = 0;
  let publicCode = "";
  try {
    await client.query("BEGIN");
    const r = await client.query("SELECT id,public_code,customer_id,status,service_fee_amount,service_payment_method,payment_status FROM errands WHERE id=$1 AND customer_id=$2 FOR UPDATE", [errandId,user.id]);
    const errand = r.rows[0];
    if (!errand) { await client.query("ROLLBACK"); return fail("Errand not found or access is not permitted.",404); }
    if (errand.service_payment_method !== "in_app") { await client.query("ROLLBACK"); return fail("This errand is set to cash. Change the service payment method before using M-PESA.",409); }
    if (errand.payment_status === "paid") { await client.query("ROLLBACK"); return fail("The errand service fee is already paid.",409); }
    if (["cancelled","disputed"].includes(errand.status)) { await client.query("ROLLBACK"); return fail("This errand cannot start a new payment in its current status.",409); }
    const active = await client.query("SELECT id,status,created_at FROM payment_attempts WHERE errand_id=$1 AND status IN ('initiating','pending','verification_pending') ORDER BY created_at DESC LIMIT 1", [errandId]);
    if (active.rowCount) { await client.query("ROLLBACK"); return fail("A payment request is already pending for this errand. Check the customer’s phone and wait for its result before trying again.",409); }
    amount = Math.round(Number(errand.service_fee_amount));
    if (!Number.isFinite(amount) || amount <= 0) { await client.query("ROLLBACK"); return fail("This errand has no payable service fee.",409); }
    attemptId = randomUUID();
    publicCode = String(errand.public_code);
    await client.query(
      "INSERT INTO payment_attempts(id,errand_id,customer_id,provider,status,amount,phone_number,idempotency_key) VALUES($1,$2,$3,'mpesa','initiating',$4,$5,$6)",
      [attemptId,errandId,user.id,amount,phone,randomUUID()]
    );
    await client.query("UPDATE errands SET app_payment_checkout_status='initiated',payment_status='pending',version=version+1,updated_at=now() WHERE id=$1", [errandId]);
    await client.query("INSERT INTO errand_events(errand_id,actor_id,event_type,from_status,to_status,note,metadata) VALUES($1,$2,'service_payment_initiated',$3,$3,$4,$5::jsonb)", [errandId,user.id,errand.status,"Customer initiated an M-PESA prompt for the errand-service fee.",JSON.stringify({amount,phoneLastFour:phone.slice(-4),provider:"mpesa"})]);
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(()=>undefined);
    return fail("Could not prepare the payment attempt. Please retry.",503);
  } finally { client.release(); }

  const baseUrl = config.environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  try {
    const authResponse = await fetch(baseUrl + "/oauth/v1/generate?grant_type=client_credentials", {
      method: "GET",
      headers: { Authorization: "Basic " + Buffer.from(config.consumerKey + ":" + config.consumerSecret).toString("base64") },
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    const authData: any = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || !authData.access_token) throw new Error("M-PESA authorization failed. Verify the Daraja app credentials.");
    const timestamp = nairobiTimestamp();
    const password = Buffer.from(config.shortcode + config.passkey + timestamp).toString("base64");
    const callbackUrl = new URL(process.env.MPESA_CALLBACK_URL || "/api/payments/mpesa/callback", new URL(request.url).origin);
    callbackUrl.searchParams.set("token", config.callbackToken);
    const accountReference = "SE" + randomBytes(5).toString("hex").toUpperCase();
    const stkResponse = await fetch(baseUrl + "/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: "Bearer " + authData.access_token, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: config.transactionType,
        Amount: amount,
        PartyA: phone,
        PartyB: config.shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl.toString(),
        AccountReference: accountReference,
        TransactionDesc: "SaMi service fee"
      })
    });
    const stkData: any = await stkResponse.json().catch(() => ({}));
    if (!stkResponse.ok || String(stkData.ResponseCode ?? "") !== "0" || !stkData.CheckoutRequestID) {
      const detail = text(stkData.errorMessage || stkData.ResponseDescription || stkData.ResponseDesc, 400) || "The payment provider did not accept the checkout request.";
      throw new Error(detail);
    }
    await query(
      "UPDATE payment_attempts SET status='pending',merchant_request_id=$2,checkout_request_id=$3,provider_response=$4::jsonb,updated_at=now() WHERE id=$1",
      [attemptId, text(stkData.MerchantRequestID,200), text(stkData.CheckoutRequestID,200), JSON.stringify(stkData)]
    );
    await query("UPDATE errands SET app_payment_reference=$2,app_payment_checkout_status='initiated',version=version+1,updated_at=now() WHERE id=$1", [errandId,text(stkData.CheckoutRequestID,200)]);
    return NextResponse.json({
      ok:true, status:"pending", customerMessage:text(stkData.CustomerMessage,300) || "Check your phone and enter your M-PESA PIN to pay the errand-service fee.",
      message:"M-PESA payment prompt sent for " + publicCode + ". Only the errand-service fee is being charged; goods paid to the seller are separate."
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "The payment provider could not start checkout.";
    await markAttemptFailed(attemptId,errandId,message);
    return fail(message,502);
  }
}
