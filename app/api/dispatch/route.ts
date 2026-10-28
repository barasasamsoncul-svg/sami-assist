import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { databasePool, query } from "@/lib/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { getRoadRoute } from "@/lib/location";
import { ensureErrandLocationSchema } from "@/lib/errand-location-schema";
import { ensureErrandCallSchema } from "@/lib/errand-call-schema";

export const runtime = "nodejs";
type UserRole = "customer" | "provider" | "admin";
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const emailText = (value: unknown) => text(value, 254).toLowerCase();
const num = (value: unknown) => value === "" || value == null ? null : Number(value);
const itemSizes = new Set(["none","small","medium","large","bulky"]);
function calculateServicePrice(rule: Record<string, any>, input: { distanceKm: number; itemSize: string; itemValue: number; priority: string }) {
  const baseFee = Number(rule.base_fee);
  const multiplier = Number(rule[input.priority + "_priority_multiplier"] ?? rule.standard_priority_multiplier ?? 1);
  const distanceFeeRaw = input.distanceKm * Number(rule.distance_rate_per_km ?? 25);
  const sizeKey = input.itemSize === "none" ? "" : input.itemSize + "_item_fee";
  const sizeFeeRaw = sizeKey ? Number(rule[sizeKey] ?? 0) : 0;
  const threshold = Number(rule.value_surcharge_threshold ?? 10000);
  const rate = Number(rule.value_surcharge_rate ?? 0.5);
  const valueFeeRaw = Math.max(0, input.itemValue - threshold) * rate / 100;
  const distanceFee = Math.round(distanceFeeRaw * multiplier * 100) / 100;
  const itemSizeFee = Math.round(sizeFeeRaw * multiplier * 100) / 100;
  const valueSurcharge = Math.round(valueFeeRaw * multiplier * 100) / 100;
  const serviceFee = Math.round((baseFee + distanceFeeRaw + sizeFeeRaw + valueFeeRaw) * multiplier);
  const commissionRate = Number(rule.commission_rate);
  const commission = Math.round(serviceFee * commissionRate) / 100;
  const providerEarning = Math.round((serviceFee - commission) * 100) / 100;
  return { serviceFee, commissionRate, commission, providerEarning, distanceFee, itemSizeFee, valueSurcharge, multiplier, baseFee };
}
function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }
function isNativeClient(request: Request) { return request.headers.get("x-sami-client") === "native" && !request.headers.get("origin"); }
function randomCode() { return "SE-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomBytes(3).toString("hex").toUpperCase(); }
function buildIceServers(userId: string) {
  const servers: Array<Record<string, unknown>> = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turnUrls = (process.env.TURN_SERVER_URL || "").split(",").map(value => value.trim()).filter(Boolean);
  const turnSecret = process.env.TURN_SHARED_SECRET || "";
  if (turnUrls.length && turnSecret.length >= 32) {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const username = expiry + ":" + userId;
    const credential = createHmac("sha1", turnSecret).update(username).digest("base64");
    servers.push({ urls: turnUrls, username, credential });
  }
  return servers;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
function safeHref(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value.slice(0, 300) : null;
}
async function attemptCount(identifierHash: string, attemptType: string) {
  const result = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM auth_attempts WHERE identifier_hash=$1 AND attempt_type=$2 AND succeeded=false AND attempted_at > now() - interval '15 minutes'",
    [identifierHash, attemptType]
  );
  return Number(result.rows[0]?.count || 0);
}
async function recordAttempt(identifierHash: string, attemptType: string, succeeded: boolean) {
  await query("INSERT INTO auth_attempts(identifier_hash,attempt_type,succeeded) VALUES($1,$2,$3)", [identifierHash, attemptType, succeeded]);
}
async function notify(userId: string, kind: string, title: string, body: string, href: string | null, entityType?: string, entityId?: string) {
  if (!userId) return;
  await query(
    "INSERT INTO notifications(user_id,kind,title,body,href,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [userId, kind, title.slice(0, 160), body.slice(0, 1000), safeHref(href || ""), entityType || null, entityId || null]
  ).catch(() => undefined);
}
async function addEvent(client: { query: (...args: any[]) => Promise<any> }, errandId: string, actorId: string | null, eventType: string, from: string | null, to: string | null, note: string, metadata: Record<string, unknown> = {}) {
  await client.query(
    "INSERT INTO errand_events(errand_id,actor_id,event_type,from_status,to_status,note,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
    [errandId, actorId, eventType, from, to, note.slice(0, 1000), JSON.stringify(metadata)]
  );
}
async function getScopedErrand(id: string, user: { id: string; role: UserRole }) {
  const result = await query(
    "SELECT e.*, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, p.full_name AS provider_name, p.email AS provider_email, pp.business_name AS provider_business_name, pp.service_area AS provider_service_area, live.latitude AS provider_latitude, live.longitude AS provider_longitude, live.accuracy_meters AS provider_location_accuracy_meters, live.heading_degrees AS provider_heading_degrees, live.speed_meters_per_second AS provider_speed_meters_per_second, live.updated_at AS provider_location_updated_at FROM errands e JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id LEFT JOIN provider_profiles pp ON pp.user_id=p.id LEFT JOIN errand_live_locations live ON live.errand_id=e.id AND live.updated_at>now()-interval '90 seconds' AND e.status IN ('accepted','in_progress') WHERE e.id=$1 AND ($2='admin' OR e.customer_id=$3 OR e.provider_id=$3 OR ($2='provider' AND e.provider_id IS NULL AND e.status='requested' AND EXISTS (SELECT 1 FROM provider_profiles viewer WHERE viewer.user_id=$3 AND viewer.approval_status='approved' AND viewer.available=true AND (COALESCE(array_length(viewer.service_categories,1),0)=0 OR e.category=ANY(viewer.service_categories) OR 'other'=ANY(viewer.service_categories)) AND NOT EXISTS (SELECT 1 FROM errands active WHERE active.provider_id=$3 AND active.status IN ('assigned','accepted','in_progress','completion_submitted'))))) LIMIT 1",
    [id, user.role, user.id]
  );
  return result.rows[0] || null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const action = params.get("action") || "";
  if (action === "bootstrapStatus") {
    try {
      const r = await query<{ admin_exists: boolean }>("SELECT EXISTS(SELECT 1 FROM users WHERE role='admin') AS admin_exists");
      const adminExists = Boolean(r.rows[0]?.admin_exists);
      const tokenConfigured = (process.env.ADMIN_BOOTSTRAP_TOKEN || "").length >= 32;
      return NextResponse.json({ adminExists, tokenConfigured, setupAvailable: !adminExists && tokenConfigured });
    } catch {
      return error("Could not verify administrator setup. Check the Preview database configuration and try again.", 503);
    }
  }
  if (action === "health") {
    try {
      const r = await query<{ schema_version: string | null }>(
        "SELECT (SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1) AS schema_version, now()::text AS checked_at"
      );
      return NextResponse.json({ status: "ok", app: "SaMi", database: "connected", schemaVersion: r.rows[0]?.schema_version || null });
    } catch {
      return error("Database connectivity or schema check failed.", 503);
    }
  }
  if (action === "paymentMethods") {
    const requiredSettings = [
      process.env.MPESA_SHORTCODE,
      process.env.MPESA_CONSUMER_KEY,
      process.env.MPESA_CONSUMER_SECRET,
      process.env.MPESA_PASSKEY,
      process.env.MPESA_CALLBACK_TOKEN,
    ];
    const transactionType = process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline";
    const mpesaInApp = requiredSettings.every(value => typeof value === "string" && value.trim().length > 0)
      && ["CustomerPayBillOnline", "CustomerBuyGoodsOnline"].includes(transactionType);
    return NextResponse.json(
      { paymentMethods: { cash: true, mpesaInApp } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (action === "pricing") {
    try {
      const r = await query("SELECT category,service_name,base_fee,commission_rate,low_priority_multiplier,standard_priority_multiplier,high_priority_multiplier,urgent_priority_multiplier,distance_rate_per_km,small_item_fee,medium_item_fee,large_item_fee,bulky_item_fee,value_surcharge_threshold,value_surcharge_rate FROM service_pricing WHERE enabled=true ORDER BY category");
      const keys = ["base_fee","commission_rate","low_priority_multiplier","standard_priority_multiplier","high_priority_multiplier","urgent_priority_multiplier","distance_rate_per_km","small_item_fee","medium_item_fee","large_item_fee","bulky_item_fee","value_surcharge_threshold","value_surcharge_rate"];
      return NextResponse.json({ pricing: r.rows.map(p => Object.fromEntries(Object.entries(p).map(([k,v]) => [k, keys.includes(k) ? Number(v) : v]))) });
    } catch (e) {
      console.error("[SaMi pricing] Unable to load configurable pricing rules.");
      return error("Service pricing is temporarily unavailable. The pricing migration may not have been applied.", 503);
    }
  }
  const user = await getCurrentUser(request).catch(() => null);
  if (action === "me") return user ? NextResponse.json({ user }) : error("Not signed in.", 401);
  if (!user) return error("Sign in to continue.", 401);
  if (["errands","errandDetail"].includes(action)) {
    try { await ensureErrandLocationSchema(); } catch (e) {
      console.error("[SaMi location migration] Could not prepare location tracking schema.", e instanceof Error ? e.message : "unknown error");
      return error("SaMi location tracking is not ready. Check the errands database migration.", 503);
    }
  }

  if (action === "errands") {
    const status = text(params.get("status"), 40);
    const search = text(params.get("q"), 120);
    try {
      let result;
      if (user.role === "admin") {
        result = await query(
          "SELECT e.*, c.full_name AS customer_name, c.email AS customer_email, p.full_name AS provider_name, pp.business_name AS provider_business_name FROM errands e JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id LEFT JOIN provider_profiles pp ON pp.user_id=p.id WHERE ($1='' OR e.status=$1) AND ($2='' OR e.title ILIKE '%'||$2||'%' OR e.public_code ILIKE '%'||$2||'%' OR e.service_area ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%') ORDER BY CASE e.status WHEN 'disputed' THEN 0 WHEN 'requested' THEN 1 WHEN 'completion_submitted' THEN 2 ELSE 3 END, e.created_at DESC LIMIT 250",
          [status, search]
        );
      } else if (user.role === "provider") {
        result = await query(
          "SELECT e.*, c.full_name AS customer_name, p.full_name AS provider_name, pp.business_name AS provider_business_name FROM errands e JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id LEFT JOIN provider_profiles pp ON pp.user_id=p.id WHERE (e.provider_id=$1 OR (e.provider_id IS NULL AND e.status='requested' AND EXISTS (SELECT 1 FROM provider_profiles viewer WHERE viewer.user_id=$1 AND viewer.approval_status='approved' AND viewer.available=true AND (COALESCE(array_length(viewer.service_categories,1),0)=0 OR e.category=ANY(viewer.service_categories) OR 'other'=ANY(viewer.service_categories)) AND NOT EXISTS (SELECT 1 FROM errands active WHERE active.provider_id=$1 AND active.status IN ('assigned','accepted','in_progress','completion_submitted'))))) AND ($2='' OR e.status=$2) AND ($3='' OR e.title ILIKE '%'||$3||'%' OR e.public_code ILIKE '%'||$3||'%') ORDER BY CASE WHEN e.provider_id IS NULL AND e.status='requested' THEN 0 ELSE 1 END, e.created_at DESC LIMIT 150",
          [user.id, status, search]
        );
      } else {
        result = await query(
          "SELECT e.*, c.full_name AS customer_name, p.full_name AS provider_name, pp.business_name AS provider_business_name FROM errands e JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id LEFT JOIN provider_profiles pp ON pp.user_id=p.id WHERE e.customer_id=$1 AND ($2='' OR e.status=$2) AND ($3='' OR e.title ILIKE '%'||$3||'%' OR e.public_code ILIKE '%'||$3||'%') ORDER BY e.created_at DESC LIMIT 150",
          [user.id, status, search]
        );
      }
      return NextResponse.json({ errands: result.rows });
    } catch { return error("Unable to load errands right now.", 503); }
  }

  if (action === "dashboard") {
    try {
      if (user.role === "admin") {
        const r = await query(
          "SELECT count(*)::int AS total, count(*) FILTER(WHERE status='requested')::int AS needs_review, count(*) FILTER(WHERE status IN ('assigned','accepted','in_progress','completion_submitted'))::int AS active, count(*) FILTER(WHERE status='disputed')::int AS disputes, count(*) FILTER(WHERE status='completed')::int AS completed, count(*) FILTER(WHERE payment_status<>'paid' AND status IN ('completed','completion_submitted','disputed'))::int AS awaiting_payment, coalesce(sum(commission_amount) FILTER(WHERE payment_status='paid'),0)::numeric(14,2)::text AS recorded_revenue, coalesce(sum(provider_earning_amount) FILTER(WHERE status='completed'),0)::numeric(14,2)::text AS provider_payouts FROM errands"
        );
        const p = await query("SELECT count(*) FILTER(WHERE approval_status='pending')::int AS pending, count(*) FILTER(WHERE approval_status='approved' AND available=true)::int AS available FROM provider_profiles");
        const recent = await query("SELECT e.id,e.public_code,e.title,e.status,e.created_at,e.service_area,c.full_name AS customer_name FROM errands e JOIN users c ON c.id=e.customer_id ORDER BY e.created_at DESC LIMIT 6");
        return NextResponse.json({ metrics: r.rows[0], providers: p.rows[0], recent: recent.rows });
      }
      const filter = user.role === "customer" ? "customer_id" : "provider_id";
      const r = await query(
        "SELECT count(*)::int AS total, count(*) FILTER(WHERE status IN ('requested','assigned','accepted','in_progress','completion_submitted'))::int AS active, count(*) FILTER(WHERE status='completed')::int AS completed, count(*) FILTER(WHERE status='disputed')::int AS disputes, coalesce(sum(service_fee_amount) FILTER(WHERE payment_status='paid'),0)::numeric(14,2)::text AS recorded_total FROM errands WHERE " + filter + "=$1",
        [user.id]
      );
      const p = user.role === "provider"
        ? await query("SELECT coalesce(sum(amount) FILTER(WHERE record_type='provider_payout' AND status IN ('recorded','reconciled')),0)::numeric(14,2)::text AS earnings, count(*) FILTER(WHERE status='pending')::int AS pending FROM payment_records WHERE errand_id IN (SELECT id FROM errands WHERE provider_id=$1)", [user.id])
        : { rows: [{ earnings: "0", pending: 0 }] };
      return NextResponse.json({ metrics: r.rows[0], earnings: p.rows[0] });
    } catch { return error("Dashboard metrics are temporarily unavailable.", 503); }
  }

  if (action === "providers") {
    if (user.role !== "admin") return error("Operations access is required.", 403);
    try {
      const r = await query(
        "SELECT u.id AS user_id,u.full_name,u.email,u.phone,pp.provider_type,pp.business_name,pp.service_area,pp.service_categories,pp.bio,pp.approval_status,pp.rejection_reason,pp.available,pp.verified_at,pp.completed_jobs,pp.rating_average,pp.rating_count,pp.created_at FROM users u JOIN provider_profiles pp ON pp.user_id=u.id WHERE u.role='provider' ORDER BY CASE pp.approval_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, pp.created_at DESC LIMIT 300"
      );
      return NextResponse.json({ providers: r.rows });
    } catch { return error("Provider list is temporarily unavailable.", 503); }
  }

  if (action === "providerProfile") {
    if (user.role !== "provider") return error("Only providers have service profiles.", 403);
    try {
      const r = await query("SELECT u.full_name,u.email,u.phone,pp.provider_type,pp.business_name,pp.service_categories,pp.service_area,pp.bio,pp.approval_status,pp.rejection_reason,pp.available,pp.verified_at,pp.completed_jobs,pp.rating_average,pp.rating_count FROM users u JOIN provider_profiles pp ON pp.user_id=u.id WHERE u.id=$1", [user.id]);
      return r.rows[0] ? NextResponse.json({ profile: r.rows[0] }) : error("Provider profile not found.", 404);
    } catch { return error("Could not load provider profile.", 503); }
  }

  if (action === "payments") {
    try {
      let result;
      if (user.role === "admin") {
        result = await query(
          "SELECT pr.*, e.public_code,e.title,e.status AS errand_status,c.full_name AS customer_name,p.full_name AS provider_name, recorder.full_name AS recorded_by_name FROM payment_records pr JOIN errands e ON e.id=pr.errand_id JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id JOIN users recorder ON recorder.id=pr.recorded_by ORDER BY pr.created_at DESC LIMIT 300"
        );
      } else if (user.role === "provider") {
        result = await query(
          "SELECT pr.*,e.public_code,e.title,e.status AS errand_status,c.full_name AS customer_name,p.full_name AS provider_name FROM payment_records pr JOIN errands e ON e.id=pr.errand_id JOIN users c ON c.id=e.customer_id LEFT JOIN users p ON p.id=e.provider_id WHERE e.provider_id=$1 AND pr.record_type IN ('provider_payout','service_payment','seller_payment','refund') ORDER BY pr.created_at DESC LIMIT 150",
          [user.id]
        );
      } else {
        result = await query(
          "SELECT pr.*,e.public_code,e.title,e.status AS errand_status,c.full_name AS customer_name FROM payment_records pr JOIN errands e ON e.id=pr.errand_id JOIN users c ON c.id=e.customer_id WHERE e.customer_id=$1 AND pr.record_type IN ('service_payment','seller_payment','refund') ORDER BY pr.created_at DESC LIMIT 150",
          [user.id]
        );
      }
      return NextResponse.json({ payments: result.rows });
    } catch { return error("Payment records are temporarily unavailable.", 503); }
  }

  if (action === "notifications") {
    try {
      const r = await query("SELECT id,kind,title,body,href,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [user.id]);
      const unread = await query("SELECT count(*)::int AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL", [user.id]);
      return NextResponse.json({ notifications: r.rows, unread: unread.rows[0]?.count || 0 });
    } catch { return error("Notifications are temporarily unavailable.", 503); }
  }

  if (action === "callSync") {
    try { await ensureErrandCallSchema(); } catch (e) {
      console.error("[SaMi call schema] Calling is not ready.", e instanceof Error ? e.message : "unknown error");
      return error("In-app calling is not enabled yet. The production database call migration must be applied first.", 503);
    }

    const callId = text(params.get("callId"), 80);
    const errandId = text(params.get("errandId"), 80);
    const afterValue = Number(params.get("after") || 0);
    const after = Number.isSafeInteger(afterValue) && afterValue >= 0 ? afterValue : 0;
    try {
      await query(
        "UPDATE errand_calls SET status='missed',ended_at=now(),updated_at=now() WHERE status='ringing' AND created_at < now()-interval '45 seconds'"
      );
      await query(
        "UPDATE errand_calls SET status='ended',ended_at=now(),updated_at=now() WHERE status='active' AND updated_at < now()-interval '2 hours'"
      );
      const paramsForCall = callId
        ? [callId, user.id]
        : [errandId, user.id];
      const sql = callId
        ? "SELECT c.*,e.public_code,e.title AS errand_title,e.status AS errand_status,caller.full_name AS caller_name,callee.full_name AS callee_name FROM errand_calls c JOIN errands e ON e.id=c.errand_id JOIN users caller ON caller.id=c.caller_id JOIN users callee ON callee.id=c.callee_id WHERE c.id=$1 AND (c.caller_id=$2 OR c.callee_id=$2) LIMIT 1"
        : "SELECT c.*,e.public_code,e.title AS errand_title,e.status AS errand_status,caller.full_name AS caller_name,callee.full_name AS callee_name FROM errand_calls c JOIN errands e ON e.id=c.errand_id JOIN users caller ON caller.id=c.caller_id JOIN users callee ON callee.id=c.callee_id WHERE c.errand_id=$1 AND (c.caller_id=$2 OR c.callee_id=$2) AND c.status IN ('ringing','active') ORDER BY c.created_at DESC LIMIT 1";
      if (!callId && !errandId) return error("An errand or call identifier is required.");
      const result = await query(sql, paramsForCall);
      const call = result.rows[0] || null;
      if (!call) return NextResponse.json({ call: null, signals: [], iceServers: buildIceServers(user.id) });
      if (user.role === "admin" || ![call.caller_id, call.callee_id].includes(user.id)) {
        return error("Only the customer and assigned provider can join this errand call.", 403);
      }
      const signals = await query(
        "SELECT id,signal_type,payload,from_user_id,created_at FROM errand_call_signals WHERE call_id=$1 AND id>$2 AND from_user_id<>$3 ORDER BY id ASC LIMIT 100",
        [call.id, after, user.id]
      );
      return NextResponse.json({
        call,
        signals: signals.rows,
        nextAfter: signals.rows.length ? Number(signals.rows[signals.rows.length - 1].id) : after,
        iceServers: buildIceServers(user.id),
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      console.error("[SaMi call sync] Signalling lookup failed.", e instanceof Error ? e.message : "unknown error");
      return error("Call status could not be checked right now.", 503);
    }
  }

  if (action === "exportMyData") {
    if (user.role !== "customer") return error("Customer data export is available from a customer account.", 403);
    try {
      const [profile, errands, payments, notifications, messages, ratings] = await Promise.all([
        query("SELECT id,full_name,email,phone,role FROM users WHERE id=$1", [user.id]),
        query("SELECT * FROM errands WHERE customer_id=$1 ORDER BY created_at DESC", [user.id]),
        query("SELECT pr.* FROM payment_records pr JOIN errands e ON e.id=pr.errand_id WHERE e.customer_id=$1 ORDER BY pr.created_at DESC", [user.id]),
        query("SELECT id,kind,title,body,href,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC", [user.id]),
        query("SELECT m.id,m.errand_id,m.sender_id,m.message,m.created_at FROM errand_messages m JOIN errands e ON e.id=m.errand_id WHERE e.customer_id=$1 ORDER BY m.created_at ASC", [user.id]),
        query("SELECT id,errand_id,score,comment,created_at FROM errand_ratings WHERE reviewer_id=$1 ORDER BY created_at DESC", [user.id]),
      ]);
      return NextResponse.json({
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        retentionNote: "This export includes your customer profile, errands, payment records, notifications, errand messages and ratings. SaMi's financial and audit records may be retained as required by applicable law.",
        profile: profile.rows[0] || null,
        errands: errands.rows,
        payments: payments.rows,
        notifications: notifications.rows,
        messages: messages.rows,
        ratings: ratings.rows,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      console.error("[SaMi data export] Customer export failed.", e instanceof Error ? e.message : "unknown error");
      return error("Your data export could not be prepared right now. Please retry.", 503);
    }
  }

  if (action === "errandDetail") {
    const id = text(params.get("id"), 80);
    if (!id) return error("Errand identifier is required.");
    try {
      const errand = await getScopedErrand(id, user);
      if (!errand) return error("Errand not found or access is not permitted.", 404);
      const [events, messages, ratings] = await Promise.all([
        query("SELECT ev.id,ev.event_type,ev.from_status,ev.to_status,ev.note,ev.created_at,u.full_name AS actor_name FROM errand_events ev LEFT JOIN users u ON u.id=ev.actor_id WHERE ev.errand_id=$1 ORDER BY ev.created_at ASC LIMIT 200", [id]),
        query("SELECT m.id,m.sender_id,m.message,m.created_at,u.full_name AS sender_name,u.role AS sender_role FROM errand_messages m JOIN users u ON u.id=m.sender_id WHERE m.errand_id=$1 ORDER BY m.created_at ASC LIMIT 100", [id]),
        query("SELECT r.id,r.score,r.comment,r.created_at,u.full_name AS reviewer_name FROM errand_ratings r JOIN users u ON u.id=r.reviewer_id WHERE r.errand_id=$1 ORDER BY r.created_at DESC", [id])
      ]);
      return NextResponse.json({ errand, events: events.rows, messages: messages.rows, ratings: ratings.rows });
    } catch { return error("Unable to load errand details.", 503); }
  }

  return error("Unknown operation.", 404);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return error("Cross-origin request rejected.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("A valid JSON request is required.");
  const action = text(body.action, 50);

  if (action === "register") {
    const fullName = text(body.fullName, 120);
    const email = emailText(body.email);
    const phone = text(body.phone, 32);
    const role: Exclude<UserRole, "admin"> = body.role === "provider" ? "provider" : "customer";
    const password = typeof body.password === "string" ? body.password : "";
    if (fullName.length < 2) return error("Enter your full name.");
    if (!validEmail(email)) return error("Enter a valid email address.");
    if (password.length < 12 || password.length > 128) return error("Choose a password between 12 and 128 characters.");
    const identifier = hash("register:" + email);
    try {
      if (await attemptCount(identifier, "register") >= 8) return error("Too many registration attempts for this email. Try again in 15 minutes.", 429);
      const client = await databasePool().connect();
      let created: any;
      try {
        await client.query("BEGIN");
        const passwordHash = await bcrypt.hash(password, 12);
        const r = await client.query(
          "INSERT INTO users(full_name,email,phone,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,full_name,email,role,phone",
          [fullName, email, phone || null, passwordHash, role]
        );
        created = r.rows[0];
        if (role === "provider") await client.query("INSERT INTO provider_profiles(user_id,provider_type) VALUES($1,'individual')", [created.id]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") {
          await recordAttempt(identifier, "register", false);
          return error("An account with this email already exists.", 409);
        }
        throw e;
      } finally { client.release(); }
      await recordAttempt(identifier, "register", true).catch(() => undefined);
      const sessionToken = await createSession(created.id);
      if (role === "provider") {
        const admins = await query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND is_active=true");
        for (const admin of admins.rows) await notify(admin.id, "provider_application", "New provider application", fullName + " applied to join the provider network.", "/", "provider", created.id);
      }
      return NextResponse.json({ user: created, ...(isNativeClient(request) ? { token: sessionToken } : {}) }, { status: 201 });
    } catch { return error("Account creation failed. Please retry.", 503); }
  }

  if (action === "login") {
    const email = emailText(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!validEmail(email) || !password || password.length > 128) return error("Enter your email and password.");
    const identifier = hash("login:" + email);
    try {
      if (await attemptCount(identifier, "login") >= 10) return error("Too many unsuccessful sign-in attempts. Try again in 15 minutes.", 429);
      const r = await query<{ id: string; password_hash: string; is_active: boolean }>(
        "SELECT id,password_hash,is_active FROM users WHERE lower(email)=$1 LIMIT 1", [email]
      );
      const u = r.rows[0];
      if (!u || !u.is_active || !(await bcrypt.compare(password, u.password_hash))) {
        await recordAttempt(identifier, "login", false);
        return error("Email or password is incorrect.", 401);
      }
      await recordAttempt(identifier, "login", true).catch(() => undefined);
      const sessionToken = await createSession(u.id);
      if (isNativeClient(request)) {
        const profile = await query<{ id: string; full_name: string; email: string; role: UserRole; phone: string | null }>(
          "SELECT id,full_name,email,role,phone FROM users WHERE id=$1 AND is_active=true LIMIT 1", [u.id]
        );
        return NextResponse.json({ ok: true, token: sessionToken, user: profile.rows[0] });
      }
      return NextResponse.json({ ok: true });
    } catch { return error("Sign-in is temporarily unavailable.", 503); }
  }

  if (action === "logout") {
    await destroySession(request).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if (action === "bootstrap") {
    const expected = process.env.ADMIN_BOOTSTRAP_TOKEN || "";
    const supplied = request.headers.get("x-admin-bootstrap-token") || "";
    const identifier = hash("bootstrap:" + supplied);
    try {
      if (await attemptCount(identifier, "bootstrap") >= 5) return error("Too many setup attempts. Contact the deployment administrator.", 429);
      if (expected.length < 32 || supplied.length < 32 || supplied !== expected) {
        await recordAttempt(identifier, "bootstrap", false).catch(() => undefined);
        console.warn("[SaMi admin bootstrap] Request rejected: token missing, mismatched, or not configured for this Preview deployment.", { tokenConfigured: expected.length >= 32 });
        return error(expected.length < 32
          ? "Admin setup is not configured for this deployment. Set ADMIN_BOOTSTRAP_TOKEN for the feat/sami-errands-transformation Preview branch, then redeploy."
          : "The setup token does not match this deployment. Confirm the Preview token and make sure you are using the latest deployment.", 403);
      }
      const fullName = text(body.fullName, 120);
      const email = emailText(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      if (fullName.length < 2 || !validEmail(email) || password.length < 14 || password.length > 128) return error("Enter a name, valid email and password of at least 14 characters.");
      const client = await databasePool().connect();
      let adminId = "";
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('sami_errands_admin_bootstrap'))");
        const existing = await client.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
        if (existing.rowCount) {
          await client.query("ROLLBACK");
          return error("An administrator already exists. Sign in normally.", 409);
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const created = await client.query("INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,'admin') RETURNING id", [fullName, email, passwordHash]);
        adminId = created.rows[0].id;
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") return error("That email is already registered.", 409);
        console.error("[SaMi admin bootstrap] Database operation failed.", e instanceof Error ? e.message : "unknown error");
        return error("Admin account creation failed because of a database or email constraint. Check the Preview database connection and try again.", 503);
      } finally { client.release(); }
      await recordAttempt(identifier, "bootstrap", true).catch(() => undefined);
      const sessionToken = await createSession(adminId);
      return NextResponse.json({
        ok: true,
        message: "Administrator created and signed in.",
        ...(isNativeClient(request) ? { token: sessionToken } : {}),
      }, { status: 201 });
    } catch (e) {
      await recordAttempt(identifier, "bootstrap", false).catch(() => undefined);
      console.error("[SaMi admin bootstrap] Request failed before account creation.", e instanceof Error ? e.message : "unknown error");
      return error("Admin setup could not finish. Check the Preview database, then refresh this page and retry.", 503);
    }
  }

  const user = await getCurrentUser(request).catch(() => null);
  if (!user) return error("Sign in to continue.", 401);
  if (["createErrand","errandAction","updateProviderLocation"].includes(action)) {
    try { await ensureErrandLocationSchema(); } catch (e) {
      console.error("[SaMi location migration] Could not prepare location tracking schema.", e instanceof Error ? e.message : "unknown error");
      return error("SaMi location tracking is not ready. Check the errands database migration.", 503);
    }
  }

  if (action === "changePassword") {
    if (user.role !== "customer") return error("Password settings in this customer app are available to customer accounts.", 403);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!currentPassword || newPassword.length < 12 || newPassword.length > 128) {
      return error("Enter your current password and a new password of 12–128 characters.");
    }
    try {
      const result = await query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1 AND is_active=true LIMIT 1", [user.id]);
      const existingHash = result.rows[0]?.password_hash;
      if (!existingHash || !(await bcrypt.compare(currentPassword, existingHash))) return error("Your current password is incorrect.", 401);
      if (currentPassword === newPassword) return error("Choose a new password that differs from your current password.");
      const nextHash = await bcrypt.hash(newPassword, 12);
      const bearer = /^Bearer\\s+([A-Za-z0-9_-]{40,128})$/i.exec(request.headers.get("authorization") || "");
      const currentSessionHash = bearer?.[1] ? hash(bearer[1]) : "";
      const client = await databasePool().connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE users SET password_hash=$2 WHERE id=$1 AND is_active=true", [user.id, nextHash]);
        if (currentSessionHash) {
          await client.query("DELETE FROM user_sessions WHERE user_id=$1 AND token_hash<>$2", [user.id, currentSessionHash]);
        } else {
          await client.query("DELETE FROM user_sessions WHERE user_id=$1", [user.id]);
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally { client.release(); }
      return NextResponse.json({ ok: true, message: "Password updated. Other signed-in sessions have been revoked." });
    } catch (e) {
      console.error("[SaMi password change] Update failed.", e instanceof Error ? e.message : "unknown error");
      return error("Your password could not be updated right now. Please retry.", 503);
    }
  }

  if (action === "deleteAccount") {
    if (user.role !== "customer") return error("Only customer accounts can be deleted from this customer app.", 403);
    const password = typeof body.password === "string" ? body.password : "";
    if (text(body.confirmation, 12) !== "DELETE") return error("Type DELETE to confirm account deletion.");
    if (!password) return error("Enter your current password to confirm account deletion.");
    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE id=$1 AND is_active=true FOR UPDATE", [user.id]
      );
      if (!current.rows[0] || !(await bcrypt.compare(password, current.rows[0].password_hash))) {
        await client.query("ROLLBACK");
        return error("Your current password is incorrect.", 401);
      }
      const active = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM errands WHERE customer_id=$1 AND status NOT IN ('completed','cancelled')",
        [user.id]
      );
      if (Number(active.rows[0]?.count || 0) > 0) {
        await client.query("ROLLBACK");
        return error("Finish or cancel your open errands and resolve any disputes before deleting your account.", 409);
      }

      // Remove customer-provided details from closed errand records while preserving
      // financial amounts, statuses, references and timestamps required for reconciliation.
      await client.query(
        "UPDATE errands SET title='Errand details removed',description='Personal details removed at the customer’s request.',pickup_location=NULL,destination_location=NULL,service_area='Removed',pickup_latitude=NULL,pickup_longitude=NULL,destination_latitude=NULL,destination_longitude=NULL WHERE customer_id=$1 AND status IN ('completed','cancelled')",
        [user.id]
      );
      await client.query(
        "UPDATE errand_messages SET message='Message removed at the customer’s request.' WHERE sender_id=$1 AND errand_id IN (SELECT id FROM errands WHERE customer_id=$1)",
        [user.id]
      );
      await client.query("UPDATE errand_ratings SET comment=NULL WHERE reviewer_id=$1", [user.id]);
      await client.query("DELETE FROM notifications WHERE user_id=$1", [user.id]);
      await client.query("DELETE FROM user_sessions WHERE user_id=$1", [user.id]);
      const replacementHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
      await client.query(
        "UPDATE users SET full_name='Deleted customer',email='deleted+'||id::text||'@deleted.sami.invalid',phone=NULL,password_hash=$2,is_active=false WHERE id=$1",
        [user.id, replacementHash]
      );
      await client.query("COMMIT");
      return NextResponse.json({
        ok: true,
        message: "Your account has been deactivated and personal profile details removed. Errand descriptions, locations, messages and ratings comments were redacted. Financial amounts, transaction references and audit timestamps are retained where needed for reconciliation and legal obligations.",
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("[SaMi account deletion] Request failed.", e instanceof Error ? e.message : "unknown error");
      return error("Your account could not be deleted right now. No deletion was completed; please retry or contact SaMi support.", 503);
    } finally { client.release(); }
  }

  if (["startErrandCall","answerErrandCall","sendErrandCallSignal","endErrandCall","rejectErrandCall"].includes(action)) {
    try { await ensureErrandCallSchema(); } catch (e) {
      console.error("[SaMi call schema] Calling is not ready.", e instanceof Error ? e.message : "unknown error");
      return error("In-app calling is not enabled yet. The production database call migration must be applied first.", 503);
    }

    if (user.role === "admin") return error("Operations accounts cannot join customer-provider voice calls.", 403);
    const callId = text(body.callId, 80);

    if (action === "startErrandCall") {
      const errandId = text(body.errandId, 80);
      const offer = body.offer;
      if (!errandId || !offer || typeof offer !== "object" || Array.isArray(offer) || JSON.stringify(offer).length > 12000) {
        return error("A valid errand and voice-call offer are required.");
      }
      const client = await databasePool().connect();
      try {
        await client.query("BEGIN");
        const e = await client.query(
          "SELECT id,customer_id,provider_id,status,public_code,title FROM errands WHERE id=$1 FOR UPDATE",
          [errandId]
        );
        const row = e.rows[0];
        if (!row || !row.provider_id || !["assigned","accepted","in_progress","completion_submitted"].includes(row.status)) {
          await client.query("ROLLBACK");
          return error("Voice calling becomes available after an errand provider has been assigned.", 409);
        }
        let calleeId: string;
        if (user.role === "customer" && row.customer_id === user.id) calleeId = row.provider_id;
        else if (user.role === "provider" && row.provider_id === user.id) calleeId = row.customer_id;
        else {
          await client.query("ROLLBACK");
          return error("Only the customer and assigned provider can start this call.", 403);
        }

        await client.query(
          "UPDATE errand_calls SET status=CASE WHEN status='ringing' THEN 'missed' ELSE 'ended' END,ended_at=now(),updated_at=now() WHERE errand_id=$1 AND status IN ('ringing','active') AND ((status='ringing' AND created_at < now()-interval '45 seconds') OR (status='active' AND updated_at < now()-interval '2 hours'))",
          [errandId]
        );
        const existing = await client.query(
          "SELECT id FROM errand_calls WHERE errand_id=$1 AND status IN ('ringing','active') LIMIT 1",
          [errandId]
        );
        if (existing.rowCount) {
          await client.query("ROLLBACK");
          return error("There is already a call for this errand. Join it or wait until it ends.", 409);
        }
        const inserted = await client.query(
          "INSERT INTO errand_calls(errand_id,caller_id,callee_id,status) VALUES($1,$2,$3,'ringing') RETURNING id,status,created_at",
          [errandId,user.id,calleeId]
        );
        const created = inserted.rows[0];
        const signal = await client.query(
          "INSERT INTO errand_call_signals(call_id,from_user_id,signal_type,payload) VALUES($1,$2,'offer',$3::jsonb) RETURNING id",
          [created.id,user.id,JSON.stringify(offer)]
        );
        await client.query(
          "INSERT INTO notifications(user_id,kind,title,body,href,entity_type,entity_id) VALUES($1,'incoming_call','Incoming SaMi call',$2,'/','errand',$3)",
          [calleeId,row.public_code+" · "+row.title,errandId]
        );
        await client.query("COMMIT");
        return NextResponse.json({ call: created, offerSignalId: Number(signal.rows[0].id), iceServers: buildIceServers(user.id) }, { status: 201 });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") {
          return error("A voice call for this errand is already in progress.", 409);
        }
        console.error("[SaMi start call] Could not create call.", e instanceof Error ? e.message : "unknown error");
        return error("The call could not be started. Please try again.", 503);
      } finally { client.release(); }
    }

    if (!callId) return error("A call identifier is required.");
    if (action === "answerErrandCall") {
      const answer = body.answer;
      if (!answer || typeof answer !== "object" || Array.isArray(answer) || JSON.stringify(answer).length > 12000) {
        return error("A valid voice-call answer is required.");
      }
      const client = await databasePool().connect();
      try {
        await client.query("BEGIN");
        const r = await client.query(
          "SELECT c.*,e.status AS errand_status FROM errand_calls c JOIN errands e ON e.id=c.errand_id WHERE c.id=$1 FOR UPDATE OF c",
          [callId]
        );
        const call = r.rows[0];
        if (!call || call.callee_id !== user.id) { await client.query("ROLLBACK"); return error("Only the invited participant can answer this call.", 403); }
        if (call.status !== "ringing" || !["assigned","accepted","in_progress","completion_submitted"].includes(call.errand_status)) {
          await client.query("ROLLBACK");
          return error("This call has ended or is no longer available.", 409);
        }
        await client.query("UPDATE errand_calls SET status='active',answered_at=now(),updated_at=now() WHERE id=$1", [callId]);
        await client.query(
          "INSERT INTO errand_call_signals(call_id,from_user_id,signal_type,payload) VALUES($1,$2,'answer',$3::jsonb)",
          [callId,user.id,JSON.stringify(answer)]
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok:true, status:"active" });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("[SaMi answer call] Could not answer call.", e instanceof Error ? e.message : "unknown error");
        return error("This call could not be answered.", 503);
      } finally { client.release(); }
    }

    if (action === "sendErrandCallSignal") {
      const signalType = text(body.signalType, 30);
      const payload = body.payload;
      if (signalType !== "ice_candidate" || !payload || typeof payload !== "object" || Array.isArray(payload) || JSON.stringify(payload).length > 12000) {
        return error("Only valid WebRTC connection candidates can be sent.");
      }
      try {
        const call = await query(
          "SELECT id,caller_id,callee_id,status FROM errand_calls WHERE id=$1 LIMIT 1",
          [callId]
        );
        const row = call.rows[0];
        if (!row || ![row.caller_id,row.callee_id].includes(user.id)) return error("Call not found or access is not permitted.", 404);
        if (!["ringing","active"].includes(row.status)) return error("This call has ended.", 409);
        await query(
          "INSERT INTO errand_call_signals(call_id,from_user_id,signal_type,payload) VALUES($1,$2,'ice_candidate',$3::jsonb)",
          [callId,user.id,JSON.stringify(payload)]
        );
        await query("UPDATE errand_calls SET updated_at=now() WHERE id=$1", [callId]);
        return NextResponse.json({ ok:true });
      } catch (e) {
        console.error("[SaMi call candidate] Signalling failed.", e instanceof Error ? e.message : "unknown error");
        return error("The call connection could not be updated.", 503);
      }
    }

    if (action === "endErrandCall" || action === "rejectErrandCall") {
      const client = await databasePool().connect();
      try {
        await client.query("BEGIN");
        const r = await client.query("SELECT * FROM errand_calls WHERE id=$1 FOR UPDATE", [callId]);
        const call = r.rows[0];
        if (!call || ![call.caller_id,call.callee_id].includes(user.id)) {
          await client.query("ROLLBACK");
          return error("Call not found or access is not permitted.", 404);
        }
        if (action === "rejectErrandCall" && (call.callee_id !== user.id || call.status !== "ringing")) {
          await client.query("ROLLBACK");
          return error("Only the invited participant can decline a ringing call.", 409);
        }
        const nextStatus = action === "rejectErrandCall" ? "rejected" : "ended";
        await client.query(
          "UPDATE errand_calls SET status=$2,ended_at=now(),updated_at=now() WHERE id=$1 AND status IN ('ringing','active')",
          [callId,nextStatus]
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok:true,status:nextStatus });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("[SaMi end call] Could not finish call.", e instanceof Error ? e.message : "unknown error");
        return error("The call could not be ended.", 503);
      } finally { client.release(); }
    }
  }

  if (action === "updateProviderLocation") {
    if (user.role !== "provider") return error("Only provider accounts can share live task locations.", 403);
    const id = text(body.id, 80);
    const latitude = num(body.latitude);
    const longitude = num(body.longitude);
    const accuracy = num(body.accuracyMeters);
    const heading = num(body.headingDegrees);
    const speed = num(body.speedMetersPerSecond);
    if (!id || latitude === null || longitude === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return error("Valid provider latitude and longitude are required.");
    }
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000)) return error("Invalid GPS accuracy.");
    if (heading !== null && (!Number.isFinite(heading) || heading < 0 || heading > 360)) return error("Invalid heading.");
    if (speed !== null && (!Number.isFinite(speed) || speed < 0 || speed > 150)) return error("Invalid GPS speed.");
    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      const task = await client.query("SELECT id,provider_id,status FROM errands WHERE id=$1 FOR UPDATE", [id]);
      const errand = task.rows[0];
      if (!errand || errand.provider_id !== user.id) { await client.query("ROLLBACK"); return error("Only the assigned provider can share location for this errand.", 403); }
      if (!["accepted","in_progress"].includes(errand.status)) { await client.query("ROLLBACK"); return error("Provider location sharing is available only while an accepted task is active.", 409); }
      const upsert = await client.query(
        "INSERT INTO errand_live_locations(errand_id,provider_id,latitude,longitude,accuracy_meters,heading_degrees,speed_meters_per_second,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(errand_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_meters=EXCLUDED.accuracy_meters,heading_degrees=EXCLUDED.heading_degrees,speed_meters_per_second=EXCLUDED.speed_meters_per_second,updated_at=now() RETURNING updated_at",
        [id,user.id,latitude,longitude,accuracy,heading,speed]
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok:true, updatedAt:upsert.rows[0]?.updated_at });
    } catch (e) {
      await client.query("ROLLBACK").catch(()=>undefined);
      console.error("[SaMi live location] Update failed.", e instanceof Error ? e.message : "unknown error");
      return error("Provider location could not be shared right now.", 503);
    } finally { client.release(); }
  }

  if (action === "updatePricing") {
    if (user.role !== "admin") return error("Operations access is required.", 403);
    const category = text(body.category,40);
    const serviceName = text(body.serviceName,120);
    const baseFee = Number(body.baseFee);
    const commissionRate = Number(body.commissionRate);
    const low = Number(body.lowPriorityMultiplier);
    const standard = Number(body.standardPriorityMultiplier);
    const high = Number(body.highPriorityMultiplier);
    const urgent = Number(body.urgentPriorityMultiplier);
    const distanceRate = Number(body.distanceRatePerKm);
    const smallFee = Number(body.smallItemFee);
    const mediumFee = Number(body.mediumItemFee);
    const largeFee = Number(body.largeItemFee);
    const bulkyFee = Number(body.bulkyItemFee);
    const valueThreshold = Number(body.valueSurchargeThreshold);
    const valueRate = Number(body.valueSurchargeRate);
    if (!category || !Number.isFinite(baseFee) || baseFee < 0 || baseFee > 1000000) return error("Enter a valid non-negative service fee.");
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) return error("Commission must be between 0% and 100%.");
    if ([low,standard,high,urgent].some(n => !Number.isFinite(n) || n <= 0 || n > 5)) return error("Priority multipliers must be greater than zero and no more than 5.");
    if ([distanceRate,smallFee,mediumFee,largeFee,bulkyFee].some(n => !Number.isFinite(n) || n < 0 || n > 100000)) return error("Distance and item-size fees must be between KES 0 and KES 100,000.");
    if (!Number.isFinite(valueThreshold) || valueThreshold < 0 || valueThreshold > 100000000) return error("Value surcharge threshold must be between KES 0 and KES 100,000,000.");
    if (!Number.isFinite(valueRate) || valueRate < 0 || valueRate > 100) return error("Value surcharge rate must be between 0% and 100%.");
    try {
      const client = await databasePool().connect();
      let updated: any;
      try {
        await client.query("BEGIN");
        const previous = await client.query("SELECT * FROM service_pricing WHERE category=$1 FOR UPDATE", [category]);
        if (!previous.rowCount) { await client.query("ROLLBACK"); return error("Pricing rule not found.",404); }
        const result = await client.query(
          "UPDATE service_pricing SET service_name=$2,base_fee=$3,commission_rate=$4,low_priority_multiplier=$5,standard_priority_multiplier=$6,high_priority_multiplier=$7,urgent_priority_multiplier=$8,distance_rate_per_km=$9,small_item_fee=$10,medium_item_fee=$11,large_item_fee=$12,bulky_item_fee=$13,value_surcharge_threshold=$14,value_surcharge_rate=$15,updated_at=now() WHERE category=$1 RETURNING *",
          [category,serviceName||previous.rows[0].service_name,baseFee,commissionRate,low,standard,high,urgent,distanceRate,smallFee,mediumFee,largeFee,bulkyFee,valueThreshold,valueRate]
        );
        updated=result.rows[0];
        const values = (r: any) => ({
          serviceName:r.service_name,baseFee:Number(r.base_fee),commissionRate:Number(r.commission_rate),
          lowPriorityMultiplier:Number(r.low_priority_multiplier),standardPriorityMultiplier:Number(r.standard_priority_multiplier),
          highPriorityMultiplier:Number(r.high_priority_multiplier),urgentPriorityMultiplier:Number(r.urgent_priority_multiplier),
          distanceRatePerKm:Number(r.distance_rate_per_km),smallItemFee:Number(r.small_item_fee),
          mediumItemFee:Number(r.medium_item_fee),largeItemFee:Number(r.large_item_fee),bulkyItemFee:Number(r.bulky_item_fee),
          valueSurchargeThreshold:Number(r.value_surcharge_threshold),valueSurchargeRate:Number(r.value_surcharge_rate)
        });
        await client.query(
          "INSERT INTO pricing_audit_events(actor_id,category,previous_values,new_values) VALUES($1,$2,$3::jsonb,$4::jsonb)",
          [user.id,category,JSON.stringify(values(previous.rows[0])),JSON.stringify(values(updated))]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(()=>undefined);
        console.error("[SaMi pricing] Update failed for category:", category, e instanceof Error ? e.message : "unknown error");
        return error("Pricing could not be saved. Check that the pricing migration is applied.",503);
      } finally { client.release(); }
      return NextResponse.json({ok:true,message:"Pricing rule saved.",pricing:updated});
    } catch { return error("Pricing could not be saved.",503); }
  }

  if (action === "createErrand") {
    if (user.role !== "customer") return error("Only customer accounts can submit new errands.", 403);
    const title = text(body.title, 160);
    const category = text(body.category, 40);
    const description = text(body.description, 5000);
    const serviceArea = text(body.serviceArea, 180);
    const pickup = text(body.pickupLocation, 300);
    const destination = text(body.destinationLocation, 300);
    const coordinate = (value: unknown, min: number, max: number) => {
      const parsed = num(value);
      return parsed !== null && Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
    };
    const provided = (value: unknown) => value !== "" && value !== null && value !== undefined;
    const pickupLatitude = coordinate(body.pickupLatitude, -90, 90);
    const pickupLongitude = coordinate(body.pickupLongitude, -180, 180);
    const destinationLatitude = coordinate(body.destinationLatitude, -90, 90);
    const destinationLongitude = coordinate(body.destinationLongitude, -180, 180);
    if ((provided(body.pickupLatitude) && pickupLatitude === null) ||
        (provided(body.pickupLongitude) && pickupLongitude === null) ||
        (provided(body.destinationLatitude) && destinationLatitude === null) ||
        (provided(body.destinationLongitude) && destinationLongitude === null)) return error("Map coordinates are outside valid latitude/longitude ranges.");
    const partialPickupPoint = provided(body.pickupLatitude) !== provided(body.pickupLongitude);
    const partialDestinationPoint = provided(body.destinationLatitude) !== provided(body.destinationLongitude);
    const hasCompletePickupPoint = pickupLatitude !== null && pickupLongitude !== null;
    const hasCompleteDestinationPoint = destinationLatitude !== null && destinationLongitude !== null;
    const hasCompletePoints = hasCompletePickupPoint && hasCompleteDestinationPoint;
    const allowed = new Set(["shopping","clothing_retail","pickup_delivery","documents_admin","personal_errand","queue_appointments","business_support","local_assistance","other"]);
    const itemBudget = num(body.itemBudgetAmount);
    let distanceKm = Number(body.distanceKm ?? 0);
    let routeDistanceMeters: number | null = null;
    let routeDurationSeconds: number | null = null;
    if (partialPickupPoint || partialDestinationPoint) return error("Each selected map point needs both latitude and longitude.");
    if (hasCompletePoints) {
      try {
        const route = await getRoadRoute(
          { lat: pickupLatitude as number, lng: pickupLongitude as number },
          { lat: destinationLatitude as number, lng: destinationLongitude as number },
        );
        distanceKm = Math.round(route.distanceKm * 100) / 100;
        routeDistanceMeters = Math.round(route.distanceMeters);
        routeDurationSeconds = Math.round(route.durationSeconds);
      } catch (e) {
        console.error("[SaMi route pricing] Road route failed.", e instanceof Error ? e.message : "unknown error");
        return error("SaMi could not calculate a road route for these locations. Try selecting both points again or configure GOOGLE_ROUTES_API_KEY / MAP_ROUTING_BASE_URL.", 502);
      }
    }
    const itemSize = itemSizes.has(text(body.itemSize, 20)) ? text(body.itemSize, 20) : "none";
    const dueAt = text(body.dueAt, 60);
    const due = dueAt ? new Date(dueAt) : null;
    const priority = new Set(["low","standard","high","urgent"]).has(text(body.priority, 20)) ? text(body.priority, 20) : "standard";
    const servicePaymentMethod = body.servicePaymentMethod === "in_app" ? "in_app" : "cash";
    if (title.length < 3 || description.length < 5 || serviceArea.length < 2 || !allowed.has(category)) return error("Check the task title, details, category and service area.");
    if (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 500) return error("Enter an estimated end-to-end travel distance between 0 and 500 km.");
    if ((pickup || destination) && distanceKm <= 0) return error("Enter the estimated route distance when a pickup or destination is provided.");
    if (servicePaymentMethod === "in_app" && ["MPESA_SHORTCODE","MPESA_CONSUMER_KEY","MPESA_CONSUMER_SECRET","MPESA_PASSKEY","MPESA_CALLBACK_TOKEN"].some(key => !process.env[key])) return error("M-PESA in-app checkout is not configured for this Preview yet. Choose cash until Daraja credentials are configured.",503);
    if (itemBudget !== null && (!Number.isFinite(itemBudget) || itemBudget < 0 || itemBudget > 100000000)) return error("Enter a valid estimated seller/goods budget.");
    if (due && (!Number.isFinite(due.getTime()) || due.getTime() < Date.now() - 86400000)) return error("Choose a valid due date.");
    try {
      const pricingResult = await query("SELECT * FROM service_pricing WHERE category=$1 AND enabled=true", [category]);
      const rule = pricingResult.rows[0];
      if (!rule) return error("This errand category is not currently available.", 409);
      const price = calculateServicePrice(rule, { distanceKm, itemSize, itemValue:itemBudget ?? 0, priority });
      const { serviceFee, commissionRate, commission, providerEarning, distanceFee, itemSizeFee, valueSurcharge, multiplier, baseFee } = price;
      const code = randomCode();
      const client = await databasePool().connect();
      let row: any;
      try {
        await client.query("BEGIN");
        const insert = await client.query(
          "INSERT INTO errands(public_code,customer_id,title,category,description,pickup_location,destination_location,service_area,due_at,distance_km,item_size,distance_fee_amount,item_size_fee_amount,value_surcharge_amount,budget_amount,item_budget_amount,priority,service_fee_amount,commission_rate,commission_amount,provider_earning_amount,service_payment_method,payment_status,app_payment_checkout_status,seller_payment_status,pickup_latitude,pickup_longitude,destination_latitude,destination_longitude,route_distance_meters,route_duration_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING *",
          [code,user.id,title,category,description,pickup||null,destination||null,serviceArea,due,distanceKm,itemSize,distanceFee,itemSizeFee,valueSurcharge,itemBudget,priority,serviceFee,commissionRate,commission,providerEarning,servicePaymentMethod,servicePaymentMethod==="in_app"?"pending":"unpaid","not_started",itemBudget === null ? "not_applicable" : "due",pickupLatitude,pickupLongitude,destinationLatitude,destinationLongitude,routeDistanceMeters,routeDurationSeconds]
        );
        row = insert.rows[0];
        await addEvent(client,row.id,user.id,"request_created",null,"requested","Customer submitted an errand request.",{
          category,priority,baseFee,distanceKm,distanceFee,itemSize,itemSizeFee,itemBudget,valueSurcharge,multiplier,serviceFee,commissionRate,commission,providerEarning,servicePaymentMethod,merchantCostIsSeparate:true
        });
        const admins = await client.query("SELECT id FROM users WHERE role='admin' AND is_active=true");
        for (const admin of admins.rows) await client.query(
          "INSERT INTO notifications(user_id,kind,title,body,href,entity_type,entity_id) VALUES($1,'new_errand','New errand request',$2,'/','errand',$3)",
          [admin.id,code+" · "+title+" · Errand service KES "+serviceFee.toFixed(2),row.id]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(()=>undefined);
        console.error("[SaMi request] Could not save errand:", e instanceof Error ? e.message : "unknown error");
        return error("The request could not be saved. The database schema may need its pricing migration applied.",503);
      } finally { client.release(); }
      return NextResponse.json({
        errand:row,
        price:{...price,itemValue:itemBudget,itemSize,distanceKm,servicePaymentMethod},
        paymentNotice:servicePaymentMethod==="in_app" ? "In-app payment is selected. The request remains unpaid until the configured payment provider confirms a successful transaction." : "Cash is selected for the errand-service fee. Any goods/seller amount is separate and paid to the seller."
      },{status:201});
    } catch (e) {
      console.error("[SaMi request] Pricing/request creation failed:", e instanceof Error ? e.message : "unknown error");
      return error("Service pricing or request creation is temporarily unavailable.",503);
    }
  }
  if (action === "providerProfile") {
    if (user.role !== "provider") return error("Only provider accounts can edit service profiles.", 403);
    const providerType = new Set(["individual", "business", "team"]).has(text(body.providerType, 20)) ? text(body.providerType, 20) : "individual";
    const businessName = text(body.businessName, 160);
    const serviceArea = text(body.serviceArea, 180);
    const bio = text(body.bio, 1200);
    const categories = Array.isArray(body.serviceCategories) ? body.serviceCategories.map((v: unknown) => text(v, 40)).filter((v: string) => ["shopping","clothing_retail","pickup_delivery","documents_admin","personal_errand","queue_appointments","business_support","local_assistance","other"].includes(v)).slice(0, 6) : [];
    if (serviceArea.length < 2 || categories.length === 0) return error("Add at least one service category and a service area before submitting your profile.");
    if (providerType !== "individual" && businessName.length < 2) return error("Enter the team or business name.");
    try {
      const r = await query(
        "UPDATE provider_profiles SET provider_type=$2,business_name=$3,service_area=$4,bio=$5,service_categories=$6,updated_at=now(),rejection_reason=NULL,approval_status=CASE WHEN approval_status='rejected' THEN 'pending' ELSE approval_status END WHERE user_id=$1 RETURNING approval_status",
        [user.id, providerType, businessName || null, serviceArea, bio || null, categories]
      );
      if (!r.rowCount) return error("Provider profile not found.", 404);
      if (r.rows[0].approval_status === "pending") {
        const admins = await query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND is_active=true");
        for (const admin of admins.rows) await notify(admin.id, "provider_profile_updated", "Provider profile ready for review", user.full_name + " updated their service profile.", "/", "provider", user.id);
      }
      return NextResponse.json({ ok: true, message: "Service profile saved.", approvalStatus: r.rows[0].approval_status });
    } catch { return error("Provider profile could not be saved.", 503); }
  }

  if (action === "updateProviderProfile") {
    if (user.role !== "provider") return error("Only provider accounts can edit provider profiles.", 403);
    const providerType = new Set(["individual", "business", "team"]).has(text(body.providerType, 20))
      ? text(body.providerType, 20) : "individual";
    const businessName = text(body.businessName, 160);
    const serviceArea = text(body.serviceArea, 180);
    const bio = text(body.bio, 1500);
    const allowedCategories = new Set(["shopping","clothing_retail","pickup_delivery","documents_admin","personal_errand","queue_appointments","business_support","local_assistance","other"]);
    const serviceCategories = Array.isArray(body.serviceCategories)
      ? [...new Set(body.serviceCategories.filter((value: unknown): value is string => typeof value === "string").map((value: string) => text(value, 40)).filter((value: string) => allowedCategories.has(value)))]
      : [];
    if (serviceArea.length < 2) return error("Enter the towns or areas where you can provide service.");
    if (providerType === "business" && businessName.length < 2) return error("Enter your business name.");
    if (!serviceCategories.length) return error("Choose at least one errand category you can handle.");
    try {
      const saved = await query<{ approval_status: string }>(
        "UPDATE provider_profiles SET provider_type=$2,business_name=$3,service_area=$4,bio=$5,service_categories=$6::text[],approval_status=CASE WHEN approval_status='rejected' THEN 'pending' ELSE approval_status END,rejection_reason=CASE WHEN approval_status='rejected' THEN NULL ELSE rejection_reason END,available=CASE WHEN approval_status='approved' THEN available ELSE false END,updated_at=now() WHERE user_id=$1 RETURNING approval_status",
        [user.id, providerType, providerType === "individual" ? null : (businessName || null), serviceArea, bio || null, serviceCategories]
      );
      if (!saved.rowCount) return error("Provider profile not found.", 404);
      if (saved.rows[0].approval_status === "pending") {
        const admins = await query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND is_active=true");
        for (const admin of admins.rows) {
          await notify(admin.id, "provider_application", "Provider profile ready for review", user.full_name + " updated their provider profile and is awaiting review.", "/", "provider", user.id);
        }
      }
      return NextResponse.json({
        ok: true,
        approvalStatus: saved.rows[0].approval_status,
        message: saved.rows[0].approval_status === "approved"
          ? "Provider profile updated."
          : "Provider profile saved. SaMi operations must approve it before you can accept errands."
      });
    } catch {
      return error("Provider profile could not be saved. Try again.", 503);
    }
  }

  if (action === "providerAvailability") {
    if (user.role !== "provider") return error("Only providers can update availability.", 403);
    const available = body.available === true;
    try {
      const r = await query("UPDATE provider_profiles SET available=$2,updated_at=now() WHERE user_id=$1 AND approval_status='approved' RETURNING available", [user.id, available]);
      if (!r.rowCount) return error("Your provider profile must be approved before you can accept assignments.", 409);
      return NextResponse.json({ ok: true, available: r.rows[0].available, message: available ? "You are marked available." : "You are marked unavailable." });
    } catch { return error("Availability could not be updated.", 503); }
  }

  if (action === "providerReview") {
    if (user.role !== "admin") return error("Operations access is required.", 403);
    const providerId = text(body.providerId, 80);
    const decision = text(body.decision, 20);
    if (!providerId || !["approve", "reject", "suspend", "reinstate"].includes(decision)) return error("Choose a provider and review decision.");
    const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : decision === "suspend" ? "suspended" : "approved";
    const rejectionReason = text(body.reason, 1000);
    if (decision === "reject" && rejectionReason.length < 5) return error("Give a short reason so the applicant knows what to improve.");
    try {
      const r = await query(
        "UPDATE provider_profiles pp SET approval_status=$2,rejection_reason=$3,verified_at=CASE WHEN $2='approved' THEN now() ELSE pp.verified_at END,available=CASE WHEN $2='approved' THEN pp.available ELSE false END,updated_at=now() FROM users u WHERE pp.user_id=$1 AND u.id=pp.user_id AND u.role='provider' RETURNING pp.user_id,pp.approval_status",
        [providerId, status, decision === "reject" ? rejectionReason : null]
      );
      if (!r.rowCount) return error("Provider profile not found.", 404);
      await notify(providerId, "provider_review", "Provider application updated", decision === "approve" ? "Your service profile has been approved. You can now receive assignments." : decision === "reject" ? "Your service profile needs changes: " + rejectionReason : decision === "suspend" ? "Your provider access has been temporarily suspended. Contact operations for details." : "Your provider access has been reinstated.", "/", "provider", providerId);
      return NextResponse.json({ ok: true, message: "Provider " + status + ".", approvalStatus: status });
    } catch { return error("Provider review failed.", 503); }
  }

  if (action === "sendMessage") {
    const errandId = text(body.errandId, 80);
    const message = text(body.message, 4000);
    if (message.length < 1) return error("Write a message before sending.");
    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      const e = await client.query("SELECT * FROM errands WHERE id=$1 FOR UPDATE", [errandId]);
      const row = e.rows[0];
      if (!row || !(user.role === "admin" || row.customer_id === user.id || row.provider_id === user.id)) {
        await client.query("ROLLBACK");
        return error("Errand not found or messaging access is not permitted.", 404);
      }
      const m = await client.query("INSERT INTO errand_messages(errand_id,sender_id,message) VALUES($1,$2,$3) RETURNING id,message,created_at", [errandId, user.id, message]);
      await addEvent(client, errandId, user.id, "message_sent", row.status, row.status, "Message sent.", { messageId: m.rows[0].id });
      const recipients = [row.customer_id, row.provider_id, ...(user.role !== "admin" ? [] : [])].filter((id: string | null) => id && id !== user.id);
      if (user.role !== "admin") {
        const admins = await client.query("SELECT id FROM users WHERE role='admin' AND is_active=true AND id<>$1", [user.id]);
        for (const admin of admins.rows) recipients.push(admin.id);
      }
      for (const recipient of new Set(recipients)) {
        await client.query(
          "INSERT INTO notifications(user_id,kind,title,body,href,entity_type,entity_id) VALUES($1,'message','New errand message',$2,'/','errand',$3)",
          [recipient, row.public_code + " · " + message.slice(0, 150), errandId]
        );
      }
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, message: m.rows[0] }, { status: 201 });
    } catch { await client.query("ROLLBACK").catch(() => undefined); return error("Message could not be sent.", 503); }
    finally { client.release(); }
  }

  if (action === "markNotificationRead") {
    const id = text(body.id, 80);
    try {
      if (id) await query("UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2", [id, user.id]);
      else await query("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL", [user.id]);
      return NextResponse.json({ ok: true });
    } catch { return error("Notification could not be updated.", 503); }
  }

  if (action === "addRating") {
    if (user.role !== "customer") return error("Only customers can rate a completed errand.", 403);
    const errandId = text(body.errandId, 80);
    const score = Number(body.score);
    const comment = text(body.comment, 1200);
    if (!Number.isInteger(score) || score < 1 || score > 5) return error("Choose a rating from 1 to 5.");
    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      const r = await client.query("SELECT * FROM errands WHERE id=$1 FOR UPDATE", [errandId]);
      const e = r.rows[0];
      if (!e || e.customer_id !== user.id || e.status !== "completed" || !e.provider_id) {
        await client.query("ROLLBACK");
        return error("Only a completed errand assigned to your account can be rated.", 409);
      }
      await client.query("INSERT INTO errand_ratings(errand_id,reviewer_id,reviewee_id,score,comment) VALUES($1,$2,$3,$4,$5)", [errandId, user.id, e.provider_id, score, comment || null]);
      await client.query(
        "UPDATE provider_profiles pp SET rating_average=(SELECT avg(score)::numeric(3,2) FROM errand_ratings WHERE reviewee_id=pp.user_id),rating_count=(SELECT count(*)::int FROM errand_ratings WHERE reviewee_id=pp.user_id),updated_at=now() WHERE pp.user_id=$1",
        [e.provider_id]
      );
      await client.query("COMMIT");
      await notify(e.provider_id, "rating", "You received a customer rating", "A customer left feedback after completing " + e.public_code + ".", "/", "errand", errandId);
      return NextResponse.json({ ok: true, message: "Thank you for the feedback." }, { status: 201 });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") return error("You have already rated this completed errand.", 409);
      return error("Rating could not be saved.", 503);
    } finally { client.release(); }
  }

  if (action === "createErrand" || action === "errandAction" || action === "recordPayout" || action === "reconcilePayment" || action === "recordRefund") {
    // These actions are handled below through the same scoped transactional path.
  } else if (action !== "") return error("Unknown operation.", 404);

  if (action === "createErrand") {
    if (user.role !== "customer") return error("Only customer accounts can submit new errands.", 403);
    const title = text(body.title, 160);
    const category = text(body.category, 40);
    const description = text(body.description, 5000);
    const serviceArea = text(body.serviceArea, 180);
    const pickup = text(body.pickupLocation, 300);
    const destination = text(body.destinationLocation, 300);
    const allowed = new Set(["shopping", "pickup_delivery", "personal_errand", "business_support", "local_assistance", "other"]);
    const budget = num(body.budgetAmount);
    const dueAt = text(body.dueAt, 60);
    const due = dueAt ? new Date(dueAt) : null;
    const priority = new Set(["low", "standard", "high", "urgent"]).has(text(body.priority, 20)) ? text(body.priority, 20) : "standard";
    if (title.length < 3 || description.length < 5 || serviceArea.length < 2 || !allowed.has(category)) return error("Check the task title, detail, category and service area.");
    if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 100000000)) return error("Enter a valid non-negative budget.");
    if (due && (!Number.isFinite(due.getTime()) || due.getTime() < Date.now() - 86400000)) return error("Choose a valid due date.");
    const code = randomCode();
    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      const r = await client.query("INSERT INTO errands(public_code,customer_id,title,category,description,pickup_location,destination_location,service_area,due_at,budget_amount,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *", [code,user.id,title,category,description,pickup||null,destination||null,serviceArea,due,budget,priority]);
      const e = r.rows[0];
      await addEvent(client,e.id,user.id,"request_created",null,"requested","Customer submitted an errand request.",{priority,category});
      const admins = await client.query("SELECT id FROM users WHERE role='admin' AND is_active=true");
      for (const admin of admins.rows) await client.query("INSERT INTO notifications(user_id,kind,title,body,href,entity_type,entity_id) VALUES($1,'new_errand','New errand request',$2,'/','errand',$3)",[admin.id,e.public_code+" · "+e.title,e.id]);
      await client.query("COMMIT");
      return NextResponse.json({errand:e},{status:201});
    } catch { await client.query("ROLLBACK").catch(()=>undefined); return error("The request could not be saved. Please retry.",503); }
    finally { client.release(); }
  }

  if (action === "errandAction") {
    const id = text(body.id, 80);
    const act = text(body.errandAction, 40);
    if (!id) return error("Errand identifier is required.");
    const client = await databasePool().connect();
    let resultMessage = "";
    let notifyTarget: {id:string;kind:string;title:string;body:string;errandId:string}|null = null;
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT * FROM errands WHERE id=$1 FOR UPDATE", [id]);
      const e = locked.rows[0];
      if (!e) { await client.query("ROLLBACK"); return error("Errand not found.", 404); }
      const previous = e.status as string;
      let next = previous;
      let eventNote = "";
      let eventType = act;
      if (act === "assign") {
        if (user.role !== "admin" || !["requested","declined"].includes(previous)) throw new Error("Only operations can assign a new or declined errand.");
        const providerId = text(body.providerId,80);
        const provider = await client.query("SELECT u.id,pp.service_area,pp.service_categories FROM users u JOIN provider_profiles pp ON pp.user_id=u.id WHERE u.id=$1 AND u.role='provider' AND u.is_active=true AND pp.approval_status='approved' AND pp.available=true",[providerId]);
        if (!provider.rowCount) throw new Error("Choose an active, approved provider marked available.");
        const categories = provider.rows[0].service_categories || [];
        if (categories.length && !categories.includes(e.category) && !categories.includes("other")) throw new Error("This provider has not listed the requested errand category.");
        next = "assigned";
        eventNote = "Operations assigned the errand to an approved provider.";
        await client.query("UPDATE errands SET provider_id=$2,status=$3,version=version+1,updated_at=now() WHERE id=$1",[id,providerId,next]);
        notifyTarget = {id:providerId,kind:"assignment",title:"New errand assignment",body:e.public_code+" · "+e.title,errandId:id};
      } else if (act === "accept" || act === "decline") {
        if (user.role !== "provider") throw new Error("Only provider accounts can respond to job requests.");
        if (act === "decline") {
          if (e.provider_id !== user.id || previous !== "assigned") throw new Error("Only the assigned provider can decline an assignment.");
          next = "declined";
          eventNote = "Provider declined the assignment.";
          await client.query("UPDATE errands SET status=$2,provider_id=NULL,version=version+1,updated_at=now() WHERE id=$1", [id, next]);
          const admins = await client.query("SELECT id FROM users WHERE role='admin' AND is_active=true");
          for (const admin of admins.rows) {
            await client.query("INSERT INTO notifications(user_id,kind,title,body,href,entity_type,entity_id) VALUES($1,'provider_declined','Provider declined assignment',$2,'/','errand',$3)", [admin.id, e.public_code + " needs reassignment", id]);
          }
          notifyTarget = { id: e.customer_id, kind: "assignment", title: "Your assignment is being reviewed", body: "Operations is arranging the next step for " + e.public_code + ".", errandId: id };
        } else {
          const assignedToMe = e.provider_id === user.id && previous === "assigned";
          const openRequest = !e.provider_id && previous === "requested";
          if (!assignedToMe && !openRequest) throw new Error("This request has already been accepted or is no longer available.");

          // Lock the provider profile while checking availability and active work. This prevents
          // accepting two open requests concurrently from different browser tabs.
          const providerResult = await client.query(
            "SELECT pp.approval_status,pp.available,pp.service_categories FROM provider_profiles pp JOIN users u ON u.id=pp.user_id WHERE pp.user_id=$1 AND u.is_active=true FOR UPDATE OF pp",
            [user.id]
          );
          const providerProfile = providerResult.rows[0];
          if (!providerProfile || providerProfile.approval_status !== "approved") throw new Error("Your provider profile must be approved before accepting requests.");
          if (openRequest && !providerProfile.available) throw new Error("Mark yourself available before accepting an open request.");
          const categories = providerProfile.service_categories || [];
          if (categories.length && !categories.includes(e.category) && !categories.includes("other")) throw new Error("This request is outside the service categories on your profile.");
          const activeJob = await client.query(
            "SELECT id FROM errands WHERE provider_id=$1 AND status IN ('assigned','accepted','in_progress','completion_submitted') AND id<>$2 LIMIT 1",
            [user.id, id]
          );
          if (activeJob.rowCount) throw new Error("Finish your active assignment before accepting another request.");

          next = "accepted";
          eventNote = openRequest ? "Provider accepted an open marketplace request." : "Provider accepted the assigned errand.";
          const accepted = await client.query(
            "UPDATE errands SET provider_id=$2,status=$3,accepted_at=now(),version=version+1,updated_at=now() WHERE id=$1 AND ((provider_id=$2 AND status='assigned') OR (provider_id IS NULL AND status='requested')) RETURNING id",
            [id, user.id, next]
          );
          if (!accepted.rowCount) throw new Error("Another provider accepted this request first. Refresh the job list.");
          notifyTarget = { id: e.customer_id, kind: "progress", title: "Provider accepted your errand", body: e.public_code + " · The provider accepted the request and will update progress here.", errandId: id };
        }
      } else if (act === "start") {
        if (user.role !== "provider" || e.provider_id !== user.id || previous !== "accepted") throw new Error("Only the assigned provider can start an accepted task.");
        next = "in_progress"; eventNote = "Provider marked the task as in progress.";
        await client.query("UPDATE errands SET status=$2,started_at=now(),version=version+1,updated_at=now() WHERE id=$1",[id,next]);
        notifyTarget = {id:e.customer_id,kind:"progress",title:"Your errand is in progress",body:e.public_code+" · Work has started.",errandId:id};
      } else if (act === "complete") {
        if (user.role !== "provider" || e.provider_id !== user.id || previous !== "in_progress") throw new Error("Only the assigned provider can submit completion from an in-progress task.");
        const notes = text(body.completionNotes,4000);
        if (notes.length < 3) throw new Error("Add completion notes before submitting.");
        next = "completion_submitted"; eventNote = notes;
        await client.query("UPDATE errands SET status=$2,completion_notes=$3,completed_at=now(),version=version+1,updated_at=now() WHERE id=$1",[id,next,notes]);
        notifyTarget = {id:e.customer_id,kind:"completion",title:"Your errand is ready for review",body:e.public_code+" · Check the completion notes and confirm or raise a dispute.",errandId:id};
      } else if (act === "confirm" || act === "dispute") {
        if (user.role !== "customer" || e.customer_id !== user.id || previous !== "completion_submitted") throw new Error("Only the requesting customer can confirm or dispute submitted completion.");
        if (act === "confirm") {
          next="completed"; eventNote="Customer confirmed completion.";
          await client.query("UPDATE errands SET status=$2,customer_confirmed_at=now(),version=version+1,updated_at=now() WHERE id=$1",[id,next]);
          await client.query("UPDATE provider_profiles SET completed_jobs=completed_jobs+1,updated_at=now() WHERE user_id=$1",[e.provider_id]);
          notifyTarget = e.provider_id ? {id:e.provider_id,kind:"completion",title:"Errand confirmed complete",body:e.public_code+" · The customer confirmed completion.",errandId:id} : null;
        } else {
          const reason=text(body.note,1000);
          if(reason.length<3) throw new Error("Explain the issue before opening a dispute.");
          next="disputed";eventNote=reason;
          await client.query("UPDATE errands SET status=$2,disputed_at=now(),version=version+1,updated_at=now() WHERE id=$1",[id,next]);
          const admins=await client.query("SELECT id FROM users WHERE role='admin' AND is_active=true");
          for(const admin of admins.rows) await client.query("INSERT INTO notifications(user_id,kind,title,body,href,entity_type,entity_id) VALUES($1,'dispute','Errand dispute requires review',$2,'/','errand',$3)",[admin.id,e.public_code+" · "+reason.slice(0,140),id]);
          notifyTarget = e.provider_id ? {id:e.provider_id,kind:"dispute",title:"A customer raised a dispute",body:e.public_code+" · Operations will review the details.",errandId:id} : null;
        }
      } else if (act === "cancel") {
        const canCustomer=user.role==="customer"&&e.customer_id===user.id&&["requested","quoted","assigned"].includes(previous);
        const canAdmin=user.role==="admin"&&!["completed","cancelled"].includes(previous);
        if(!canCustomer&&!canAdmin)throw new Error("This errand can no longer be cancelled by this account.");
        const reason=text(body.reason,1000);
        next="cancelled";eventNote=reason||"Errand cancelled by "+user.role+".";
        await client.query("UPDATE errands SET status=$2,cancellation_reason=$3,version=version+1,updated_at=now() WHERE id=$1",[id,next,reason||null]);
        const other = user.id===e.customer_id ? e.provider_id : e.customer_id;
        notifyTarget = other ? {id:other,kind:"cancellation",title:"Errand cancelled",body:e.public_code+" · "+eventNote,errandId:id} : null;
      } else if (act === "mark_paid" || act === "recordPayout" || act === "recordRefund" || act === "recordSellerPayment") {
        if(act==="recordSellerPayment" ? !(user.role==="admin" || (user.role==="provider" && e.provider_id===user.id)) : act==="mark_paid" && e.service_payment_method==="cash" ? !(user.role==="admin" || (user.role==="provider" && e.provider_id===user.id)) : user.role!=="admin")throw new Error("Only operations can verify in-app service payments and record payouts; the assigned provider may record cash service fees and separate seller payments.");
        const amount=Number(body.amount);
        const method=text(body.method,80);
        const reference=text(body.reference,160);
        const idempotencyKey=text(body.idempotencyKey,100)||hash([id,act,amount,method,reference].join("|"));
        if(!Number.isFinite(amount)||amount<=0||amount>100000000||method.length<2)throw new Error("Enter a positive amount and payment method.");
        if(!["M-Pesa","Cash","Bank transfer","Card terminal","Other manual method"].includes(method))throw new Error("Choose a supported payment method.");
        if(act==="mark_paid"&&e.payment_status==="paid")throw new Error("The errand-service fee is already recorded as paid.");
        if(act==="mark_paid"&&Math.abs(amount-Number(e.service_fee_amount))>0.01)throw new Error("The recorded service payment must equal the saved service fee of KES "+Number(e.service_fee_amount).toFixed(2)+".");
        if(act==="mark_paid"&&e.service_payment_method==="cash"&&!["completion_submitted","completed","disputed"].includes(e.status))throw new Error("Cash service fees can be recorded after the errand service has been performed.");
        if(act==="mark_paid"&&e.service_payment_method==="in_app"&&reference.length<4)throw new Error("Enter the verified in-app transaction reference before recording the service payment.");
        if(act==="recordPayout"&&(e.service_payment_method!=="in_app"||!e.provider_id||e.status!=="completed"||e.payment_status!=="paid"))throw new Error("Provider payouts can only be recorded for a completed errand whose in-app service payment is confirmed.");
        if(act==="recordPayout"){
          const existingPayout=await client.query("SELECT coalesce(sum(amount),0)::numeric AS total FROM payment_records WHERE errand_id=$1 AND record_type='provider_payout' AND status<>'reversed'",[id]);
          const availablePayout=Math.max(0,Number(e.provider_earning_amount||0)-Number(existingPayout.rows[0]?.total||0));
          if(amount>availablePayout+0.01)throw new Error("Payout exceeds the remaining provider share of KES "+availablePayout.toFixed(2)+".");
        }
        if(act==="recordRefund"&&e.payment_status!=="paid")throw new Error("A refund can only be recorded against a paid service fee that has not been fully refunded.");
        if(act==="recordRefund"){
          const remainingPaid=await client.query("SELECT (coalesce(sum(amount) FILTER (WHERE record_type='service_payment' AND status<>'reversed'),0)-coalesce(sum(amount) FILTER (WHERE record_type='refund' AND status<>'reversed'),0))::numeric AS total FROM payment_records WHERE errand_id=$1",[id]);
          if(amount>Number(remainingPaid.rows[0]?.total||0)+0.01)throw new Error("Refund amount cannot exceed the remaining recorded errand-service payments.");
        }
        const recordType=act==="recordPayout"?"provider_payout":act==="recordRefund"?"refund":act==="recordSellerPayment"?"seller_payment":"service_payment";
        const inserted=await client.query(
          "INSERT INTO payment_records(errand_id,recorded_by,record_type,amount,currency,method,reference,status,notes,idempotency_key) VALUES($1,$2,$3,$4,'KES',$5,$6,'recorded',$7,$8) ON CONFLICT(errand_id,idempotency_key) DO NOTHING RETURNING id",
          [id,user.id,recordType,amount,method,reference||null,"Manually recorded by operations.",idempotencyKey]
        );
        if(!inserted.rowCount){await client.query("COMMIT");return NextResponse.json({ok:true,message:"This payment action was already recorded.",status:previous});}
        if(act==="mark_paid") {
          await client.query("UPDATE errands SET payment_status='paid',payment_method=$2,payment_reference=$3,paid_at=now(),app_payment_checkout_status=CASE WHEN service_payment_method='in_app' THEN 'succeeded' ELSE app_payment_checkout_status END,app_payment_reference=CASE WHEN service_payment_method='in_app' THEN $3 ELSE app_payment_reference END,version=version+1,updated_at=now() WHERE id=$1",[id,method,reference||null]);
          eventNote="Operations verified and recorded the errand service fee of KES "+amount.toFixed(2)+" ("+method+"). Seller goods are separate.";
          notifyTarget=e.customer_id?{id:e.customer_id,kind:"payment",title:"Errand service payment recorded",body:e.public_code+" · SaMi service fee payment has been recorded.",errandId:id}:null;
        } else if(act==="recordSellerPayment") {
          await client.query("UPDATE errands SET seller_payment_status='paid',seller_actual_amount=$2,seller_payment_method=$3,seller_payment_reference=$4,version=version+1,updated_at=now() WHERE id=$1",[id,amount,method,reference||null]);
          eventNote="Recorded separate seller/goods payment of KES "+amount.toFixed(2)+" ("+method+"). This is not SaMi service revenue.";
          notifyTarget=e.customer_id?{id:e.customer_id,kind:"seller_payment",title:"Seller payment recorded",body:e.public_code+" · The seller/goods payment was recorded separately.",errandId:id}:null;
        } else if(act==="recordRefund") {
          const remainingAfter=await client.query("SELECT (coalesce(sum(amount) FILTER (WHERE record_type='service_payment' AND status<>'reversed'),0)-coalesce(sum(amount) FILTER (WHERE record_type='refund' AND status<>'reversed'),0))::numeric AS total FROM payment_records WHERE errand_id=$1",[id]);
          const fullyRefunded=Number(remainingAfter.rows[0]?.total||0)<=0.01;
          await client.query("UPDATE errands SET payment_status=CASE WHEN $2 THEN 'refunded' ELSE 'paid' END,version=version+1,updated_at=now() WHERE id=$1",[id,fullyRefunded]);
          eventNote="Operations recorded a refund KES "+amount.toFixed(2)+" ("+method+")."+(fullyRefunded?" The recorded service fee is fully refunded.":" A balance remains refundable.");
          notifyTarget=e.customer_id?{id:e.customer_id,kind:"payment",title:"Refund recorded",body:e.public_code+" · A refund record has been added.",errandId:id}:null;
        } else {
          eventNote="Operations recorded provider payout KES "+amount.toFixed(2)+" ("+method+").";
          notifyTarget=e.provider_id?{id:e.provider_id,kind:"payment",title:"Provider payout recorded",body:e.public_code+" · A payout record has been added.",errandId:id}:null;
        }
      } else throw new Error("Unsupported errand action.");

      if (!["accepted","in_progress"].includes(next)) await client.query("DELETE FROM errand_live_locations WHERE errand_id=$1", [id]);
      await addEvent(client,id,user.id,eventType,previous,next,eventNote,{role:user.role});
      await client.query("COMMIT");
      resultMessage="Errand "+e.public_code+" updated.";
    } catch(ex) {
      await client.query("ROLLBACK").catch(()=>undefined);
      const message=ex instanceof Error?ex.message:"Errand action failed.";
      const status=message.startsWith("Only ")||message.startsWith("This errand")?403:400;
      return error(message,status);
    } finally { client.release(); }
    if(notifyTarget) await notify(notifyTarget.id,notifyTarget.kind,notifyTarget.title,notifyTarget.body,"/","errand",notifyTarget.errandId);
    return NextResponse.json({ok:true,message:resultMessage,status:undefined});
  }

  if (action === "recordPayout" || action === "recordRefund") {
    // Handled by errandAction to ensure the update and audit trail share a single lock.
    return error("Use errandAction for payments.", 400);
  }

  if (action === "reconcilePayment") {
    if (user.role !== "admin") return error("Operations access is required.", 403);
    const paymentId = text(body.paymentId, 80);
    try {
      const client = await databasePool().connect();
      let changed: any;
      try {
        await client.query("BEGIN");
        const p = await client.query("SELECT pr.*,e.customer_id,e.provider_id,e.public_code,e.status AS errand_status FROM payment_records pr JOIN errands e ON e.id=pr.errand_id WHERE pr.id=$1 FOR UPDATE OF pr", [paymentId]);
        if (!p.rowCount) { await client.query("ROLLBACK"); return error("Payment record not found.", 404); }
        if (p.rows[0].status === "reversed") { await client.query("ROLLBACK"); return error("A reversed payment cannot be reconciled.", 409); }
        changed = p.rows[0];
        await client.query("UPDATE payment_records SET status='reconciled' WHERE id=$1", [paymentId]);
        await addEvent(client, changed.errand_id, user.id, "payment_reconciled", changed.errand_status, changed.errand_status, "Operations reconciled " + changed.record_type.replaceAll("_"," ") + " of KES " + Number(changed.amount).toFixed(2) + ".", { paymentId: changed.id, recordType: changed.record_type, amount: Number(changed.amount), reference: changed.reference || null });
        await client.query("COMMIT");
      } catch(e) { await client.query("ROLLBACK").catch(()=>undefined); throw e; }
      finally { client.release(); }
      const target = ["provider_payout","service_payment"].includes(changed.record_type) ? changed.provider_id || changed.customer_id : changed.customer_id;
      if (target) await notify(target,"payment_reconciled","Payment reconciled",changed.public_code+" · Operations reconciled a payment record.","/","errand",changed.errand_id);
      return NextResponse.json({ok:true,message:"Payment record reconciled."});
    } catch { return error("Payment could not be reconciled.", 503); }
  }

  return error("Unknown operation.", 404);
}