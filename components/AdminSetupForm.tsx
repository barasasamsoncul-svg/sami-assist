"use client";
import { useState } from "react";
export default function AdminSetupForm() {
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
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
  return <main className="auth-wrap"><aside className="auth-aside"><a className="brand" href="/"><span className="brand-mark">S</span><span>SaMi Errands</span></a><div><div className="eyebrow">One-time setup</div><h1>Set up operations.</h1><p className="lead">The first admin can only be created using the private preview bootstrap token.</p></div><small className="muted">Keep your setup token private.</small></aside><section className="auth-main"><div className="auth-card"><h2>Administrator setup</h2><p className="muted">This form stops working once an administrator exists.</p><form className="form-stack" onSubmit={submit}><div className="field"><label htmlFor="token">Bootstrap token</label><input id="token" name="token" type="password" required autoComplete="off"/></div><div className="field"><label htmlFor="fullName">Full name</label><input id="fullName" name="fullName" required minLength={2} maxLength={120}/></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required maxLength={254}/></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></div>{error && <p className="error">{error}</p>}<button disabled={busy}>{busy ? "Creating account…" : "Create administrator"}</button></form></div></section></main>;
}