"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Role = "customer" | "provider" | "admin";
type User = { id: string; full_name: string; email: string; role: Role; phone?: string | null };
type Errand = {
  id: string; public_code: string; customer_id: string; provider_id: string | null;
  title: string; category: string; description: string; service_area: string;
  pickup_location: string | null; destination_location: string | null; due_at: string | null;
  budget_amount: string | null; item_budget_amount?: string | null; service_fee_amount?: string | null;
  commission_rate?: string | number; commission_amount?: string | null; provider_earning_amount?: string | null;
  service_payment_method?: "cash" | "in_app"; app_payment_checkout_status?: string; app_payment_reference?: string | null;
  seller_payment_status?: string; seller_actual_amount?: string | null; seller_payment_method?: string | null; seller_payment_reference?: string | null;
  priority?: string; status: string; payment_status: string;
  payment_method: string | null; payment_reference: string | null; completion_notes: string | null;
  customer_name: string; provider_name: string | null; provider_business_name?: string | null;
  created_at?: string; updated_at?: string; version?: number;
};
type Provider = {
  user_id: string; full_name: string; email: string; phone?: string; provider_type: string;
  business_name: string | null; service_area: string | null; service_categories: string[];
  bio?: string | null; approval_status: string; rejection_reason?: string | null; available: boolean;
  completed_jobs?: number; rating_average?: number; rating_count?: number; created_at?: string;
};
type Payment = {
  id: string; errand_id: string; public_code: string; title: string; record_type: string;
  amount: string; currency: string; method: string; reference: string | null; status: string;
  created_at: string; customer_name?: string; provider_name?: string; recorded_by_name?: string;
  errand_status?: string;
};
type EventItem = { id: number; event_type: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string; actor_name: string | null };
type Message = { id: number; sender_id: string; message: string; created_at: string; sender_name: string; sender_role: Role };
type Notification = { id: string; kind: string; title: string; body: string; href: string | null; read_at: string | null; created_at: string };
type ProviderProfile = {
  full_name: string; email: string; phone: string | null; provider_type: string; business_name: string | null;
  service_categories: string[]; service_area: string | null; bio: string | null; approval_status: string;
  rejection_reason: string | null; available: boolean; verified_at: string | null;
  completed_jobs: number; rating_average: number; rating_count: number;
};
type Detail = { errand: Errand; events: EventItem[]; messages: Message[]; ratings: { id: string; score: number; comment: string | null; reviewer_name: string; created_at: string }[] };
type Tab = "overview" | "errands" | "providers" | "pricing" | "payments" | "profile";
type PaymentKind = "mark_paid" | "recordPayout" | "recordRefund" | "recordSellerPayment";
const CATEGORIES = [
  { id: "shopping", name: "Shopping & essentials", icon: "🛍", description: "Groceries, markets, household supplies and everyday purchases" },
  { id: "clothing_retail", name: "Clothing & retail", icon: "◈", description: "Clothes, shoes, accessories, store purchases and returns" },
  { id: "pickup_delivery", name: "Pickups & drop-offs", icon: "📦", description: "Parcels, keys, documents, collections and deliveries" },
  { id: "documents_admin", name: "Documents & admin", icon: "▤", description: "Paperwork, printing, filing and administrative errands" },
  { id: "personal_errand", name: "Personal errands", icon: "⌂", description: "Everyday personal tasks, bookings and practical help" },
  { id: "queue_appointments", name: "Queues & appointments", icon: "◷", description: "Wait in line, collect tickets or attend approved appointments" },
  { id: "business_support", name: "Business support", icon: "▦", description: "Office errands, supplier runs and business operations" },
  { id: "local_assistance", name: "Local assistance", icon: "✳", description: "Coordinate simple practical jobs and local services" },
  { id: "other", name: "Another legitimate errand", icon: "＋", description: "Describe any other lawful task; operations can review it" }
];
const STATUSES = ["requested","assigned","accepted","in_progress","completion_submitted","completed","disputed","cancelled","declined"];
const statusLabel = (status: string) => status.replaceAll("_", " ").replace(/\b\w/g, m => m.toUpperCase());
const money = (value: string | number | null | undefined) => value == null || value === "" ? "—" : "KES " + Number(value).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "Not scheduled";
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("");
const isActiveStatus = (status: string) => ["requested","assigned","accepted","in_progress","completion_submitted"].includes(status);

