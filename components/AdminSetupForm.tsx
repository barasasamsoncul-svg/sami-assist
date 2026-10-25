"use client";
import Brand from "@/components/Brand";
import { useEffect, useState } from "react";
export default function AdminSetupForm() {
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState<{adminExists:boolean;tokenConfigured:boolean;setupAvailable:boolean}|null>(null);
  const [checking,setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    fetch("/api/dispatch?action=bootstrapStatus",{cache:"no-store"})
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Setup status could not be checked.");
        if (active) setStatus(data);
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Setup status could not be checked."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const f = new FormData(event.currentTarget);
    try {
      const r = await fetch("/api/dispatch",{method:"POST",headers:{"Content-Type":"application/json","x-admin-bootstrap-token":String(f.get("token")||"")},body:JSON.stringify({action:"bootstrap",fullName:f.get("fullName"),email:f.get("email"),password:f.get("password")})});
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Setup failed.");
      window.location.assign("/");
    } catch(e) { setError(e instanceof Error ? e.message : "Setup failed."); }
    finally { setBusy(false); }
  }
  return <main className="auth-wrap"><aside className="auth-aside"><Brand /><div><div className="eyebrow">One-time setup</div><h1>Set up operations.</h1><p className="lead">The first admin can only be created using the private preview bootstrap token.</p></div><small className="muted">Keep your setup token private. SaMi Errands · Everyday help, organised.</small></aside><section className="auth-main"><div className="auth-card"><h2>Administrator setup</h2><p className="muted">This form stops working once an administrator exists.</p>
    {checking && <p className="muted">Checking Preview setup configuration…</p>}
    {!checking && status && !status.tokenConfigured && <div className="error" role="alert">Admin setup is not enabled in this deployment. In Vercel, set ADMIN_BOOTSTRAP_TOKEN for Preview and the feat/sami-errands-transformation branch, then redeploy this branch. The value must be at least 32 characters.</div>}
    {!checking && status?.adminExists && <div className="notice" role="status">An administrator already exists in this Preview database. Return to the home page and sign in using that account. <a href="/">Go to sign in</a>.</div>}
    {!checking && !status && <div className="error" role="alert">The setup status check failed. Refresh this page. If it repeats, check the Preview database connection.</div>}
    <form className="form-stack" onSubmit={submit}><div className="field"><label htmlFor="token">Bootstrap token</label><input id="token" name="token" type="password" required autoComplete="off"/></div><div className="field"><label htmlFor="fullName">Full name</label><input id="fullName" name="fullName" required minLength={2} maxLength={120}/></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required maxLength={254}/></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={14} maxLength={128} required autoComplete="new-password"/></div>{error && <p className="error">{error}</p>}<button disabled={busy || checking || !status?.setupAvailable}>{busy ? "Creating account…" : "Create administrator"}</button></form></div></section></main>;
}