export default function ErrandsApp() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(true);
  const [view, setView] = useState<"home"|"login"|"register"|"setup"|"app">("home");
  const [tab, setTab] = useState<Tab>("overview");
  const [errands, setErrands] = useState<Errand[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [authMode, setAuthMode] = useState<"login"|"register">("login");
  const [registerRole, setRegisterRole] = useState<"customer"|"provider">("customer");
  const [showRequest, setShowRequest] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeErrand, setActiveErrand] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [paymentModal, setPaymentModal] = useState<{kind:PaymentKind;errand:Errand}|null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [pricing, setPricing] = useState<Record<string, any>>({});
  const [mpesaConfigured, setMpesaConfigured] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("shopping");
  const [selectedPriority, setSelectedPriority] = useState("standard");
  const [profileDraft, setProfileDraft] = useState({
    providerType:"individual", businessName:"", serviceArea:"", bio:"", serviceCategories:["shopping","pickup_delivery"] as string[]
  });

  const post = async (action: string, payload: Record<string, unknown> = {}, headers: Record<string,string> = {}) => {
    const response = await fetch("/api/dispatch", {
      method:"POST", cache:"no-store",
      headers:{ "Content-Type":"application/json", ...headers },
      body:JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
  };
  const get = async (url: string) => {
    const response = await fetch(url, { cache:"no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The information could not be loaded.");
    return data;
  };

  const refresh = useCallback(async (quiet = false) => {
    if (!user) return;
    if (!quiet) setError("");
    try {
      const jobs: Promise<any>[] = [
        get("/api/dispatch?action=errands"),
        get("/api/dispatch?action=dashboard"),
        get("/api/dispatch?action=notifications"),
        get("/api/dispatch?action=payments")
      ];
      if (user.role === "admin") jobs.push(get("/api/dispatch?action=providers"));
      if (user.role === "provider") jobs.push(get("/api/dispatch?action=providerProfile"));
      const results = await Promise.all(jobs);
      setErrands(results[0].errands || []);
      setMetrics(results[1].metrics || {});
      setNotifications(results[2].notifications || []);
      setUnread(results[2].unread || 0);
      setPayments(results[3].payments || []);
      if (user.role === "admin") setProviders(results[4].providers || []);
      if (user.role === "provider") {
        const p: ProviderProfile = results[4].profile;
        setProfile(p);
        setProfileDraft({
          providerType:p.provider_type || "individual",
          businessName:p.business_name || "",
          serviceArea:p.service_area || "",
          bio:p.bio || "",
          serviceCategories:p.service_categories || []
        });
      }
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : "Could not load the workspace.");
    }
  }, [user]);

  useEffect(() => {
    void get("/api/dispatch?action=pricing").then(d => setPricing(Object.fromEntries((d.pricing || []).map((p:any) => [p.category,p])))).catch(() => undefined);
    void get("/api/payments/mpesa/status").then(d => setMpesaConfigured(Boolean(d.configured))).catch(() => setMpesaConfigured(false));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/dispatch?action=me", { cache:"no-store" });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setView("app");
        }
      } catch { /* The public landing page works without a session. */ }
      finally { setReady(true); }
    })();
  }, []);

  useEffect(() => { if (user && view === "app") void refresh(); }, [user, view, refresh]);

  const visibleErrands = useMemo(() => errands.filter(e => {
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || e.category === categoryFilter;
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [e.public_code,e.title,e.description,e.service_area,e.customer_name,e.provider_name || ""].some(s => s.toLowerCase().includes(needle));
    return matchesStatus && matchesCategory && matchesSearch;
  }), [errands,statusFilter,categoryFilter,search]);

  async function authSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy("auth");
    const form = new FormData(event.currentTarget);
    const payload: Record<string,unknown> = {
      email:String(form.get("email") || "").trim(),
      password:String(form.get("password") || "")
    };
    if (authMode === "register") {
      payload.fullName = String(form.get("fullName") || "").trim();
      payload.phone = String(form.get("phone") || "").trim();
      payload.role = registerRole;
    }
    try {
      await post(authMode === "register" ? "register" : "login", payload);
      const data = await get("/api/dispatch?action=me");
      setUser(data.user);
      setView("app"); setTab("overview");
      setNotice(authMode === "register" && registerRole === "provider" ? "Account created. Complete your provider profile to be reviewed by operations." : "Welcome back. Your workspace is ready.");
    } catch(e) { setError(e instanceof Error ? e.message : "Authentication failed."); }
    finally { setBusy(""); }
  }

  async function logout() {
    setBusy("logout");
    try { await post("logout"); setUser(null); setErrands([]); setProviders([]); setPayments([]); setNotifications([]); setProfile(null); setView("home"); setTab("overview"); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not sign out."); }
    finally { setBusy(""); }
  }

  async function createErrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const result = await post("createErrand", payload);
      setNotice("Request " + result.errand.public_code + " received. The upfront errand-service fee is saved; any seller/goods cost is separate. Operations can assign an approved provider directly.");
      (event.currentTarget as HTMLFormElement).reset();
      setShowRequest(false); setTab("errands"); await refresh(true);
    } catch(e) { setError(e instanceof Error ? e.message : "The request could not be submitted."); }
    finally { setBusy(""); }
  }

  async function startInAppPayment(errand: Errand) {
    if (!mpesaConfigured) { setError("M-PESA checkout is not configured in this Preview yet. Cash remains available."); return; }
    const phone = window.prompt("Enter the Kenyan M-PESA phone number that should receive the payment prompt.", user?.phone || "");
    if (!phone || !phone.trim()) return;
    setBusy(errand.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/payments/mpesa/checkout", {
        method:"POST", cache:"no-store",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ errandId:errand.id, phone:phone.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "M-PESA checkout could not be started.");
      setNotice((data.message || "M-PESA prompt sent.") + (data.customerMessage ? " " + data.customerMessage : ""));
      await refresh(true);
      await openDetail(errand.id,true);
    } catch(e) { setError(e instanceof Error ? e.message : "M-PESA checkout could not be started."); }
    finally { setBusy(""); }
  }

  async function actionErrand(errand: Errand, action: string, extra: Record<string,unknown> = {}) {
    setBusy(errand.id); setError(""); setNotice("");
    try {
      const result = await post("errandAction", { id:errand.id, errandAction:action, ...extra });
      setNotice(result.message || "Errand updated.");
      await refresh(true);
      if (activeErrand?.errand.id === errand.id) await openDetail(errand.id, true);
    } catch(e) { setError(e instanceof Error ? e.message : "The action could not be completed."); }
    finally { setBusy(""); }
  }

  async function openDetail(id: string, quiet = false) {
    if (!quiet) { setDetailLoading(true); setError(""); }
    try {
      const data = await get("/api/dispatch?action=errandDetail&id=" + encodeURIComponent(id));
      setActiveErrand(data);
    } catch(e) {
      if (!quiet) setError(e instanceof Error ? e.message : "Could not load errand details.");
    } finally { if (!quiet) setDetailLoading(false); }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeErrand || !messageDraft.trim()) return;
    setBusy("message"); setError("");
    try {
      await post("sendMessage", { errandId:activeErrand.errand.id, message:messageDraft.trim() });
      setMessageDraft("");
      await openDetail(activeErrand.errand.id, true);
      await refresh(true);
    } catch(e) { setError(e instanceof Error ? e.message : "Message could not be sent."); }
    finally { setBusy(""); }
  }

  async function providerReview(provider: Provider, decision: "approve"|"reject"|"suspend"|"reinstate") {
    let reason = "";
    if (decision === "reject") {
      const entered = window.prompt("Explain what the provider needs to improve (visible to the applicant).");
      if (!entered || entered.trim().length < 5) { setError("A clear rejection reason is required."); return; }
      reason = entered.trim();
    }
    setBusy(provider.user_id); setError(""); setNotice("");
    try { const data = await post("providerReview",{providerId:provider.user_id,decision,reason}); setNotice(data.message); await refresh(true); }
    catch(e) { setError(e instanceof Error ? e.message : "Provider review failed."); }
    finally { setBusy(""); }
  }

  async function saveProviderProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("profile"); setError(""); setNotice("");
    try {
      const data = await post("providerProfile", profileDraft);
      setNotice(data.message + (data.approvalStatus === "pending" ? " Operations can now review your application." : ""));
      await refresh(true);
    } catch(e) { setError(e instanceof Error ? e.message : "Profile could not be saved."); }
    finally { setBusy(""); }
  }

  async function toggleAvailability(available: boolean) {
    setBusy("availability"); setError(""); setNotice("");
    try { const data = await post("providerAvailability",{available}); setNotice(data.message); await refresh(true); }
    catch(e) { setError(e instanceof Error ? e.message : "Availability could not be updated."); }
    finally { setBusy(""); }
  }

  async function savePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!paymentModal) return;
    setBusy("payment"); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = {
      id:paymentModal.errand.id,
      errandAction:paymentModal.kind,
      amount:Number(form.get("amount")),
      method:String(form.get("method") || "").trim(),
      reference:String(form.get("reference") || "").trim(),
      idempotencyKey:crypto.randomUUID()
    };
    try {
      const data = await post("errandAction",payload);
      setNotice(data.message || "Payment record saved.");
      setPaymentModal(null); await refresh(true);
    } catch(e) { setError(e instanceof Error ? e.message : "Payment record could not be saved."); }
    finally { setBusy(""); }
  }

  async function reconcilePayment(paymentId: string) {
    setBusy(paymentId); setError(""); setNotice("");
    try { const data = await post("reconcilePayment",{paymentId}); setNotice(data.message); await refresh(true); }
    catch(e) { setError(e instanceof Error ? e.message : "Payment reconciliation failed."); }
    finally { setBusy(""); }
  }

  async function markRead(id?: string) {
    try { await post("markNotificationRead",{id}); setNotifications(current => current.map(n => !id || n.id===id ? {...n,read_at:new Date().toISOString()} : n)); setUnread(current => id ? Math.max(0,current-1) : 0); }
    catch { /* Non-blocking inbox operation. */ }
  }

  async function rateProvider(errand: Errand, score: number) {
    const comment = window.prompt("Add a short comment about the service (optional).") || "";
    setBusy("rating"); setError(""); setNotice("");
    try { const data = await post("addRating",{errandId:errand.id,score,comment}); setNotice(data.message); await openDetail(errand.id,true); await refresh(true); }
    catch(e) { setError(e instanceof Error ? e.message : "Rating could not be saved."); }
    finally { setBusy(""); }
  }

  async function savePricingRule(category: string) {
    const rule = pricing[category];
    if (!rule) return;
    setBusy("pricing:" + category); setError(""); setNotice("");
    try {
      const data = await post("updatePricing", {
        category,
        serviceName: String(rule.service_name || ""),
        baseFee: Number(rule.base_fee),
        commissionRate: Number(rule.commission_rate),
        lowPriorityMultiplier: Number(rule.low_priority_multiplier),
        standardPriorityMultiplier: Number(rule.standard_priority_multiplier),
        highPriorityMultiplier: Number(rule.high_priority_multiplier),
        urgentPriorityMultiplier: Number(rule.urgent_priority_multiplier)
      });
      const latest = await get("/api/dispatch?action=pricing");
      setPricing(Object.fromEntries((latest.pricing || []).map((p:any) => [p.category,p])));
      setNotice(data.message || "Pricing rule saved.");
    } catch(e) { setError(e instanceof Error ? e.message : "Pricing update failed."); }
    finally { setBusy(""); }
  }

  async function bootstrapAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("setup"); setError("");
    const f = new FormData(event.currentTarget);
    const token = String(f.get("token") || "");
    try {
      const data = await post("bootstrap",{fullName:f.get("fullName"),email:f.get("email"),password:f.get("password")},{"x-admin-bootstrap-token":token});
      const me = await get("/api/dispatch?action=me"); setUser(me.user); setView("app"); setNotice(data.message);
    } catch(e) { setError(e instanceof Error ? e.message : "Administrator setup failed."); }
    finally { setBusy(""); }
  }

  const brand = <a className="brand" href="/" onClick={(e)=>{e.preventDefault();setView("home");setActiveErrand(null);}}><span className="brand-mark">S</span><span>SaMi <b>Errands</b></span></a>;
  const roleName = user?.role === "admin" ? "Operations" : user?.role === "provider" ? "Service provider" : "Customer";
  const openCount = errands.filter(e => isActiveStatus(e.status)).length;
  const activePriceRule = pricing[selectedCategory];
  const activeMultiplier = activePriceRule ? Number(activePriceRule[selectedPriority + "_priority_multiplier"] ?? activePriceRule.standard_priority_multiplier ?? 1) : 1;
  const displayedServiceFee = activePriceRule ? Math.round(Number(activePriceRule.base_fee) * activeMultiplier) : null;

  if (!ready) return <main className="loading-screen"><div className="brand-mark">S</div><strong>SaMi Errands</strong><span className="muted">Preparing your workspace…</span></main>;

  if (view === "setup") return <main className="auth-wrap"><aside className="auth-aside">{brand}<div><div className="eyebrow">Initial operations access</div><h1>Establish the control room.</h1><p className="lead">Create the first administrator account for provider reviews, assignments and payment reconciliation.</p></div><div className="trust-line">Private preview · One-time setup · Role-protected access</div></aside><section className="auth-main"><div className="auth-card"><div className="eyebrow">Secure setup</div><h2>Create administrator</h2><p className="muted">Only works while this database has no administrator account.</p><form className="form-stack" onSubmit={bootstrapAdmin}><div className="field"><label htmlFor="token">Preview bootstrap token</label><input id="token" name="token" type="password" required autoComplete="off"/></div><div className="field"><label htmlFor="fullName">Full name</label><input id="fullName" name="fullName" required minLength={2} maxLength={120}/></div><div className="field"><label htmlFor="setup-email">Email</label><input id="setup-email" name="email" type="email" required maxLength={254}/></div><div className="field"><label htmlFor="setup-password">Password</label><input id="setup-password" name="password" type="password" required minLength={14} maxLength={128} autoComplete="new-password"/><small className="muted">Use at least 14 characters.</small></div>{error && <div className="alert error" role="alert">{error}</div>}<button disabled={busy==="setup"}>{busy==="setup"?"Securing account…":"Create administrator"}</button></form><button className="button-link" onClick={()=>{setError("");setView("home");}}>← Back to website</button></div></section></main>;

  if (view === "login" || view === "register") return <main className="auth-wrap"><aside className="auth-aside">{brand}<div><div className="eyebrow">{authMode==="login"?"Welcome back":"Make room for your day"}</div><h1>{authMode==="login"?"Your errands, under control.":"Everyday tasks. Better handled."}</h1><p className="lead">{authMode==="login"?"Track requests, messages, assignments and progress from one place.":"Join a marketplace built for everyday needs, local providers and accountable follow-through."}</p><div className="auth-highlights"><span>✓ Clear service fees</span><span>✓ Real status updates</span><span>✓ Human-reviewed assignments</span></div></div><div className="trust-line">SaMi Errands · Everyday help, organised.</div></aside><section className="auth-main"><div className="auth-card"><div className="eyebrow">{authMode==="login"?"Account access":"Create your account"}</div><h2>{authMode==="login"?"Sign in":"Start with SaMi"}</h2><p className="muted">{authMode==="login"?"Use your registered email and password.":"Choose how you’ll use the marketplace."}</p><form className="form-stack" onSubmit={authSubmit}>
    {authMode==="register"&&<><div className="field"><label htmlFor="fullName">Full name</label><input id="fullName" name="fullName" required minLength={2} maxLength={120} autoComplete="name"/></div><div className="field"><label htmlFor="phone">Phone number <span className="optional">Optional</span></label><input id="phone" name="phone" maxLength={32} autoComplete="tel" placeholder="+254…"/></div><div className="role-choice"><button type="button" className={registerRole==="customer"?"role-option selected":"role-option"} onClick={()=>setRegisterRole("customer")}><span className="role-emoji">↗</span><span><b>Request errands</b><small>Personal or business tasks</small></span></button><button type="button" className={registerRole==="provider"?"role-option selected":"role-option"} onClick={()=>setRegisterRole("provider")}><span className="role-emoji">✦</span><span><b>Provide services</b><small>Manage and complete jobs</small></span></button></div></>}
    <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com"/></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={12} maxLength={128} autoComplete={authMode==="login"?"current-password":"new-password"} placeholder="At least 12 characters"/>{authMode==="register"&&<small className="muted">Longer passwords are safer. Use a unique password.</small>}</div>
    {error&&<div className="alert error" role="alert">{error}</div>}<button className="button full-width" disabled={busy==="auth"}>{busy==="auth"?"Please wait…":authMode==="login"?"Sign in securely":"Create account"}</button></form><p className="auth-switch">{authMode==="login"?"New to SaMi Errands?":"Already have an account?"} <button className="inline-link" onClick={()=>{setAuthMode(authMode==="login"?"register":"login");setError("");setNotice("");}}>{authMode==="login"?"Create an account":"Sign in"}</button></p><button className="button-link" onClick={()=>{setError("");setView("home");}}>← Back to website</button></div></section></main>;

  if (view === "home") return <main className="public-site">
    <nav className="public-nav shell">{brand}<div className="public-nav-links"><a href="#services">Services</a><a href="#how-it-works">How it works</a><button className="button ghost" onClick={()=>{setAuthMode("login");setError("");setView("login");}}>Sign in</button><button className="button" onClick={()=>{setAuthMode("register");setRegisterRole("customer");setError("");setView("register");}}>Get started <span>↗</span></button></div></nav>
    <section className="public-hero shell"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"></span> GOOD HELP, RIGHT WHEN YOU NEED IT</div><h1>Make room for <em>what matters.</em></h1><p className="hero-lead">From everyday shopping to the business run that can’t wait, SaMi connects your to-do list with people ready to get things done.</p><div className="hero-buttons"><button className="button button-large" onClick={()=>{setAuthMode("register");setRegisterRole("customer");setView("register");}}>Request an errand <span>↗</span></button><button className="button button-large button-white" onClick={()=>{setAuthMode("register");setRegisterRole("provider");setView("register");}}>Join as a provider</button></div><div className="hero-proof"><div className="proof-avatars"><span>A</span><span>M</span><span>J</span><span>+</span></div><div><b>Built around follow-through.</b><small>Clear requests. Human-reviewed jobs. Accountable updates.</small></div></div></div>
      <div className="hero-art"><div className="art-glow"></div><div className="art-topline"><span className="live-dot"></span> THE EVERYDAY, HANDLED <span className="art-number">01 / 04</span></div><div className="task-board"><div className="board-head"><div><small>YOUR DAY, STREAMLINED</small><h3>The little things,<br/>under control.</h3></div><div className="board-mark">S</div></div><div className="mini-task"><span className="mini-icon gold">🛒</span><div><b>Pick up the essentials</b><small>Shopping · Westlands</small></div><span className="mini-status">Service feed</span></div><div className="mini-task"><span className="mini-icon teal">↗</span><div><b>Collect signed documents</b><small>Personal errand · Kilimani</small></div><span className="mini-status done">Assigned</span></div><div className="mini-task"><span className="mini-icon lilac">▦</span><div><b>Visit the supplier</b><small>Business support · Nairobi</small></div><span className="mini-status moving">In progress</span></div><div className="board-footer"><span><i className="tiny-dot"></i> Every step, in one place</span><span>saMi / errands</span></div></div><div className="floating-chip chip-one"><span>✓</span><div><b>Request received</b><small>Operations is on it</small></div></div><div className="floating-chip chip-two"><div className="chip-icon">↗</div><div><b>More time for you</b><small>That’s the point.</small></div></div></div>
    </section>
    <section className="trust-strip"><div className="shell trust-inner"><span>FOR YOUR PERSONAL LIFE</span><i></i><span>FOR YOUR BUSINESS</span><i></i><span>FOR THE THINGS THAT CAN’T WAIT</span><i></i><span>FOR YOUR COMMUNITY</span></div></section>
    <section className="services-section shell" id="services"><div className="section-kicker">ONE MARKETPLACE. MANY POSSIBILITIES.</div><div className="section-intro"><div><h2>It’s not just delivery.<br/><em>It’s getting life done.</em></h2></div><p>Real life doesn’t fit into one category. SaMi is designed for the everyday tasks, local coordination and business errands that keep life moving.</p></div><div className="service-grid">{CATEGORIES.map((c,i)=><article key={c.id} className={"service-tile tile-"+i}><div className="tile-top"><span className="tile-icon">{c.icon}</span><span className="tile-index">0{i+1}</span></div><h3>{c.name}</h3><p>{c.description}.</p><span className="tile-arrow">↗</span></article>)}</div></section>
    <section className="how-section" id="how-it-works"><div className="shell"><div className="section-kicker">A CLEAR WAY FORWARD</div><div className="section-intro"><div><h2>From “I need to…”<br/><em>to “it’s done.”</em></h2></div><p>Every request follows a transparent process. You know what’s happening, who’s responsible and what comes next.</p></div><div className="steps-grid"><article><span>01</span><h3>Tell us what you need</h3><p>Describe the task, location, timing and any useful details.</p></article><article><span>02</span><h3>Review a clear service fee</h3><p>Operations reviews the request and prepares the price before assignment.</p></article><article><span>03</span><h3>Follow the progress</h3><p>A provider accepts the job, updates its status and records completion details.</p></article><article><span>04</span><h3>Close with confidence</h3><p>Confirm the result or raise an issue for operations to review.</p></article></div></div></section>
    <section className="public-cta shell"><div><div className="eyebrow">YOUR NEXT THING, TAKEN CARE OF</div><h2>Give your to-do list<br/>a better ending.</h2><p>Create an account and put your first request in motion.</p></div><button className="button button-large" onClick={()=>{setAuthMode("register");setRegisterRole("customer");setView("register");}}>Get started with SaMi <span>↗</span></button></section>
    <footer className="public-footer shell">{brand}<p>Everyday help, with follow-through.</p><div><a href="#services">Services</a><a href="#how-it-works">How it works</a><button onClick={()=>setView("setup")}>Operations setup</button></div><small>© {new Date().getFullYear()} SaMi Errands. Thoughtful help for everyday life.</small></footer>
  </main>;

  const navItems = ([
    {id:"overview",icon:"◫",label:"Overview"},
    {id:"errands",icon:"↗",label:user?.role==="admin"?"Errand operations":user?.role==="provider"?"Assignments":"My errands"},
    {id:"providers",icon:"♧",label:user?.role==="admin"?"Provider network":"",adminOnly:true},
    {id:"pricing",icon:"₨",label:user?.role==="admin"?"Service pricing":"",adminOnly:true},
    {id:"payments",icon:"◈",label:user?.role==="admin"?"Payments & reconciliation":"Payments"},
    {id:"profile",icon:"◎",label:user?.role==="provider"?"Service profile":"Account",providerOnly:true}
  ] as {id:Tab;icon:string;label:string;adminOnly?:boolean;providerOnly?:boolean}[]).filter(item => (!item.adminOnly || user?.role==="admin") && (!item.providerOnly || user?.role==="provider") && item.label);
  const pageTitle = tab==="overview" ? "Overview" : tab==="errands" ? (user?.role==="admin"?"Errand operations":user?.role==="provider"?"Assignments":"My errands") : tab==="providers"?"Provider network":tab==="pricing"?"Service pricing":tab==="payments"?"Payments & reconciliation":"Service profile";
  const pageDescription = tab==="overview" ? "A real-time view of your errands, service fees and next steps." : tab==="errands" ? "Manage every hand-off across all legitimate errand categories." : tab==="providers" ? "Review applications and keep the service network reliable." : tab==="pricing" ? "Set upfront errand fees and SaMi commission. Goods paid to sellers are excluded from these charges." : tab==="payments" ? "Track service-fee payments, separate seller purchases, payouts and reconciliation." : "Tell customers what you do and where you can help.";

  return <main className="app-shell">
    <aside className="app-sidebar"><div className="sidebar-brand">{brand}<span className="product-tag">MARKETPLACE</span></div><div className="workspace-label">WORKSPACE</div><nav className="sidebar-nav">{navItems.map(item=><button key={item.id} className={tab===item.id?"nav-item current":"nav-item"} onClick={()=>{setTab(item.id);setActiveErrand(null);setError("");}}><span className="nav-glyph">{item.icon}</span><span>{item.label}</span>{item.id==="errands"&&openCount>0&&<span className="nav-count">{openCount}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="support-mini"><span className="support-icon">✳</span><div><b>Need help?</b><small>Send a note from any errand.</small></div></div><div className="sidebar-profile"><div className="avatar">{initials(user?.full_name || "S")}</div><div className="sidebar-profile-copy"><b>{user?.full_name}</b><small>{roleName}</small></div><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={()=>void logout()} disabled={busy==="logout"}>⇥</button></div></div></aside>
    <section className="app-main"><header className="app-topbar"><div className="breadcrumbs"><span>SaMi Errands</span><b>/</b><strong>{pageTitle}</strong></div><div className="topbar-actions"><span className="account-pill"><i></i>{roleName}</span><button className="icon-button notification-button" aria-label="Notifications" title="Notifications" onClick={()=>setNotificationOpen(v=>!v)}>♧{unread>0&&<b>{unread>9?"9+":unread}</b>}</button><button className="avatar top-avatar" title={user?.full_name} onClick={()=>{if(user?.role==="provider")setTab("profile");else setTab("overview");}}>{initials(user?.full_name||"S")}</button></div></header>
      {notice&&<div className="banner banner-success"><span>✓</span><p>{notice}</p><button aria-label="Dismiss" onClick={()=>setNotice("")}>×</button></div>}{error&&<div className="banner banner-error"><span>!</span><p>{error}</p><button aria-label="Dismiss" onClick={()=>setError("")}>×</button></div>}
      <div className="page-content"><div className="page-heading"><div><div className="eyebrow">{user?.role==="admin"?"OPERATIONS CONSOLE":user?.role==="provider"?"PROVIDER WORKSPACE":"PERSONAL WORKSPACE"}</div><h1>{pageTitle}</h1><p>{pageDescription}</p></div><div className="page-heading-actions">{user?.role==="customer"&&<button className="button" onClick={()=>{setShowRequest(v=>!v);setTab("errands");}}><span className="button-plus">+</span> New errand</button>}{user?.role==="admin"&&<button className="button" onClick={()=>setTab("errands")}>Review queue <span>↗</span></button>}</div></div>

      {tab==="overview"&&<div className="view-stack">
        {user?.role==="admin"?<><div className="metrics-grid">
          <Metric label="Total errands" value={metrics.total??"—"} hint="Across all requests" icon="↗" tone="teal"/>
          <Metric label="Needs review" value={metrics.needs_review??"—"} hint="New requests waiting" icon="◷" tone="gold"/>
          <Metric label="Active in workflow" value={metrics.active??"—"} hint="Service feed through completion" icon="↻" tone="blue"/>
          <Metric label="Disputes" value={metrics.disputes??"—"} hint="Require an operations decision" icon="!" tone="rose"/>
        </div><div className="overview-grid"><section className="surface-card"><div className="surface-heading"><div><h2>Needs your attention</h2><p>Prioritised items from the operations queue.</p></div><button className="text-action" onClick={()=>{setTab("errands");setStatusFilter("all");}}>View all <span>→</span></button></div><div className="attention-list">{errands.filter(e=>["disputed","requested","completion_submitted"].includes(e.status)).slice(0,5).map(e=><div className="attention-row" key={e.id}><span className={"attention-mark "+(e.status==="disputed"?"rose":e.status==="requested"?"gold":"blue")}>{e.status==="disputed"?"!":e.status==="requested"?"◷":"✓"}</span><div className="attention-copy"><b>{e.title}</b><small>{e.public_code} · {e.customer_name} · {e.service_area}</small></div><Status value={e.status}/><button className="row-open" title="Open details" onClick={()=>void openDetail(e.id)}>→</button></div>)}{errands.filter(e=>["disputed","requested","completion_submitted"].includes(e.status)).length===0&&<Empty title="Queue is clear" description="New requests and issues will appear here."/ >}</div></section><aside className="surface-card"><div className="surface-heading"><div><h2>Provider network</h2><p>Current operational readiness.</p></div><span className="soft-count">{providers.length}</span></div><div className="network-stats"><div><span>Pending review</span><b>{metrics.providers?.pending??providers.filter(p=>p.approval_status==="pending").length}</b></div><div><span>Available now</span><b>{metrics.providers?.available??providers.filter(p=>p.approval_status==="approved"&&p.available).length}</b></div></div><button className="button secondary full-width" onClick={()=>setTab("providers")}>Manage providers <span>→</span></button><div className="aside-divider"></div><div className="surface-heading compact"><div><h2>Payment control</h2><p>Recorded revenue</p></div></div><div className="big-amount">{money(metrics.recorded_revenue)}</div><p className="muted small-copy">{metrics.awaiting_payment??"—"} completed or review-stage errands awaiting a payment record.</p><button className="text-action" onClick={()=>setTab("payments")}>Open reconciliation <span>→</span></button></aside></div>
        <section className="surface-card"><div className="surface-heading"><div><h2>Latest requests</h2><p>The newest work entering the marketplace.</p></div><button className="text-action" onClick={()=>setTab("errands")}>All errands <span>→</span></button></div><ErrandTable errands={errands.slice(0,6)} user={user!} busy={busy} onOpen={id=>void openDetail(id)}/></section></>
        :<><div className="welcome-banner"><div className="welcome-copy"><span className="welcome-badge">{user?.role==="provider"?"PROVIDER DESK":"YOUR DAY, SIMPLIFIED"}</span><h2>{user?.role==="provider"?"Good work starts with a clear next step.":"Your time is valuable. Let’s use it well."}</h2><p>{user?.role==="provider"?"Keep your profile ready, accept suitable jobs and keep customers informed through every stage.":"Choose your service, see the errand fee upfront and follow the task until it’s done."}</p>{user?.role==="customer"?<button className="button" onClick={()=>{setTab("errands");setShowRequest(true);}}>Make a request <span>↗</span></button>:<button className="button" onClick={()=>setTab("profile")}>{profile?.approval_status==="approved"?"Manage service profile":"Complete provider profile"} <span>→</span></button>}</div><div className="welcome-ornament"><div className="ornament-circle one">S</div><div className="ornament-circle two">↗</div><div className="ornament-line"></div><div className="ornament-chip">SaMi <b>Errands</b></div></div></div>
        <div className="metrics-grid three"><Metric label="All errands" value={metrics.total??errands.length} hint="Requests associated with you" icon="↗" tone="teal"/><Metric label="In progress" value={metrics.active??errands.filter(e=>isActiveStatus(e.status)).length} hint="Need a next step" icon="◷" tone="blue"/><Metric label="Completed" value={metrics.completed??errands.filter(e=>e.status==="completed").length} hint="Finished successfully" icon="✓" tone="gold"/></div>
        {user?.role==="provider"&&<section className="surface-card provider-status-card"><div className="provider-status-copy"><div className="eyebrow">YOUR PROVIDER STATUS</div><h2>{statusLabel(profile?.approval_status||"pending")}</h2><p>{profile?.approval_status==="approved"?"Your service profile is approved. Keep availability and service areas accurate.":profile?.approval_status==="rejected"?"Update your profile based on operations feedback and resubmit it.":"Complete your service profile so operations can review your application."}</p>{profile?.rejection_reason&&<p className="status-reason"><b>Operations note:</b> {profile.rejection_reason}</p>}</div><div className="provider-status-actions">{profile?.approval_status==="approved"?<><span className={profile.available?"available-pill":"unavailable-pill"}><i></i>{profile.available?"Available for work":"Not available"}</span><button className="button secondary" disabled={busy==="availability"} onClick={()=>void toggleAvailability(!profile.available)}>{profile.available?"Pause availability":"Mark available"}</button></>:<button className="button" onClick={()=>setTab("profile")}>Complete profile →</button>}</div></section>}
        <section className="surface-card"><div className="surface-heading"><div><h2>{user?.role==="provider"?"Recent assignments":"Your latest errands"}</h2><p>Keep track of every request from here.</p></div><button className="text-action" onClick={()=>setTab("errands")}>View all <span>→</span></button></div>{errands.length?<ErrandTable errands={errands.slice(0,6)} user={user!} busy={busy} onOpen={id=>void openDetail(id)}/>:<Empty title={user?.role==="provider"?"Your assignments will appear here":"Nothing on your list yet"} description={user?.role==="provider"?"Once your profile is approved, operations can assign suitable errands to you.":"Create your first errand and we’ll help move it forward."} action={user?.role==="customer"?<button className="button" onClick={()=>{setTab("errands");setShowRequest(true);}}>Create first errand</button>:undefined}/>}</section></>}
      </div>}

      {tab==="errands"&&<div className="view-stack">
        {user?.role==="customer"&&showRequest&&<section className="surface-card request-form-card"><div className="surface-heading"><div><div className="eyebrow">NEW REQUEST</div><h2>What do you need done?</h2><p>Give us the detail needed to service fee accurately and assign the right provider.</p></div><button className="icon-button" onClick={()=>setShowRequest(false)} aria-label="Close request form">×</button></div><form className="request-grid" onSubmit={createErrand}>
          <div className="field wide"><label htmlFor="title">Give your errand a clear title</label><input id="title" name="title" required minLength={3} maxLength={160} placeholder="e.g. Pick up groceries and deliver to home"/></div>
          <div className="field"><label htmlFor="category">Service category</label><select id="category" name="category" required value={selectedCategory} onChange={e=>setSelectedCategory(e.target.value)}>{CATEGORIES.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="priority">Priority</label><select id="priority" name="priority" value={selectedPriority} onChange={e=>setSelectedPriority(e.target.value)}><option value="standard">Standard</option><option value="low">Flexible</option><option value="high">High priority</option><option value="urgent">Urgent — review required</option></select></div>
          <div className="field wide"><label htmlFor="description">Task details and instructions</label><textarea id="description" name="description" required minLength={5} maxLength={5000} placeholder="What needs doing? Include quantities, preferences, contacts and any relevant instructions."/></div>
          <div className="field"><label htmlFor="serviceArea">Area or neighbourhood</label><input id="serviceArea" name="serviceArea" required minLength={2} maxLength={180} placeholder="e.g. Westlands, Nairobi"/></div>
          <div className="field"><label htmlFor="dueAt">When do you need it?</label><input id="dueAt" name="dueAt" type="datetime-local"/></div>
          <div className="field"><label htmlFor="pickupLocation">Pickup location <span className="optional">Optional</span></label><input id="pickupLocation" name="pickupLocation" maxLength={300} placeholder="Building, street or landmark"/></div>
          <div className="field"><label htmlFor="destinationLocation">Destination <span className="optional">Optional</span></label><input id="destinationLocation" name="destinationLocation" maxLength={300} placeholder="Destination or handover point"/></div>
          <div className="field"><label htmlFor="itemBudgetAmount">Estimated goods / seller cost (KES) <span className="optional">Optional</span></label><input id="itemBudgetAmount" name="itemBudgetAmount" type="number" min="0" step="0.01" placeholder="Separate from the errand fee"/></div>
          <div className="field"><label htmlFor="servicePaymentMethod">How will you pay the errand service fee?</label><select id="servicePaymentMethod" name="servicePaymentMethod" defaultValue="cash"><option value="cash">Cash to the errand provider</option><option value="in_app" disabled={!mpesaConfigured}>M-PESA in-app payment{mpesaConfigured ? "" : " (setup required)"}</option></select><small className="muted">{mpesaConfigured ? "M-PESA will send a PIN prompt for the errand service fee. Goods are paid to the seller separately." : "M-PESA checkout is not enabled in this Preview yet; cash is available until Daraja credentials are configured. Seller goods remain separate."}</small></div>
          <div className="wide service-fee-preview"><div><span>Errand service fee upfront</span><strong>{displayedServiceFee === null ? "Loading price…" : money(displayedServiceFee)}</strong></div><p>This is the errand-service charge only—not clothing, groceries or goods bought from a seller. SaMi commission applies to this service fee.</p></div>
          <div className="request-form-footer wide"><p><span>ⓘ</span> Your errand fee is shown before you submit. Goods are paid to the seller separately; operations assigns a provider without a quotation step.</p><div><button type="button" className="button ghost" onClick={()=>setShowRequest(false)}>Cancel</button><button className="button" disabled={busy==="create"}>{busy==="create"?"Submitting…":"Submit request ↗"}</button></div></div>
        </form></section>}
        <section className="surface-card"><div className="surface-heading"><div><h2>{user?.role==="admin"?"All errand requests":user?.role==="provider"?"Your assignments":"Your requests"}</h2><p>{visibleErrands.length} result{visibleErrands.length===1?"":"s"} · {errands.length} total</p></div>{user?.role==="customer"&&<button className="button" onClick={()=>setShowRequest(v=>!v)}>{showRequest?"Close form":"+ New errand"}</button>}</div>
          <div className="filter-bar"><label className="search-box"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, code, area or customer…"/></label><select aria-label="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map(s=><option value={s} key={s}>{statusLabel(s)}</option>)}</select><select aria-label="Filter by service category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">All categories</option>{CATEGORIES.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select><button className="button ghost" onClick={()=>{setSearch("");setStatusFilter("all");setCategoryFilter("all");}}>Reset</button></div>
          {visibleErrands.length?<ErrandTable errands={visibleErrands} user={user!} busy={busy} onOpen={id=>void openDetail(id)} />:<Empty title="No errands match those filters" description="Try another status or search term, or create a new request." action={user?.role==="customer"?<button className="button" onClick={()=>setShowRequest(true)}>Create errand</button>:undefined}/>}
        </section>
      </div>}

      {tab==="providers"&&user?.role==="admin"&&<div className="view-stack">
        <div className="metrics-grid three"><Metric label="Applications" value={providers.length} hint="All registered providers" icon="♧" tone="teal"/><Metric label="Need review" value={providers.filter(p=>p.approval_status==="pending").length} hint="Awaiting a decision" icon="◷" tone="gold"/><Metric label="Available" value={providers.filter(p=>p.approval_status==="approved"&&p.available).length} hint="Eligible for manual dispatch" icon="✓" tone="blue"/></div>
        <section className="surface-card"><div className="surface-heading"><div><h2>Provider network</h2><p>Review profiles and approve only providers with clear service coverage.</p></div><label className="search-box compact-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a provider…"/></label></div><div className="provider-grid">{providers.filter(p=>[p.full_name,p.email,p.business_name||"",p.service_area||""].some(s=>s.toLowerCase().includes(search.toLowerCase()))).map(p=><article className="provider-card" key={p.user_id}><div className="provider-card-head"><div className="provider-avatar">{initials(p.business_name||p.full_name)}</div><Status value={p.approval_status}/></div><h3>{p.business_name||p.full_name}</h3><p className="provider-person">{p.business_name?p.full_name+" · "+p.provider_type:"Independent provider"}</p><div className="provider-info"><span>✉ {p.email}</span><span>⌖ {p.service_area||"Service area not set"}</span></div><div className="provider-chip-row">{(p.service_categories||[]).length?(p.service_categories||[]).slice(0,3).map(cat=><span className="small-chip" key={cat}>{CATEGORIES.find(c=>c.id===cat)?.name||cat}</span>):<span className="small-chip warning-chip">No services listed</span>}</div><div className="provider-card-bottom"><div><b>★ {Number(p.rating_average||0).toFixed(1)}</b><small>{p.rating_count||0} reviews · {p.completed_jobs||0} completed</small></div>{p.approval_status==="pending"?<div className="provider-actions"><button className="button small" disabled={!!busy} onClick={()=>void providerReview(p,"approve")}>Approve</button><button className="button danger small" disabled={!!busy} onClick={()=>void providerReview(p,"reject")}>Review / reject</button></div>:p.approval_status==="approved"?<button className="button ghost small" disabled={!!busy} onClick={()=>void providerReview(p,"suspend")}>Suspend</button>:<button className="button secondary small" disabled={!!busy} onClick={()=>void providerReview(p,"reinstate")}>Reinstate</button>}</div>{p.rejection_reason&&<p className="provider-reason"><b>Last review:</b> {p.rejection_reason}</p>}</article>)}</div>{providers.length===0&&<Empty title="No provider applications yet" description="When people register to provide services, their profiles will appear here for review."/ >}</section>
      </div>}

      {tab==="pricing"&&user?.role==="admin"&&<div className="view-stack">
        <div className="welcome-banner pricing-banner"><div className="welcome-copy"><span className="welcome-badge">COMMERCIAL CONTROL</span><h2>One clear fee for the errand. Seller goods stay separate.</h2><p>Customers see the service fee before submitting. SaMi commission is calculated only from the errand-service charge, never from the amount spent at a shop or paid to a seller.</p></div></div>
        <div className="metrics-grid three"><Metric label="Categories priced" value={Object.keys(pricing).length} hint="All legitimate errand categories" icon="◈" tone="teal"/><Metric label="Standard commission" value={Object.values(pricing).length ? (Number((Object.values(pricing)[0] as any).commission_rate || 0).toFixed(1)+"%") : "—"} hint="Can be changed per category" icon="%" tone="gold"/><Metric label="Payment options" value="Cash / In-app" hint="Gateway confirmation is required for in-app payments" icon="↗" tone="blue"/></div>
        <section className="surface-card"><div className="surface-heading"><div><h2>Errand service price list</h2><p>Changes apply to new requests; existing requests keep their saved fee and commission breakdown.</p></div></div>
          <div className="pricing-grid">{CATEGORIES.filter(c=>pricing[c.id]).map(c=>{const r=pricing[c.id];return <form className="pricing-card" key={c.id} onSubmit={e=>{e.preventDefault();void savePricingRule(c.id);}}>
            <div className="pricing-card-head"><span className="tile-icon">{c.icon}</span><div><h3>{c.name}</h3><p>{r.service_name}</p></div></div>
            <div className="pricing-field-grid"><div className="field"><label htmlFor={"base-"+c.id}>Base errand fee (KES)</label><input id={"base-"+c.id} type="number" min="0" max="1000000" step="1" required value={r.base_fee} onChange={e=>setPricing(p=>({...p,[c.id]:{...p[c.id],base_fee:e.target.value}}))}/></div><div className="field"><label htmlFor={"commission-"+c.id}>SaMi commission (%)</label><input id={"commission-"+c.id} type="number" min="0" max="100" step="0.5" required value={r.commission_rate} onChange={e=>setPricing(p=>({...p,[c.id]:{...p[c.id],commission_rate:e.target.value}}))}/></div></div>
            <div className="priority-pricing"><div className="priority-pricing-head"><b>Priority multipliers</b><small>Applied to the service fee</small></div><div className="pricing-field-grid four">{[["low","Flexible"],["standard","Standard"],["high","High"],["urgent","Urgent"]].map(([key,label])=><div className="field" key={key}><label htmlFor={key+"-"+c.id}>{label}</label><input id={key+"-"+c.id} type="number" min="0.1" max="5" step="0.05" required value={r[key+"_priority_multiplier"]} onChange={e=>setPricing(p=>({...p,[c.id]:{...p[c.id],[key+"_priority_multiplier"]:e.target.value}}))}/></div>)}</div></div>
            <div className="pricing-card-preview"><div><span>Standard customer service fee</span><b>{money(Number(r.base_fee)*Number(r.standard_priority_multiplier))}</b></div><div><span>SaMi commission</span><b>{money(Number(r.base_fee)*Number(r.standard_priority_multiplier)*Number(r.commission_rate)/100)}</b></div><div><span>Provider share</span><b>{money(Number(r.base_fee)*Number(r.standard_priority_multiplier)*(1-Number(r.commission_rate)/100))}</b></div></div>
            <button className="button full-width" disabled={busy==="pricing:"+c.id}>{busy==="pricing:"+c.id?"Saving rule…":"Save pricing rule"}</button>
          </form>;})}</div>
          <div className="pricing-disclaimer"><b>Seller purchases are separate.</b> If the errand involves buying clothing, food or other goods, the customer pays the seller directly or records that separate payment. SaMi commission is calculated only from the errand service fee.</div>
        </section>
      </div>}

      {tab==="payments"&&<div className="view-stack"><div className="metrics-grid three"><Metric label="Payment records" value={payments.length} hint="Errand-service payments, seller purchases, payouts and refunds" icon="◈" tone="teal"/><Metric label="Need reconciliation" value={payments.filter(p=>p.status==="recorded"||p.status==="pending").length} hint="Recorded but not reconciled" icon="◷" tone="gold"/><Metric label="Reconciled" value={payments.filter(p=>p.status==="reconciled").length} hint="Marked complete by operations" icon="✓" tone="blue"/></div>
        <section className="surface-card"><div className="surface-heading"><div><h2>Payment ledger</h2><p>SaMi service-fee records and seller/goods payments are separate. In-app checkout must be verified before a service fee is marked paid.</p></div><label className="search-box compact-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reference or errand…"/></label></div><div className="table-scroller"><table className="data-table"><thead><tr><th>Reference</th><th>Errand</th><th>Record type</th><th>Amount</th><th>Method / reference</th><th>Status</th><th>Recorded</th>{user?.role==="admin"&&<th>Action</th>}</tr></thead><tbody>{payments.filter(p=>[p.public_code,p.title,p.reference||"",p.customer_name||"",p.provider_name||""].some(s=>s.toLowerCase().includes(search.toLowerCase()))).map(p=><tr key={p.id}><td><b>{p.public_code}</b><small>{p.id.slice(0,8)}</small></td><td><b>{p.title}</b><small>{p.customer_name||p.provider_name||"Marketplace task"}</small></td><td><span className="record-type">{p.record_type.replaceAll("_"," ")}</span></td><td className="money-cell">{money(p.amount)}</td><td><b>{p.method}</b><small>{p.reference||"No reference supplied"}</small></td><td><Status value={p.status}/></td><td><span className="date-cell">{dateTime(p.created_at)}</span></td>{user?.role==="admin"&&<td>{p.status!=="reconciled"&&p.status!=="reversed"?<button className="button secondary tiny" disabled={!!busy} onClick={()=>void reconcilePayment(p.id)}>{busy===p.id?"Saving…":"Reconcile"}</button>:<span className="muted small-copy">Complete</span>}</td>}</tr>)}</tbody></table></div>{payments.length===0&&<Empty title="No payment records yet" description="When operations records a customer payment, payout or refund, it will appear in this ledger."/ >}</section>
      </div>}

      {tab==="profile"&&user?.role==="provider"&&<div className="view-stack"><section className="provider-profile-hero"><div className="profile-avatar-large">{initials(profile?.business_name||user.full_name)}</div><div className="profile-hero-copy"><div className="eyebrow">YOUR PUBLIC SERVICE PROFILE</div><h2>{profile?.business_name||user.full_name}</h2><p>{profile?.service_area||"Add the areas where you can take jobs."}</p><div className="profile-badges"><Status value={profile?.approval_status||"pending"}/>{profile?.verified_at&&<span className="verified-badge">✓ Reviewed by operations</span>}{profile?.approval_status==="approved"&&<span className={profile.available?"available-pill":"unavailable-pill"}><i></i>{profile.available?"Available for work":"Not available"}</span>}</div></div><div className="profile-rating"><b>★ {Number(profile?.rating_average||0).toFixed(1)}</b><span>{profile?.rating_count||0} customer ratings</span><small>{profile?.completed_jobs||0} confirmed completions</small></div></section>
        <section className="surface-card"><div className="surface-heading"><div><h2>Service details</h2><p>Make your coverage and services clear. Operations reviews new and updated profiles.</p></div></div><form className="request-grid" onSubmit={saveProviderProfile}><div className="field"><label htmlFor="providerType">Provider type</label><select id="providerType" value={profileDraft.providerType} onChange={e=>setProfileDraft(p=>({...p,providerType:e.target.value}))}><option value="individual">Independent individual</option><option value="business">Registered / service business</option><option value="team">Provider team</option></select></div>{profileDraft.providerType!=="individual"&&<div className="field"><label htmlFor="businessName">Business or team name</label><input id="businessName" value={profileDraft.businessName} onChange={e=>setProfileDraft(p=>({...p,businessName:e.target.value}))} required minLength={2} maxLength={160}/></div>}<div className="field"><label htmlFor="serviceArea">Service area</label><input id="serviceArea" value={profileDraft.serviceArea} onChange={e=>setProfileDraft(p=>({...p,serviceArea:e.target.value}))} required minLength={2} maxLength={180} placeholder="e.g. Nairobi CBD, Westlands, Kilimani"/></div><div className="field wide"><label>Services you can provide</label><div className="category-select-grid">{CATEGORIES.map(c=><label key={c.id} className={profileDraft.serviceCategories.includes(c.id)?"category-option chosen":"category-option"}><input type="checkbox" checked={profileDraft.serviceCategories.includes(c.id)} onChange={e=>setProfileDraft(p=>({...p,serviceCategories:e.target.checked?[...p.serviceCategories,c.id]:p.serviceCategories.filter(id=>id!==c.id)}))}/><span className="category-option-icon">{c.icon}</span><span><b>{c.name}</b><small>{c.description}</small></span></label>)}</div></div><div className="field wide"><label htmlFor="bio">Introduction <span className="optional">Optional</span></label><textarea id="bio" value={profileDraft.bio} onChange={e=>setProfileDraft(p=>({...p,bio:e.target.value}))} maxLength={1200} placeholder="Describe your experience, the kind of tasks you handle and what customers can expect."/></div><div className="request-form-footer wide"><p><span>ⓘ</span> Provider approval is manual. Only approved providers marked available can receive assignments.</p><div><button className="button" disabled={busy==="profile"}>{busy==="profile"?"Saving profile…":"Save service profile"}</button></div></div></form></section>
      </div>}
      <footer className="app-footer"><span>SaMi Errands <i>·</i> Everyday help, with follow-through.</span><span><i className="secure-dot"></i> Secure workspace <i>·</i> {roleName}</span></footer>
      </div>
    </section>

    {notificationOpen&&<><button className="overlay-dismiss" aria-label="Close notifications" onClick={()=>setNotificationOpen(false)}></button><aside className="notification-panel"><div className="notification-head"><div><h2>Notifications</h2><p>{unread} unread updates</p></div><button className="icon-button" onClick={()=>void markRead()} title="Mark all as read">✓</button><button className="icon-button" onClick={()=>setNotificationOpen(false)} aria-label="Close">×</button></div><div className="notification-list">{notifications.map(n=><article key={n.id} className={n.read_at?"notification-item":"notification-item unread"}><div className="notification-symbol">{n.kind==="payment"||n.kind==="payment_reconciled"?"◈":n.kind==="message"?"✉":n.kind==="dispute"?"!":"↗"}</div><div><b>{n.title}</b><p>{n.body}</p><small>{dateTime(n.created_at)}</small>{!n.read_at&&<button className="inline-link" onClick={()=>void markRead(n.id)}>Mark as read</button>}</div></article>)}{notifications.length===0&&<Empty title="You're all caught up" description="Important updates will show here."/ >}</div></aside></>}

    {activeErrand&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setActiveErrand(null);}}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><header className="detail-header"><div><div className="eyebrow">{activeErrand.errand.public_code} · ERRAND RECORD</div><h2 id="detail-title">{activeErrand.errand.title}</h2><p>{activeErrand.errand.service_area} · Created {dateTime(activeErrand.errand.created_at)}</p></div><button className="icon-button" aria-label="Close detail" onClick={()=>setActiveErrand(null)}>×</button></header><div className="detail-summary"><div><small>STATUS</small><Status value={activeErrand.errand.status}/></div><div><small>ERRAND SERVICE FEE</small><b>{money(activeErrand.errand.service_fee_amount)}</b></div><div><small>PAYMENT</small><Status value={activeErrand.errand.payment_status}/></div></div><div className="detail-body"><section className="detail-main-column"><div className="detail-section"><h3>Request details</h3><p>{activeErrand.errand.description}</p><div className="detail-info-grid"><div><small>Category</small><b>{CATEGORIES.find(c=>c.id===activeErrand.errand.category)?.name||activeErrand.errand.category}</b></div><div><small>Priority</small><b>{statusLabel(activeErrand.errand.priority||"standard")}</b></div><div><small>Customer</small><b>{activeErrand.errand.customer_name}</b></div><div><small>Provider</small><b>{activeErrand.errand.provider_business_name||activeErrand.errand.provider_name||"Not assigned"}</b></div><div><small>Pickup</small><b>{activeErrand.errand.pickup_location||"Not provided"}</b></div><div><small>Destination</small><b>{activeErrand.errand.destination_location||"Not provided"}</b></div><div><small>Goods / seller estimate</small><b>{money(activeErrand.errand.item_budget_amount)}</b></div><div><small>Service fee payment</small><b>{activeErrand.errand.service_payment_method==="in_app"?"In-app":"Cash"}</b></div><div><small>Seller payment</small><b>{activeErrand.errand.seller_payment_status==="paid"?"Recorded as paid":activeErrand.errand.seller_payment_status==="due"?"Due separately":"Not applicable"}</b></div><div><small>Due</small><b>{dateTime(activeErrand.errand.due_at)}</b></div></div>{activeErrand.errand.completion_notes&&<div className="completion-note"><b>Provider completion notes</b><p>{activeErrand.errand.completion_notes}</p></div>}</div>
          <div className="detail-section"><h3>Conversation <span className="soft-count">{activeErrand.messages.length}</span></h3><div className="message-thread">{activeErrand.messages.map(m=><div className={m.sender_id===user?.id?"message-bubble mine":"message-bubble"} key={m.id}><div className="message-meta"><b>{m.sender_name}</b><span>{dateTime(m.created_at)}</span></div><p>{m.message}</p></div>)}{activeErrand.messages.length===0&&<p className="muted small-copy">No messages yet. Use this thread to clarify the work and record important handovers.</p>}</div><form className="message-composer" onSubmit={sendMessage}><textarea value={messageDraft} onChange={e=>setMessageDraft(e.target.value)} maxLength={4000} required placeholder="Write a message to the people involved…"/><button className="button small" disabled={busy==="message"||!messageDraft.trim()}>{busy==="message"?"Sending…":"Send ↗"}</button></form></div>
        </section><aside className="detail-side-column"><div className="detail-section"><h3>Workflow history</h3><div className="timeline">{activeErrand.events.map(ev=><div className="timeline-item" key={ev.id}><span className="timeline-dot"></span><div><b>{statusLabel(ev.event_type)}</b><small>{ev.actor_name||"System"} · {dateTime(ev.created_at)}</small>{ev.note&&<p>{ev.note}</p>}{ev.to_status&&<span className="timeline-state">{statusLabel(ev.from_status||"new")} → {statusLabel(ev.to_status)}</span>}</div></div>)}{activeErrand.events.length===0&&<p className="muted small-copy">History is loading or no activity is recorded.</p>}</div></div>
          {user?.role==="admin"&&<div className="detail-section"><h3>Operations actions</h3>{["requested","declined"].includes(activeErrand.errand.status)&&<form className="form-stack compact-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const providerId=String(f.get("providerId")||"");if(!providerId)return;await actionErrand(activeErrand.errand,"assign",{providerId});}}><div className="field"><label>Assign approved provider</label><select name="providerId" required defaultValue=""><option value="" disabled>Select provider…</option>{providers.filter(p=>p.approval_status==="approved"&&p.available).map(p=><option key={p.user_id} value={p.user_id}>{p.business_name||p.full_name} · {p.service_area}</option>)}</select></div><button className="button full-width" disabled={!!busy}>Assign errand</button></form>}
            {activeErrand.errand.payment_status!=="paid"&&(activeErrand.errand.service_payment_method==="in_app"||["completion_submitted","completed","disputed"].includes(activeErrand.errand.status))&&<div className="payment-action-stack"><button className="button full-width" onClick={()=>setPaymentModal({kind:"mark_paid",errand:activeErrand.errand})}>Record verified service-fee payment</button></div>}{activeErrand.errand.provider_id&&activeErrand.errand.status==="completed"&&<div className="payment-action-stack"><button className="button secondary full-width" onClick={()=>setPaymentModal({kind:"recordPayout",errand:activeErrand.errand})}>Record provider payout</button></div>}{user?.role==="admin"&&activeErrand.errand.seller_payment_status==="due"&&["accepted","in_progress","completion_submitted","completed"].includes(activeErrand.errand.status)&&<div className="payment-action-stack"><button className="button ghost full-width" onClick={()=>setPaymentModal({kind:"recordSellerPayment",errand:activeErrand.errand})}>Record separate seller/goods payment</button></div>}{activeErrand.errand.payment_status==="paid"&&<div className="payment-action-stack"><button className="button ghost full-width" onClick={()=>setPaymentModal({kind:"recordRefund",errand:activeErrand.errand})}>Record service-fee refund</button></div>}
          </div>}
          {user?.role==="provider"&&activeErrand.errand.provider_id===user.id&&activeErrand.errand.status==="assigned"&&<div className="detail-section"><h3>Assignment response</h3><p className="muted small-copy">Accept this job only if the scope and timing are clear.</p><div className="payment-action-stack"><button className="button full-width" disabled={!!busy} onClick={()=>void actionErrand(activeErrand.errand,"accept")}>Accept assignment</button><button className="button danger full-width" disabled={!!busy} onClick={()=>{if(window.confirm("Decline this assignment? Operations will be notified to reassign it."))void actionErrand(activeErrand.errand,"decline");}}>Decline assignment</button></div></div>}
          {user?.role==="provider"&&activeErrand.errand.provider_id===user.id&&activeErrand.errand.status==="accepted"&&<div className="detail-section"><h3>Ready to start?</h3><p className="muted small-copy">Mark the job in progress when work begins.</p><button className="button full-width" disabled={!!busy} onClick={()=>void actionErrand(activeErrand.errand,"start")}>Start task</button></div>}
          {user?.role==="provider"&&activeErrand.errand.provider_id===user.id&&activeErrand.errand.status==="in_progress"&&<div className="detail-section"><h3>Submit completion</h3><p className="muted small-copy">Add clear notes about what was done and any handover details.</p><button className="button full-width" disabled={!!busy} onClick={()=>{const notes=window.prompt("Describe what was completed and any handover details.");if(notes&&notes.trim().length>=3)void actionErrand(activeErrand.errand,"complete",{completionNotes:notes.trim()});else if(notes!==null)setError("Please provide completion notes.");}}>Submit completion notes</button></div>}
          {user?.role==="provider"&&activeErrand.errand.provider_id===user.id&&activeErrand.errand.seller_payment_status==="due"&&["accepted","in_progress","completion_submitted","completed"].includes(activeErrand.errand.status)&&<div className="detail-section"><h3>Seller / goods payment</h3><p className="muted small-copy">Record what was paid to the seller separately from SaMi’s service fee.</p><button className="button secondary full-width" disabled={!!busy} onClick={()=>setPaymentModal({kind:"recordSellerPayment",errand:activeErrand.errand})}>Record seller payment separately</button></div>}
          {user?.role==="provider"&&activeErrand.errand.provider_id===user.id&&activeErrand.errand.service_payment_method==="cash"&&activeErrand.errand.payment_status!=="paid"&&["completion_submitted","completed","disputed"].includes(activeErrand.errand.status)&&<div className="detail-section"><h3>Errand service fee</h3><p className="muted small-copy">Record the cash service fee received from the customer. Goods paid to a seller are separate.</p><button className="button full-width" disabled={!!busy} onClick={()=>setPaymentModal({kind:"mark_paid",errand:activeErrand.errand})}>Record cash service fee received</button></div>}
          {user?.role==="customer"&&activeErrand.errand.customer_id===user.id&&activeErrand.errand.service_payment_method==="in_app"&&activeErrand.errand.payment_status!=="paid"&&activeErrand.errand.status!=="cancelled"&&activeErrand.errand.status!=="disputed"&&<div className="detail-section"><h3>Pay the errand service fee</h3><p className="muted small-copy">Service fee: <b>{money(activeErrand.errand.service_fee_amount)}</b>. This pays SaMi’s errand-service charge only; clothes, groceries or other goods are paid to the seller separately.</p>{activeErrand.errand.app_payment_checkout_status==="initiated"?<div className="alert alert-neutral"><span>◷</span><p>M-PESA prompt sent. Check the selected phone and enter your PIN; SaMi will mark the service fee paid only after the callback matches the amount, phone and receipt.</p></div>:<><button className="button full-width" disabled={!mpesaConfigured||busy===activeErrand.errand.id} onClick={()=>void startInAppPayment(activeErrand.errand)}>{!mpesaConfigured?"M-PESA checkout setup required":busy===activeErrand.errand.id?"Starting M-PESA…":"Pay "+money(activeErrand.errand.service_fee_amount)+" with M-PESA"}</button>{!mpesaConfigured&&<p className="muted small-copy">This Preview has no Daraja credentials configured yet. The errand remains unpaid; choose cash for new requests until M-PESA setup is complete.</p>}</>}</div>}
          {user?.role==="customer"&&activeErrand.errand.customer_id===user.id&&["requested","assigned"].includes(activeErrand.errand.status)&&<div className="detail-section"><h3>Request controls</h3><p className="muted small-copy">You can cancel before the provider has accepted the assignment.</p><button className="button danger full-width" disabled={!!busy} onClick={()=>{const reason=window.prompt("Reason for cancellation (optional).")||"";if(window.confirm("Cancel this errand request?"))void actionErrand(activeErrand.errand,"cancel",{reason});}}>Cancel request</button></div>}
          {user?.role==="customer"&&activeErrand.errand.customer_id===user.id&&activeErrand.errand.status==="completion_submitted"&&<div className="detail-section"><h3>Review completion</h3><p className="muted small-copy">Check the completion notes and confirm the task or raise a dispute for operations review.</p><div className="payment-action-stack"><button className="button full-width" disabled={!!busy} onClick={()=>void actionErrand(activeErrand.errand,"confirm")}>Confirm completion</button><button className="button danger full-width" disabled={!!busy} onClick={()=>{const reason=window.prompt("Explain the issue so operations can review it.");if(reason&&reason.trim().length>2)void actionErrand(activeErrand.errand,"dispute",{note:reason.trim()});}}>Raise a dispute</button></div></div>}
          {user?.role==="customer"&&activeErrand.errand.customer_id===user.id&&activeErrand.errand.status==="completed"&&activeErrand.errand.provider_id&&activeErrand.ratings.length===0&&<div className="detail-section"><h3>Rate your provider</h3><p className="muted small-copy">Your feedback helps maintain a reliable provider network.</p><div className="rating-buttons">{[1,2,3,4,5].map(n=><button key={n} aria-label={"Rate "+n+" out of 5"} onClick={()=>void rateProvider(activeErrand.errand,n)}>★</button>)}</div></div>}
        </aside></div></section></div>}

    {paymentModal&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setPaymentModal(null);}}><section className="small-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><header className="detail-header"><div><div className="eyebrow">PAYMENT RECORDS</div><h2 id="payment-title">{paymentModal.kind==="mark_paid"?"Record errand-service payment":paymentModal.kind==="recordPayout"?"Record provider payout":paymentModal.kind==="recordSellerPayment"?"Record separate seller/goods payment":"Record service-fee refund"}</h2><p>{paymentModal.errand.public_code} · {paymentModal.errand.title}</p></div><button className="icon-button" aria-label="Close" onClick={()=>setPaymentModal(null)}>×</button></header><form className="form-stack" onSubmit={savePayment}><div className="field"><label htmlFor="payment-amount">Amount (KES)</label><input id="payment-amount" name="amount" type="number" min="0" step="0.01" required defaultValue={paymentModal.kind==="recordPayout"?paymentModal.errand.provider_earning_amount||"":paymentModal.kind==="recordSellerPayment"?paymentModal.errand.item_budget_amount||"":paymentModal.kind==="recordRefund"?paymentModal.errand.service_fee_amount||"":paymentModal.errand.service_fee_amount||""}/></div><div className="field"><label htmlFor="payment-method">Method</label><select id="payment-method" name="method" required defaultValue={(paymentModal.kind==="mark_paid"&&paymentModal.errand.service_payment_method==="cash")||paymentModal.kind==="recordSellerPayment"?"Cash":"M-Pesa"}><option>M-Pesa</option><option>Cash</option><option>Bank transfer</option><option>Card terminal</option><option>Other manual method</option></select></div><div className="field"><label htmlFor="payment-reference">Reference {paymentModal.kind==="mark_paid"&&paymentModal.errand.service_payment_method==="in_app"?<span className="optional">Required for in-app verification</span>:<span className="optional">Optional</span>}</label><input id="payment-reference" name="reference" maxLength={160} required={paymentModal.kind==="mark_paid"&&paymentModal.errand.service_payment_method==="in_app"} placeholder="Transaction or receipt reference"/></div><div className="alert alert-neutral"><span>ⓘ</span><p>This creates an auditable record. Seller goods are separate from SaMi’s errand-service fee. For in-app payments, verify the actual transaction reference before recording the fee as paid.</p></div><div className="modal-actions"><button type="button" className="button ghost" onClick={()=>setPaymentModal(null)}>Cancel</button><button className="button" disabled={busy==="payment"}>{busy==="payment"?"Saving record…":"Save record"}</button></div></form></section></div>}
  </main>;
}

function Metric({label,value,hint,icon,tone}:{label:string;value:string|number;hint:string;icon:string;tone:string}) {
  return <article className="metric-card"><div className={"metric-icon "+tone}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div></article>;
}
function Status({value}:{value:string}) {
  const tone = ["completed","paid","approved","reconciled"].includes(value)?"positive":["disputed","cancelled","rejected","suspended","refunded"].includes(value)?"negative":["requested","pending","completion_submitted","high","urgent"].includes(value)?"attention":["in_progress","accepted","assigned","requested","recorded"].includes(value)?"info":"neutral";
  return <span className={"status-badge "+tone}>{statusLabel(value)}</span>;
}
function Empty({title,description,action}:{title:string;description:string;action?:React.ReactNode}) {
  return <div className="empty-state"><div className="empty-icon">↗</div><h3>{title}</h3><p>{description}</p>{action&&<div className="empty-action">{action}</div>}</div>;
}
function ErrandTable({errands,user,busy,onOpen}:{errands:Errand[];user:User;busy:string;onOpen:(id:string)=>void;}) {
  return <div className="table-scroller"><table className="data-table"><thead><tr><th>Errand</th><th>Customer / provider</th><th>Service area</th><th>Service fee</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{errands.map(e=><tr key={e.id}><td><button className="table-title" onClick={()=>onOpen(e.id)}><b>{e.title}</b><small>{e.public_code} · {CATEGORIES.find(c=>c.id===e.category)?.name||e.category}</small></button>{e.priority&&e.priority!=="standard"&&<span className={"priority-label "+e.priority}>{e.priority}</span>}</td><td><b>{user.role==="customer"?(e.provider_business_name||e.provider_name||"Awaiting provider"):user.role==="provider"?e.customer_name:e.customer_name}</b><small>{user.role==="admin"?"Request owner":user.role==="provider"?"Customer":"Assigned service provider"}</small></td><td><span className="area-cell">⌖ {e.service_area}</span></td><td><span className="money-cell">{money(e.service_fee_amount)}</span>{e.provider_earning_amount&&user.role==="admin"&&<small>Provider share {money(e.provider_earning_amount)}</small>}</td><td><Status value={e.status}/></td><td><span className="date-cell">{dateTime(e.updated_at||e.created_at)}</span></td><td><div className="table-actions"><button className="icon-button row-open" title="Open details" aria-label={"Open "+e.public_code} onClick={()=>onOpen(e.id)}>→</button>{busy===e.id&&<span className="mini-spinner"></span>}</div></td></tr>)}</tbody></table></div>;
}