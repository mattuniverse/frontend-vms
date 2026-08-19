import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { getVisitRequests, createVisitRequest, approveRequest, checkInVisitor, checkOutVisitor, getVisitors, createVisitor, toggleBlockVisitor, getAuditLog, getAnalyticsSummary, getRestrictedAreas, createRestrictedArea, deleteRestrictedArea, grantRestrictedAccess, issueRestrictedBadge, confirmRestrictedEntry, confirmRestrictedExit, getAreaOccupants } from "../services/api";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ─── DESIGN TOKENS ────────────────────────────────────────────────
const C = { primary: "#2563EB", slate900: "#0F172A", slate800: "#1E293B" };

// ─── DEMO ACCOUNT HINTS (email only — no passwords in client code) ─
// These just pre-fill the email field on the login form as a convenience
// for panelists during the thesis defense. The password is never stored
// here; it's only checked by the real backend against a bcrypt hash.
const DEMO_ACCOUNTS = [
  { role: "Administrator", name: "Administrator", initials: "ADM", email: "admin@vistahq.com" },
  { role: "Security Guard", name: "Staff", initials: "STF", email: "security@vistahq.com" },
  { role: "Receptionist", name: "Receptionist", initials: "RCPT", email: "reception@vistahq.com" },
];

const SEED_VISITORS = [];

const SEED_REQUESTS = [];


// ─── UTILS ────────────────────────────────────────────────────────
function genId(p) { return `${p}${Date.now().toString(36).toUpperCase()}`; }
function cls(...a) { return a.filter(Boolean).join(" "); }
function statusColor(s) {
  const m = {
    Active: "bg-green-100 text-green-700", Blocked: "bg-red-100 text-red-700",
    Approved: "bg-blue-100 text-blue-700", Pending: "bg-yellow-100 text-yellow-700",
    Rejected: "bg-red-100 text-red-700", "Checked In": "bg-emerald-100 text-emerald-700",
    "Checked Out": "bg-gray-100 text-gray-600", "Pending Arrival": "bg-violet-100 text-violet-700",
  };
  return m[s] || "bg-gray-100 text-gray-500";
}

import QRCode from "qrcode";

// ─── QR CODE GENERATOR (real, scannable) ──────────────────────────
function QRCanvas({ data, size = 160 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data) return;
    QRCode.toCanvas(canvas, data, {
      width: size,
      margin: 1,
      color: { dark: "#0F172A", light: "#FFFFFF" },
    }).catch(console.error);
  }, [data, size]);
  return <canvas ref={ref} style={{ display: "block" }} />;
}
// ─── QR VISITOR CARD ──────────────────────────────────────────────
function VisitorQRCard({ info, onClose }) {
  const qrData = `${info.ref}|${info.name}|${info.date}|${info.host}`;
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#0F172A] p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm">🪪</div>
          <div>
            <p className="text-white text-sm font-semibold">Vista VMS — Visitor Pass</p>
            <p className="text-slate-400 text-xs">Scan at the security desk to check in</p>
          </div>
        </div>

        {/* Status banner */}
        <div className="bg-green-50 border-b border-green-100 px-4 py-2 flex items-center gap-2">
          <span className="text-green-600 text-lg">✅</span>
          <span className="text-green-700 text-xs font-medium">Request submitted — awaiting host approval</span>
        </div>

        {/* Info rows */}
        <div className="px-4 py-3 flex flex-col gap-2">
          {[
            ["Full name", info.name],
            ["Company", info.company || "—"],
            ["Visiting", info.host],
            ["Date & time", `${info.date}${info.time ? " · " + info.time : ""}`],
            ["Purpose", info.purpose],
          ].map(([l, v]) => (
            <div key={l} className="flex items-start justify-between gap-3">
              <span className="text-xs text-gray-400 whitespace-nowrap">{l}</span>
              <span className="text-xs font-medium text-gray-900 text-right max-w-[200px]">{v}</span>
            </div>
          ))}
          <div className="h-px bg-gray-100 my-1" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Reference no.</span>
            <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">{info.ref}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Approval status</span>
            <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pending</span>
          </div>
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center py-3 bg-gray-50 border-t border-b border-gray-100">
          <QRCanvas data={qrData} size={160} />
          <p className="text-xs text-gray-400 mt-2">Scan this QR code at the security desk</p>
        </div>

        {/* Time in / out */}
        <div className="grid grid-cols-2 gap-3 p-4 pb-2">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium">⬆ Time in</p>
            <p className="text-xs font-semibold text-gray-700 mt-1">Pending check-in</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium">⬇ Time out</p>
            <p className="text-xs font-semibold text-gray-700 mt-1">Pending check-out</p>
          </div>
        </div>

        <div className="px-4 pb-4 pt-2 flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 bg-[#0F172A] text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────
function LandingPage({ onVisitor, onStaff, onRetrieve }) {
  return (
    <div className="min-h-screen bg-[#0A0F1C] flex flex-col" style={{fontFamily:"system-ui,sans-serif"}}>
      {/* Ambient glow blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{position:"absolute",top:"-10%",left:"-5%",width:"420px",height:"420px",borderRadius:"50%",background:"radial-gradient(circle,rgba(37,99,235,0.18) 0%,transparent 70%)"}}/>
        <div style={{position:"absolute",bottom:"-8%",right:"-8%",width:"380px",height:"380px",borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,0.14) 0%,transparent 70%)"}}/>
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[.05]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm shadow-lg shadow-blue-600/40">🪪</div>
          <span className="text-white font-bold text-sm tracking-tight">Vista VMS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
          <span className="text-slate-500 text-xs">System online</span>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Hero label */}
        <div className="inline-flex items-center gap-2 bg-white/[.06] border border-white/10 rounded-full px-3.5 py-1.5 mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"/>
          <span className="text-xs text-slate-300 font-medium">Argo HQ · Parañaque City</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-white text-center tracking-tight mb-2">
          Who are you here as?
        </h1>
        <p className="text-slate-400 text-sm text-center mb-10 max-w-xs">
          Choose your role to get started. Visitors register a pass; staff sign in to their dashboard.
        </p>

        {/* Role cards — side by side on sm+, stacked on mobile */}
        <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Visitor card */}
          <button onClick={onVisitor}
            className="group relative bg-blue-600 hover:bg-blue-500 text-white rounded-2xl p-6 flex flex-col items-start gap-4 transition-all duration-200 shadow-xl shadow-blue-600/30 overflow-hidden text-left">
            {/* Subtle shine */}
            <div style={{position:"absolute",top:0,left:0,right:0,height:"50%",background:"linear-gradient(180deg,rgba(255,255,255,0.08) 0%,transparent 100%)",borderRadius:"16px 16px 0 0",pointerEvents:"none"}}/>
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">👤</div>
            <div>
              <div className="text-lg font-bold leading-tight mb-1">I'm a visitor</div>
              <div className="text-sm text-blue-100 leading-snug">Register your visit, get a QR pass, and present it at the security desk.</div>
            </div>
            <div className="mt-auto flex items-center gap-1 text-blue-200 text-xs font-medium">
              Register now <span className="text-base group-hover:translate-x-0.5 transition-transform inline-block">→</span>
            </div>
          </button>

          {/* Staff card */}
          <button onClick={onStaff}
            className="group relative bg-white/[.07] hover:bg-white/[.12] border border-white/10 text-white rounded-2xl p-6 flex flex-col items-start gap-4 transition-all duration-200 overflow-hidden text-left">
            <div style={{position:"absolute",top:0,left:0,right:0,height:"50%",background:"linear-gradient(180deg,rgba(255,255,255,0.04) 0%,transparent 100%)",borderRadius:"16px 16px 0 0",pointerEvents:"none"}}/>
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">🛡️</div>
            <div>
              <div className="text-lg font-bold leading-tight mb-1">I'm staff</div>
              <div className="text-sm text-slate-400 leading-snug">Sign in to manage requests, check visitors in and out, and view analytics.</div>
            </div>
            <div className="mt-auto flex items-center gap-1 text-slate-400 group-hover:text-slate-300 text-xs font-medium transition-colors">
              Sign in <span className="text-base group-hover:translate-x-0.5 transition-transform inline-block">→</span>
            </div>
          </button>
        </div>

        {/* Staff roles hint */}
        <div className="flex items-center gap-4 mt-8">
          {[{label:"Admin",color:"bg-purple-500/20 text-purple-300"},{label:"Security",color:"bg-emerald-500/20 text-emerald-300"},{label:"Reception",color:"bg-blue-500/20 text-blue-300"}].map(r=>(
            <span key={r.label} className={cls("text-[11px] font-semibold px-2.5 py-1 rounded-full",r.color)}>{r.label}</span>
          ))}
        </div>

        {/* Retrieve pass link */}
        <div className="mt-6">
          <button onClick={onRetrieve}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors border border-white/10 hover:border-white/20 rounded-full px-4 py-2">
            🎫 Already registered? Retrieve your QR pass
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 border-t border-white/[.05]">
        <span className="text-slate-600 text-xs">Vista VMS · v1.2 · Powered by FastAPI + PostgreSQL</span>
      </footer>
    </div>
  );
}

// ─── STAFF LOGIN ──────────────────────────────────────────────────
function StaffLogin({ onSignInWithPassword, onEnrollBiometric, onVerifyBiometric, onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // step: 'password' -> typing email/password
  //       'biometric' -> waiting on the phone's Face ID/fingerprint prompt
  //       'enroll'    -> first-time device, offer to set up biometrics
  const [step, setStep] = useState("password");
  const [preAuthToken, setPreAuthToken] = useState(null);

  function friendlyError(err) {
    // Log the real error so it's visible in the browser/Eruda console —
    // otherwise a caught WebAuthn error never surfaces anywhere.
    console.error("[StaffLogin]", err?.name, err?.message, err);
    const backendMsg = err?.response?.data?.detail;
    if (typeof backendMsg === "string") return backendMsg;
    if (err?.name === "NotAllowedError") return "Biometric confirmation was cancelled or timed out.";
    if (err?.name) return `${err.name}: ${err.message || "Something went wrong during verification."}`;
    return "Invalid credentials, or the server is unreachable.";
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      if (!onSignInWithPassword) throw new Error("Auth is not wired up");
      const result = await onSignInWithPassword(email, password);
      setPreAuthToken(result.preAuthToken);
      if (result.status === "registration_required") {
        setStep("enroll");
        setLoading(false);
      } else {
        // Password confirmed — immediately trigger the biometric prompt,
        // no extra click needed.
        setStep("biometric");
        await runBiometricVerify(result.preAuthToken);
      }
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
    }
  }

  async function runBiometricVerify(token) {
    setLoading(true); setError("");
    try {
      const realUser = await onVerifyBiometric(token);
      onSuccess(realUser);
    } catch (err) {
      setError(friendlyError(err));
      setStep("password");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnroll() {
    setLoading(true); setError("");
    try {
      await onEnrollBiometric(preAuthToken, `${email} — device`);
      // Enrolled — immediately proceed to verify with the credential just created.
      setStep("biometric");
      await runBiometricVerify(preAuthToken);
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
    }
  }

  const roleColors = { Administrator: "bg-purple-100 text-purple-700", "Security Guard": "bg-green-100 text-green-700", Receptionist: "bg-blue-100 text-blue-700" };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F2A4A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
          ← Back
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-blue-600 items-center justify-center text-xl mb-2 shadow-lg shadow-blue-600/30">
            {step === "password" ? "🔒" : "👆"}
          </div>
          <h2 className="text-xl font-bold text-white">
            {step === "password" && "Staff Sign In"}
            {step === "biometric" && "Confirm on Your Phone"}
            {step === "enroll" && "Set Up Biometric Login"}
          </h2>
          <p className="text-slate-400 text-sm">
            {step === "password" && "Access your role-based dashboard"}
            {step === "biometric" && "Approve with Face ID or fingerprint to continue"}
            {step === "enroll" && "This account needs a device registered before it can sign in"}
          </p>
        </div>

        <div className="bg-white/[.07] backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl">
          {error && <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-xs rounded-lg px-3 py-2 mb-4">{error}</div>}

          {step === "password" && (
            <>
              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3 mb-4">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400 block mb-1">Email</span>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="staff@vistahq.com"
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/10 text-white placeholder:text-slate-500 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400 block mb-1">Password</span>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/10 text-white placeholder:text-slate-500 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
                <button type="submit" disabled={loading}
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-all mt-1">
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <div className="border-t border-white/10 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Demo Accounts</p>
                <div className="flex flex-col gap-1">
                  {DEMO_ACCOUNTS.map(u => (
                    <button key={u.email} onClick={() => { setEmail(u.email); setPassword(""); }}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group">
                      <div className="w-7 h-7 rounded-full bg-blue-600/30 text-blue-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{u.initials}</div>
                      <div className="flex-1">
                        <p className="text-slate-300 text-xs font-medium group-hover:text-white">{u.name}</p>
                        <p className="text-slate-500 text-[10px]">{u.role}</p>
                      </div>
                      <span className={cls("text-[10px] px-1.5 py-0.5 rounded font-semibold", roleColors[u.role] || "bg-gray-100 text-gray-600")}>{u.role.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Click a name to fill the email, then type the password separately.</p>
              </div>
            </>
          )}

          {step === "biometric" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <p className="text-slate-400 text-sm text-center">
                Waiting for confirmation on your phone…<br />
                If nothing appears, check for a notification or open Vista VMS on your phone.
              </p>
              <button onClick={() => { setStep("password"); setLoading(false); }} className="text-slate-500 hover:text-white text-xs underline">
                Cancel
              </button>
            </div>
          )}

          {step === "enroll" && (
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-slate-300 text-sm text-center">
                No device is registered for <span className="font-semibold">{email}</span> yet.
                Register this device now — for cross-device sign-in later, do this on your own phone.
              </p>
              <button onClick={handleEnroll} disabled={loading}
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-all">
                {loading ? "Setting up…" : "Enable Face ID / Fingerprint"}
              </button>
              <button onClick={() => { setStep("password"); setLoading(false); }} className="text-slate-500 hover:text-white text-xs underline">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── VISITOR PORTAL ───────────────────────────────────────────────
// ─── RETRIEVE PASS PAGE ───────────────────────────────────────────
function RetrievePass({ onBack }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function lookup() {
    if (!email.trim()) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${BASE}/visit-requests/retrieve-pass?email=${encodeURIComponent(email.trim())}`);
      if (!res.ok) throw new Error("No approved visit requests found for this email.");
      const data = await res.json();
      setResults(data);
      if (data.length === 1) setSelected(data[0]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function resendEmail(req) {
    setResending(true); setResent(false);
    try {
      const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${BASE}/visit-requests/resend-pass/${req.id}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to resend");
      setResent(true);
    } catch {
      setError("Could not resend email. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm mb-6">
          ← Back
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#0F172A] p-6">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl mb-3">🎫</div>
            <h1 className="text-white text-xl font-bold">Retrieve My Pass</h1>
            <p className="text-slate-400 text-sm mt-1">Enter your email to find your approved visit QR pass</p>
          </div>

          <div className="p-6 flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && lookup()}
                placeholder="your@email.com"
                className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                onClick={lookup}
                disabled={loading || !email.trim()}
                className="px-4 h-10 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "…" : "Search"}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                ❌ {error}
              </div>
            )}

            {results && results.length > 1 && !selected && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-500 font-medium">Multiple visits found — select one:</p>
                {results.map(r => (
                  <button key={r.id} onClick={() => setSelected(r)}
                    className="text-left p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition">
                    <p className="text-sm font-semibold text-gray-900">{r.visit_date} · {r.host_name}</p>
                    <p className="text-xs text-gray-500">{r.purpose} · {r.status}</p>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="flex flex-col gap-4">
                {/* Details */}
                <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-2">
                  {[
                    ["Visitor", selected.visitor_name],
                    ["Visiting", selected.host_name],
                    ["Date", selected.visit_date],
                    ["Time", selected.expected_time || "Flexible"],
                    ["Purpose", selected.purpose],
                    ["Status", selected.status],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-gray-400">{l}</span>
                      <span className="font-semibold text-gray-800">{v}</span>
                    </div>
                  ))}
                  <div className="h-px bg-gray-200 my-1"/>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Reference No.</span>
                    <span className="font-mono font-bold text-blue-600">{selected.qr_ref}</span>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-xl p-4">
                  <QRCanvas
                    data={`${selected.qr_ref}|${selected.visitor_name}|${selected.visit_date}|${selected.host_name}`}
                    size={160}
                  />
                  <p className="text-xs text-gray-400">Show this at the security desk</p>
                  <span className="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg">
                    {selected.qr_ref}
                  </span>
                </div>

                {/* Resend button */}
                {resent ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 text-center">
                    ✅ QR pass resent to {selected.visitor_email || email}
                  </div>
                ) : (
                  <button
                    onClick={() => resendEmail(selected)}
                    disabled={resending}
                    className="h-10 w-full rounded-xl border border-blue-200 text-blue-600 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50"
                  >
                    {resending ? "Sending…" : "📧 Resend QR pass to my email"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const Field = ({ k, label, type, placeholder, colSpan, form, errors, onChange }) => (
  <label className={cls("block", colSpan === 2 && "col-span-2")}>
    <span className="text-xs font-semibold text-gray-600">{label} <span className="text-red-500">*</span></span>
    <input type={type || "text"} value={form[k]} onChange={onChange(k)} placeholder={placeholder}
      className={cls("mt-1 w-full h-9 px-3 rounded-lg border text-sm outline-none",
        errors[k] ? "border-red-400 bg-red-50 focus:ring-1 focus:ring-red-300" : "border-gray-200 focus:ring-2 focus:ring-blue-200")} />
    {errors[k] && <p className="text-[11px] text-red-500 mt-0.5">{errors[k]}</p>}
  </label>
);

function VisitorPortal({ onBack, apiMode = false }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    full_name: "", company: "", phone: "", email: "",
    id_type: "Driver's License", id_number: "",
    host_name: "", visit_date: "", expected_time: "", purpose: "",
  });
  const [errors, setErrors] = useState({});
  const [qrInfo, setQrInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  function validate() {
    const e = {};
    if (!form.full_name.trim()) e.full_name = "Required";
    if (!form.email.trim()) e.email = "Required";
    if (!form.id_number.trim()) e.id_number = "Required";
    if (!form.host_name.trim()) e.host_name = "Required";
    if (!form.visit_date) e.visit_date = "Required";
    if (!form.purpose.trim()) e.purpose = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await createVisitRequest({
        visitor_name:  form.full_name,
        visitor_email: form.email,
        company:       form.company || null,
        phone:         form.phone || null,
        id_type:       form.id_type,
        id_number:     form.id_number,
        host_name:     form.host_name,
        visit_date:    form.visit_date,
        expected_time: form.expected_time || null,
        purpose:       form.purpose,
      });
      const created = res.data; // VisitRequestOut, includes real qr_ref from the backend
      setQrInfo({
        ref: created.qr_ref, name: form.full_name, company: form.company,
        host: form.host_name, date: form.visit_date, time: form.expected_time, purpose: form.purpose,
      });
      setStep(2);
    } catch (e) {
      console.error("Failed to submit visit request", e);
      const backendMsg = e?.response?.data?.detail;
      setSubmitError(typeof backendMsg === "string" ? backendMsg : "Something went wrong submitting your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }


  if (step === 2 && qrInfo) return (
    <VisitorQRCard info={qrInfo} onClose={onBack} />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-5">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-blue-600 items-center justify-center text-xl mb-2 shadow-lg shadow-blue-600/30">🪪</div>
          <h1 className="text-xl font-bold text-gray-900">Visitor Registration</h1>
          <p className="text-gray-500 text-sm">No account needed. Fill out the form to request your visit.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Step indicator */}
          <div className="flex items-center px-5 py-3 bg-gray-50 border-b border-gray-100 gap-2">
            {[["1", "Your info"], ["2", "Visit details"], ["3", "Confirmation"]].map(([n, l], i) => (
              <div key={n} className="flex items-center gap-1.5">
                <div className={cls("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                  step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500")}>{n}</div>
                <span className={cls("text-[11px] font-medium hidden sm:block", step === i + 1 ? "text-blue-600" : "text-gray-400")}>{l}</span>
                {i < 2 && <div className="w-6 h-px bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>

          <div className="p-5 flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Personal information</p>
              <div className="grid grid-cols-2 gap-3">
                <Field k="full_name" label="Full name" placeholder="Juan dela Cruz" colSpan={2}  form={form} errors={errors} onChange={f} />
                <Field k="company" label="Company / org" placeholder="Optional" form={form} errors={errors} onChange={f} />
                <Field k="phone" label="Phone" placeholder="09171234567"  form={form} errors={errors} onChange={f} />
                <Field k="email" label="Email address" type="email" placeholder="you@example.com" colSpan={2}  form={form} errors={errors} onChange={f} />
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">ID type <span className="text-red-500">*</span></span>
                  <select value={form.id_type} onChange={f("id_type")}
                    className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none">
                    {["Driver's License","Passport","National ID","PhilSys ID","Voter's ID","PRC ID"].map(o=><option key={o}>{o}</option>)}
                  </select>
                </label>
                <Field k="id_number" label="ID number" placeholder="e.g. DL-2024-001"  form={form} errors={errors} onChange={f} />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Visit details</p>
              <div className="grid grid-cols-2 gap-3">
                <Field k="host_name" label="Person you're visiting" placeholder="Maria Santos" colSpan={2}  form={form} errors={errors} onChange={f} />
                <Field k="visit_date" label="Visit date" type="date"  form={form} errors={errors} onChange={f} />
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Expected time</span>
                  <input type="time" value={form.expected_time} onChange={f("expected_time")}
                    className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none" />
                </label>
                <label className="block col-span-2">
                  <span className="text-xs font-semibold text-gray-600">Purpose of visit <span className="text-red-500">*</span></span>
                  <textarea value={form.purpose} onChange={f("purpose")} rows={2} placeholder="Briefly describe the purpose..."
                    className={cls("mt-1 w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none",
                      errors.purpose ? "border-red-400 bg-red-50" : "border-gray-200")} />
                  {errors.purpose && <p className="text-[11px] text-red-500 mt-0.5">{errors.purpose}</p>}
                </label>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 flex gap-2">
              <span>ℹ️</span>
              <span>After submitting, you'll receive a QR code pass. Present it at the security desk along with a valid government ID.</span>
            </div>

            {submitError && <p className="text-xs text-red-500 -mt-1">{submitError}</p>}

            <div className="flex gap-2">
              <button onClick={onBack}
                className="px-4 h-10 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                ← Back
              </button>
              <button onClick={submit} disabled={submitting}
                className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
                {submitting ? "Submitting..." : "Submit & Get QR Pass →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SHARED UI ────────────────────────────────────────────────────
function Badge({ status }) {
  return <span className={cls("inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold", statusColor(status))}>{status}</span>;
}
function Btn({ children, onClick, variant = "primary", size = "md", disabled, className }) {
  const base = "inline-flex items-center gap-1.5 font-medium rounded-[6px] transition-all focus:outline-none";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-1.5 text-sm", lg: "px-5 py-2 text-sm" };
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50",
    ghost: "text-gray-600 hover:bg-gray-100 disabled:opacity-50",
    success: "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
    warning: "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50",
  };
  return <button onClick={onClick} disabled={disabled} className={cls(base, sizes[size], variants[variant], className)}>{children}</button>;
}
function Input({ label, value, onChange, type = "text", placeholder, required }) {
  return (
    <label className="block text-xs font-semibold text-gray-600">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
    </label>
  );
}
function Dialog({ open, title, onClose, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()}
        className={cls("relative bg-white rounded-[14px] shadow-2xl w-full flex flex-col max-h-[90vh]", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
function Kpi({ label, value, icon, color = "bg-blue-50 text-blue-600", trend }) {
  return (
    <div className="bg-white rounded-[12px] border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
      <div className={cls("w-10 h-10 rounded-lg flex items-center justify-center text-lg", color)}>{icon}</div>
      <div className="flex-1">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {trend !== undefined && <div className={cls("text-xs font-medium mt-0.5", trend >= 0 ? "text-green-600" : "text-red-500")}>{trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last week</div>}
      </div>
    </div>
  );
}

// ─── ACCESS DENIED ────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <div className="text-5xl">🚫</div>
      <h2 className="text-lg font-bold text-gray-800">Access Denied</h2>
      <p className="text-sm text-gray-500">You don't have permission to view this page.</p>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────
// Derives last-7-days bar chart data from the live requests array.
// No API call needed — requests are already loaded on the dashboard.
function DashboardWeeklyChart({ requests }) {
  const data = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-PH", { weekday: "short" });
      const visits = requests.filter(r => r.visit_date === iso).length;
      days.push({ day: label, visits });
    }
    return days;
  }, [requests]);

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="visits" fill="#2563EB" radius={[3,3,0,0]} name="Visits" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Dashboard({ requests, visitors, user }) {
  const pending = requests.filter(r => r.approval_status === "Pending").length;
  const checkedIn = requests.filter(r => r.status === "Checked In").length;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Welcome back, {user.name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-gray-500">Live overview · {new Date().toLocaleDateString("en-PH", { weekday:"long",year:"numeric",month:"long",day:"numeric" })}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Registered Visitors" value={visitors.length} icon="👥" color="bg-blue-50 text-blue-600" />
        <Kpi label="Currently Inside" value={checkedIn} icon="🏢" color="bg-emerald-50 text-emerald-600" />
        <Kpi label="Pending Requests" value={pending} icon="⏳" color="bg-amber-50 text-amber-600" />
        <Kpi label="Total Requests" value={requests.length} icon="📋" color="bg-violet-50 text-violet-600" />
      </div>
      <div className="bg-white rounded-[12px] border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">This week</h3>
        <DashboardWeeklyChart requests={requests} />
      </div>
      <div className="bg-white rounded-[12px] border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Recent requests</h3>
        {requests.slice(0,5).map(r => (
          <div key={r.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold text-[11px] flex items-center justify-center">{r.visitor_name.charAt(0)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{r.visitor_name}</p>
              <p className="text-xs text-gray-400">{r.purpose} · {r.visit_date}</p>
            </div>
            <Badge status={r.approval_status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── VISITORS PAGE ────────────────────────────────────────────────
function VisitorDetailDrawer({ visitor, requests, onClose, onBlock, user }) {
  if (!visitor) return null;

  // All visit history for this visitor
  const history = requests.filter(r =>
    r.visitor_id === visitor.id ||
    r.visitor_name?.toLowerCase() === visitor.full_name?.toLowerCase()
  ).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const lastVisit  = history[0];
  const totalVisits = history.length;
  const canBlock = ["Administrator","Receptionist"].includes(user.role);

  function fmt(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-PH", { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }

  const statusColors = {
    "Checked In":  "text-emerald-600 bg-emerald-50",
    "Checked Out": "text-gray-500 bg-gray-100",
    "Pending Arrival": "text-blue-600 bg-blue-50",
    "Rejected":    "text-red-600 bg-red-50",
    "Pending":     "text-amber-600 bg-amber-50",
  };

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">Visitor Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* Identity card */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {visitor.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-lg leading-tight">{visitor.full_name}</h3>
              {visitor.company && <p className="text-sm text-gray-500">{visitor.company}</p>}
              <div className="flex items-center gap-2 mt-1">
                <Badge status={visitor.status} />
                {totalVisits > 0 && (
                  <span className="text-xs text-gray-400">{totalVisits} visit{totalVisits !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
          </div>

          {/* Contact & ID */}
          <div className="bg-gray-50 rounded-[10px] p-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Contact & ID</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Phone",    value: visitor.phone   || "—" },
                { label: "Email",    value: visitor.email   || "—" },
                { label: "ID Type",  value: visitor.id_type || "—" },
                { label: "ID No.",   value: visitor.id_number || "—" },
                { label: "Registered", value: fmt(visitor.created_at) },
              ].map(f => (
                <div key={f.label} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">{f.label}</span>
                  <span className="text-xs font-medium text-gray-800 break-all">{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Last visit summary */}
          {lastVisit && (
            <div className="bg-blue-50 border border-blue-100 rounded-[10px] p-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Last Visit</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Date",      value: lastVisit.visit_date || "—" },
                  { label: "Purpose",   value: lastVisit.purpose    || "—" },
                  { label: "Host",      value: lastVisit.host_name  || "—" },
                  { label: "Badge",     value: lastVisit.badge_number || "—" },
                  { label: "Time In",   value: fmt(lastVisit.checked_in_at) },
                  { label: "Time Out",  value: fmt(lastVisit.checked_out_at) },
                ].map(f => (
                  <div key={f.label} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-blue-500 uppercase tracking-wider">{f.label}</span>
                    <span className="text-xs font-medium text-blue-900">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full visit history */}
          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Visit History</p>
              {history.map((r, i) => (
                <div key={r.id || i} className="bg-white border border-gray-100 rounded-[10px] p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-800">{r.visit_date}</span>
                    <span className={cls("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      statusColors[r.status] || "bg-gray-100 text-gray-500")}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">Purpose:</span> {r.purpose || "—"}
                  </p>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">Host:</span> {r.host_name || "—"}
                  </p>
                  {r.badge_number && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">Badge:</span> {r.badge_number}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 mt-0.5">
                    <p className="text-[10px] text-gray-400">In: {fmt(r.checked_in_at)}</p>
                    <p className="text-[10px] text-gray-400">Out: {fmt(r.checked_out_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {history.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No visit history yet.</p>
          )}
        </div>

        {/* Footer actions */}
        {canBlock && (
          <div className="px-5 py-4 border-t border-gray-100">
            <button onClick={() => onBlock(visitor.id)}
              className={cls(
                "w-full py-2.5 rounded-xl text-sm font-semibold transition-colors",
                visitor.status === "Blocked"
                  ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                  : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
              )}>
              {visitor.status === "Blocked" ? "✅ Unblock Visitor" : "🚫 Block Visitor"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function VisitorsPage({ visitors, setVisitors, user, requests = [], apiMode = false, refreshVisitors = async () => {} }) {
  const [q, setQ]             = useState("");
  const [open, setOpen]       = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm]       = useState({ full_name:"",company:"",phone:"",email:"",id_type:"Driver's License",id_number:"" });
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState("");
  const canAdd = user.role !== "Security Guard";

  // Status filter
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = visitors.filter(v => {
    const matchQ = v.full_name.toLowerCase().includes(q.toLowerCase()) ||
                   v.company?.toLowerCase().includes(q.toLowerCase()) ||
                   v.email?.toLowerCase().includes(q.toLowerCase()) ||
                   v.phone?.includes(q) ||
                   v.id_number?.includes(q);
    const matchStatus = statusFilter === "All" || v.status === statusFilter;
    return matchQ && matchStatus;
  });

  // Auto-mark visitor as Inactive after check-out — derive from requests
  // A visitor is "currently inside" if their latest request status is "Checked In"
  // Otherwise they are Active (registered) or Blocked.
  // We show a computed presence status in the table alongside the account status.
  function getPresence(visitor) {
    const vReqs = requests.filter(r =>
      r.visitor_id === visitor.id ||
      r.visitor_name?.toLowerCase() === visitor.full_name?.toLowerCase()
    );
    if (vReqs.length === 0) return null;
    const latest = vReqs.sort((a,b) => (b.created_at||"").localeCompare(a.created_at||""))[0];
    if (latest.status === "Checked In")  return "Inside";
    if (latest.status === "Checked Out") return "Visited";
    return null;
  }

  async function submit() {
    if (!form.full_name||!form.id_number) return;
    setSaveError(""); setSaving(true);
    try {
      await createVisitor(form);
      await refreshVisitors();
      setOpen(false);
      setForm({full_name:"",company:"",phone:"",email:"",id_type:"Driver's License",id_number:""});
    } catch (e) {
      console.error("Failed to save visitor", e);
      setSaveError("Failed to save visitor. Please try again.");
    } finally { setSaving(false); }
  }

  async function handleBlock(id) {
    try { await toggleBlockVisitor(id); await refreshVisitors(); setSelected(null); }
    catch (e) { console.error("Failed to toggle block", e); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Visitors</h1>
          <p className="text-sm text-gray-500">All registered visitors — click a row to view details</p>
        </div>
        {canAdd && <Btn onClick={() => setOpen(true)}>+ New Visitor</Btn>}
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px] bg-white rounded-[10px] border border-gray-200 px-3 flex items-center gap-2">
          <span className="text-gray-400 text-sm">🔍</span>
          <input className="flex-1 h-9 text-sm outline-none bg-transparent"
            placeholder="Search name, company, email, phone, ID…"
            value={q} onChange={e => setQ(e.target.value)} />
          {q && <button onClick={() => setQ("")} className="text-gray-300 hover:text-gray-500 text-sm">✕</button>}
        </div>
        {["All","Active","Blocked"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cls("px-3 py-1 rounded-full text-xs font-medium transition-colors border",
              statusFilter === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Account</th>
              <th className="px-5 py-3">Presence</th>
              <th className="px-5 py-3">Registered</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No visitors found</td></tr>
            )}
            {filtered.map(v => {
              const presence = getPresence(v);
              return (
                <tr key={v.id}
                  onClick={() => setSelected(v)}
                  className="border-b border-gray-100 last:border-0 hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                        {v.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{v.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{v.company || "—"}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{v.id_type} · {v.id_number}</td>
                  <td className="px-5 py-3"><Badge status={v.status} /></td>
                  <td className="px-5 py-3">
                    {presence === "Inside"  && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-600 bg-emerald-50">🟢 Inside</span>}
                    {presence === "Visited" && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-500 bg-gray-100">Visited</span>}
                    {!presence && <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {v.created_at ? new Date(v.created_at).toLocaleDateString("en-PH", {month:"short",day:"numeric",year:"numeric"}) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Visitor detail drawer */}
      {selected && (
        <VisitorDetailDrawer
          visitor={selected}
          requests={requests}
          user={user}
          onClose={() => setSelected(null)}
          onBlock={handleBlock}
        />
      )}

      {/* Register new visitor dialog */}
      <Dialog open={open} title="Register New Visitor" onClose={() => setOpen(false)}
        footer={<><Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save Visitor"}</Btn></>}>
        {saveError && <p className="text-xs text-red-500 mb-2">{saveError}</p>}
        <Input label="Full Name" value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))} required />
        <Input label="Company" value={form.company} onChange={e=>setForm(p=>({...p,company:e.target.value}))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} />
          <Input label="Email" type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-gray-600">ID Type
            <select value={form.id_type} onChange={e=>setForm(p=>({...p,id_type:e.target.value}))} className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
              {["Driver's License","Passport","National ID","PhilSys ID","Voter's ID"].map(o=><option key={o}>{o}</option>)}
            </select>
          </label>
          <Input label="ID Number" value={form.id_number} onChange={e=>setForm(p=>({...p,id_number:e.target.value}))} required />
        </div>
      </Dialog>
    </div>
  );
}

// ─── VISIT REQUESTS ───────────────────────────────────────────────
function VisitRequestsPage({ requests, setRequests, user, apiMode = false, refreshRequests = async () => {} }) {
  const [checkinTarget, setCheckinTarget] = useState(null);
  const [badge, setBadge] = useState(""); const [filterStatus, setFilterStatus] = useState("All");
  const canApprove = ["Administrator","Receptionist"].includes(user.role);
  const canCheckIn = ["Administrator","Security Guard"].includes(user.role);
  const filtered = requests.filter(r=>filterStatus==="All"||r.approval_status===filterStatus||r.status===filterStatus);

  async function approve(id){
    try { await approveRequest(id, { action: "Approved" }); await refreshRequests(); }
    catch (e) { console.error("Failed to approve request", e); alert("Failed to approve request. See console for details."); }
  }
  async function reject(id){
    try { await approveRequest(id, { action: "Rejected", rejection_reason: "Rejected by staff" }); await refreshRequests(); }
    catch (e) { console.error("Failed to reject request", e); alert("Failed to reject request. See console for details."); }
  }
  async function checkOut(id){
    try { await checkOutVisitor(id); await refreshRequests(); }
    catch (e) { console.error("Failed to check out visitor", e); alert("Failed to check out visitor. See console for details."); }
  }
  async function doCheckIn(){
    try { await checkInVisitor(checkinTarget, { badge_number: badge, visitor_id_verified: true }); await refreshRequests(); }
    catch (e) { console.error("Failed to check in visitor", e); alert("Failed to check in visitor. See console for details."); }
    setCheckinTarget(null);setBadge("");
  }
  return (
    <div className="flex flex-col gap-5">
      <div><h1 className="text-xl font-bold text-gray-900">Visit Requests</h1><p className="text-sm text-gray-500">Approve, reject, check-in and check-out</p></div>
      <div className="flex gap-1.5 flex-wrap">
        {["All","Pending","Approved","Rejected","Checked In","Checked Out"].map(s=>(
          <button key={s} onClick={()=>setFilterStatus(s)}
            className={cls("px-3 py-1 rounded-full text-xs font-medium transition-colors",filterStatus===s?"bg-blue-600 text-white":"bg-white border border-gray-200 text-gray-600 hover:bg-gray-50")}>
            {s}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-[12px] border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3">Visitor</th><th className="px-4 py-3">Host</th><th className="px-4 py-3">Date/Time</th>
            <th className="px-4 py-3">Purpose</th><th className="px-4 py-3">Approval</th><th className="px-4 py-3">Status</th>
            {(canApprove||canCheckIn)&&<th className="px-4 py-3">Actions</th>}
          </tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No requests match</td></tr>}
            {filtered.map(r=>(
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.visitor_name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.host}</td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{r.visit_date} · {r.expected_time}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate text-xs">{r.purpose}</td>
                <td className="px-4 py-3"><Badge status={r.approval_status}/></td>
                <td className="px-4 py-3"><Badge status={r.status}/></td>
                {(canApprove||canCheckIn)&&(
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {canApprove&&r.approval_status==="Pending"&&<><Btn size="sm" variant="success" onClick={()=>approve(r.id)}>Approve</Btn><Btn size="sm" variant="danger" onClick={()=>reject(r.id)}>Reject</Btn></>}
                      {canCheckIn&&r.approval_status==="Approved"&&r.status==="Pending Arrival"&&<Btn size="sm" variant="outline" onClick={()=>setCheckinTarget(r.id)}>Check In</Btn>}
                      {r.status==="Checked In"&&<Btn size="sm" variant="warning" onClick={()=>checkOut(r.id)}>Check Out</Btn>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!checkinTarget} title="Check In Visitor" onClose={()=>setCheckinTarget(null)}
        footer={<><Btn variant="ghost" onClick={()=>setCheckinTarget(null)}>Cancel</Btn><Btn onClick={doCheckIn} disabled={!badge}>Confirm</Btn></>}>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex gap-2">⚠️ Verify visitor's government ID first.</div>
        <Input label="Badge Number" value={badge} onChange={e=>setBadge(e.target.value)} placeholder="e.g. V-1024" required />
      </Dialog>
    </div>
  );
}

// ─── QR SCANNER (camera-based) ────────────────────────────────────
function QRScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        tick();
      })
      .catch(() => setError("Camera access denied. Please allow camera permissions and try again."));

    function tick() {
      if (!active || !scanning) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          // Use BarcodeDetector if available (Chrome 83+, Edge 83+)
          if ("BarcodeDetector" in window) {
            const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
            detector.detect(canvas).then(codes => {
              if (codes.length > 0) {
                setScanning(false);
                onResult(codes[0].rawValue);
              } else {
                rafRef.current = requestAnimationFrame(tick);
              }
            }).catch(() => { rafRef.current = requestAnimationFrame(tick); });
          } else {
            // Fallback: show manual input
            setError("QR auto-detect not supported on this browser. Use manual entry below.");
          }
        } catch { rafRef.current = requestAnimationFrame(tick); }
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[700] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#0F172A] p-4 flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-semibold">📷 Scan Visitor QR Code</p>
            <p className="text-slate-400 text-xs">Point camera at visitor's QR pass</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="relative bg-black" style={{ minHeight: 240 }}>
          <video ref={videoRef} className="w-full" playsInline muted style={{ display: "block" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div style={{ width: 180, height: 180, position: "relative" }}>
              {[["0","0","borderTop","borderLeft"],["0","0","borderTop","borderRight",{right:0,left:"auto"}],
                ["0","0","borderBottom","borderLeft",{bottom:0,top:"auto"}],
                ["0","0","borderBottom","borderRight",{bottom:0,top:"auto",right:0,left:"auto"}]
              ].map((_,i) => null)}
              <div style={{position:"absolute",top:0,left:0,width:32,height:32,borderTop:"3px solid #2563EB",borderLeft:"3px solid #2563EB",borderRadius:"4px 0 0 0"}}/>
              <div style={{position:"absolute",top:0,right:0,width:32,height:32,borderTop:"3px solid #2563EB",borderRight:"3px solid #2563EB",borderRadius:"0 4px 0 0"}}/>
              <div style={{position:"absolute",bottom:0,left:0,width:32,height:32,borderBottom:"3px solid #2563EB",borderLeft:"3px solid #2563EB",borderRadius:"0 0 0 4px"}}/>
              <div style={{position:"absolute",bottom:0,right:0,width:32,height:32,borderBottom:"3px solid #2563EB",borderRight:"3px solid #2563EB",borderRadius:"0 0 4px 0"}}/>
              <div style={{position:"absolute",top:"50%",left:4,right:4,height:2,background:"rgba(37,99,235,0.6)",animation:"scan 1.5s linear infinite"}}/>
            </div>
          </div>
          <style>{`@keyframes scan{0%{top:20%}50%{top:80%}100%{top:20%}}`}</style>
        </div>

        {error && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-700">{error}</p>
          </div>
        )}

        {/* Manual fallback */}
        <div className="p-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">Or enter reference number manually:</p>
          <ManualQREntry onResult={onResult} />
        </div>
      </div>
    </div>
  );
}

function ManualQREntry({ onResult }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="e.g. VR-ABC123"
        className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
        onKeyDown={e => e.key === "Enter" && val.trim() && onResult(val.trim())}
      />
      <button
        onClick={() => val.trim() && onResult(val.trim())}
        className="px-3 h-9 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
      >
        Look up
      </button>
    </div>
  );
}

// ─── SECURITY DESK ────────────────────────────────────────────────
function SecurityDesk({ requests, setRequests, apiMode = false, refreshRequests = async () => {} }) {
  const [q, setQ] = useState("");
  const [badge, setBadge] = useState("");
  const [target, setTarget] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [idVerified, setIdVerified] = useState(false);

  const approved = requests.filter(r =>
    r.approval_status === "Approved" &&
    (r.status === "Pending Arrival" || r.status === "Checked In") &&
    (r.visitor_name.toLowerCase().includes(q.toLowerCase()) || r.id?.toString().includes(q))
  );

  async function checkOut(id) {
    try { await checkOutVisitor(id); await refreshRequests(); }
    catch (e) { console.error("Failed to check out visitor", e); alert("Failed to check out visitor. See console for details."); }
  }

  async function confirmCheckIn() {
    try { await checkInVisitor(target.id, { badge_number: badge, visitor_id_verified: idVerified }); await refreshRequests(); }
    catch (e) { console.error("Failed to check in visitor", e); alert("Failed to check in visitor. See console for details."); }
    setTarget(null); setBadge(""); setIdVerified(false);
  }

  function handleQRResult(raw) {
    setShowScanner(false);
    // raw format: "qr_ref|name|date|host" OR just a ref string
    const parts = raw.split("|");
    const ref = parts[0];
    // Try to find matching request by qr_ref or id
    const found = requests.find(r =>
      r.qr_ref === ref || r.id === ref || r.id?.toString() === ref
    );
    if (found) {
      setScanResult({ found: true, request: found });
      if (found.approval_status === "Approved" && found.status === "Pending Arrival") {
        setTarget(found);
      }
    } else {
      setScanResult({ found: false, raw });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Security Desk</h1>
          <p className="text-sm text-gray-500">Verify IDs, issue badges, log entry and exit</p>
        </div>
        <button
          onClick={() => { setShowScanner(true); setScanResult(null); }}
          className="flex items-center gap-2 px-4 h-10 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow"
        >
          📷 Scan QR
        </button>
      </div>

      {/* QR scan result banner */}
      {scanResult && !target && (
        <div className={`rounded-xl p-4 flex items-start gap-3 ${scanResult.found ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <span className="text-xl">{scanResult.found ? "✅" : "❌"}</span>
          <div>
            {scanResult.found ? (
              <>
                <p className="text-sm font-semibold text-green-800">Visitor found: {scanResult.request.visitor_name}</p>
                <p className="text-xs text-green-600">Status: {scanResult.request.status} · {scanResult.request.approval_status}</p>
                {scanResult.request.status !== "Pending Arrival" && (
                  <p className="text-xs text-amber-700 mt-1">⚠️ This visitor is not in Pending Arrival status.</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-red-800">No matching visitor found</p>
                <p className="text-xs text-red-600">QR ref: {scanResult.raw}</p>
              </>
            )}
          </div>
          <button onClick={() => setScanResult(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
      )}

      <div className="bg-[#0F172A] rounded-[12px] p-4 text-white">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Check-in procedure</p>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          {["🚶 Visitor arrives", "📷 Scan QR / Search", "🪪 Verify ID", "🔖 Issue badge", "✅ Log check-in"].map((s, i, a) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</div>
              <span className="text-slate-300">{s}</span>
              {i < a.length - 1 && <span className="text-slate-600">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[12px] border border-gray-200 p-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search visitor name…"
          className="w-full h-9 pl-4 pr-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
      </div>

      <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3">Visitor</th><th className="px-4 py-3">Host</th>
            <th className="px-4 py-3">Scheduled</th><th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Badge</th><th className="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>
            {approved.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No approved visitors</td></tr>}
            {approved.map(r => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.visitor_name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.host || r.host_name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.visit_date} · {r.expected_time}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-500">{r.badge_number || "—"}</td>
                <td className="px-4 py-3 flex gap-1">
                  {r.status === "Pending Arrival" && <Btn size="sm" variant="success" onClick={() => { setTarget(r); setIdVerified(false); }}>🔖 Check In</Btn>}
                  {r.status === "Checked In" && <Btn size="sm" variant="warning" onClick={() => checkOut(r.id)}>Exit</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Check-in dialog */}
      <Dialog open={!!target} title="Check In Visitor" onClose={() => { setTarget(null); setIdVerified(false); }}
        footer={<><Btn variant="ghost" onClick={() => { setTarget(null); setIdVerified(false); }}>Cancel</Btn><Btn onClick={confirmCheckIn} disabled={!badge || !idVerified}>Confirm & Issue Badge</Btn></>}>
        {target && <>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-sm font-semibold text-gray-900">{target.visitor_name}</p>
            <p className="text-xs text-gray-500">{target.purpose} · Visiting {target.host || target.host_name}</p>
          </div>
          {/* Show QR of the visitor's pass */}
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="text-xs text-gray-400 font-medium">Visitor QR Pass</p>
            <QRCanvas data={`${target.qr_ref || target.id}|${target.visitor_name}|${target.visit_date}|${target.host || target.host_name}`} size={120} />
            <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{target.qr_ref || target.id}</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">⚠️ Verify the visitor's government ID before proceeding.</div>
          <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={idVerified} onChange={e => setIdVerified(e.target.checked)} />
            <span>Government ID verified — name and photo match.</span>
          </label>
          <Input label="Badge Number" value={badge} onChange={e => setBadge(e.target.value)} placeholder="e.g. V-1024" required />
          {!idVerified && <p className="text-xs text-red-500">You must verify the government ID before confirming.</p>}
        </>}
      </Dialog>

      {/* QR Scanner modal */}
      {showScanner && <QRScanner onResult={handleQRResult} onClose={() => setShowScanner(false)} />}
    </div>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────
function Analytics({ requests, visitors, user, apiMode = false }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiMode) return;
    setLoading(true);
    getAnalyticsSummary()
      .then(res => setSummary(res.data))
      .catch(e => console.error("Failed to load analytics", e))
      .finally(() => setLoading(false));
  }, [apiMode]);

  // Derive totals from live requests (always available)
  const total    = requests.length;
  const checkedIn= requests.filter(r => r.status === "Checked In").length;
  const pending  = requests.filter(r => r.approval_status === "Pending").length;
  const rejected = requests.filter(r => r.approval_status === "Rejected").length;
  const approved = requests.filter(r => r.approval_status === "Approved").length;

  // Use API data when available, fall back to client-derived data
  const weeklyData  = summary?.weekly_traffic  || [];
  const monthlyData = summary?.monthly_traffic || [];
  const purposeData = summary?.purpose_dist    || [];
  const hourData    = summary?.hour_dist       || [];

  const statusBreakdown = [
    { label: "Approved", count: approved, pct: total ? Math.round(approved/total*100) : 0, color: "bg-green-500" },
    { label: "Pending",  count: pending,  pct: total ? Math.round(pending/total*100)  : 0, color: "bg-yellow-500" },
    { label: "Rejected", count: rejected, pct: total ? Math.round(rejected/total*100) : 0, color: "bg-red-500" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500">{user.role === "Administrator" ? "Full-system overview" : "Your desk analytics"}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Visitors"   value={visitors.length} icon="👥" color="bg-blue-50 text-blue-600" />
        <Kpi label="Total Requests"   value={total}           icon="📋" color="bg-violet-50 text-violet-600" />
        <Kpi label="Currently Inside" value={checkedIn}       icon="🏢" color="bg-emerald-50 text-emerald-600" />
        <Kpi label="Pending Approval" value={pending}         icon="⏳" color="bg-amber-50 text-amber-600" />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-4">Loading charts…</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Weekly visitor traffic</h3>
          {weeklyData.length === 0
            ? <p className="text-xs text-gray-400 text-center py-8">No data for the last 7 days</p>
            : <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weeklyData} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip contentStyle={{fontSize:12}} />
                  <Bar dataKey="visits" fill="#2563EB" radius={[3,3,0,0]} name="Visits" />
                </BarChart>
              </ResponsiveContainer>}
        </div>

        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Monthly trend</h3>
          {monthlyData.length === 0
            ? <p className="text-xs text-gray-400 text-center py-8">No data yet</p>
            : <ResponsiveContainer width="100%" height={180}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip contentStyle={{fontSize:12}} />
                  <Line type="monotone" dataKey="visits" stroke="#2563EB" strokeWidth={2} dot={{r:3}} name="Visits" />
                </LineChart>
              </ResponsiveContainer>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Visit purpose breakdown</h3>
          {purposeData.length === 0
            ? <p className="text-xs text-gray-400 text-center py-8">No data yet</p>
            : <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={150}>
                  <PieChart>
                    <Pie data={purposeData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {purposeData.map((e,i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{fontSize:12}} formatter={v => [`${v}%`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 flex-1">
                  {purposeData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{background: d.color}} />
                      <span className="text-gray-600 truncate">{d.name}</span>
                      <span className="font-semibold text-gray-800 ml-auto">{d.value}%</span>
                    </div>
                  ))}
                </div>
              </div>}
        </div>

        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Peak arrival hours</h3>
          {hourData.length === 0
            ? <p className="text-xs text-gray-400 text-center py-8">No scheduled times recorded yet</p>
            : <ResponsiveContainer width="100%" height={150}>
                <BarChart data={hourData} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{fontSize:10}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip contentStyle={{fontSize:12}} />
                  <Bar dataKey="count" fill="#0891B2" radius={[3,3,0,0]} name="Arrivals" />
                </BarChart>
              </ResponsiveContainer>}
        </div>
      </div>

      {user.role === "Administrator" && (
        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Request status breakdown</h3>
          <div className="flex gap-4">
            {statusBreakdown.map(s => (
              <div key={s.label} className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600 font-medium">{s.label}</span>
                  <span className="font-bold text-gray-900">{s.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cls("h-full rounded-full", s.color)} style={{width: `${s.pct}%`}} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.pct}% of total</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AUDIT LOG ────────────────────────────────────────────────────
function AuditLog({ apiMode = false }) {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!apiMode) return;
    setLoading(true);
    getAuditLog({ limit: 200 })
      .then(res => setEvents(res.data))
      .catch(() => setError("Could not load audit log."))
      .finally(() => setLoading(false));
  }, [apiMode]);

  const typeColor = {
    "Staff Login":       "text-blue-600 bg-blue-50",
    "Staff Logout":      "text-gray-600 bg-gray-100",
    "Request Created":   "text-violet-600 bg-violet-50",
    "Request Approved":  "text-green-600 bg-green-50",
    "Request Rejected":  "text-red-600 bg-red-50",
    "Checked In":        "text-emerald-600 bg-emerald-50",
    "Checked Out":       "text-gray-600 bg-gray-100",
    "Visitor Blocked":   "text-orange-600 bg-orange-50",
    "Visitor Unblocked": "text-blue-600 bg-blue-50",
  };

  function fmt(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500">Full server-side event trail — who did what and when</p>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-8">Loading…</p>}
      {error   && <p className="text-sm text-red-500 text-center py-4">{error}</p>}
      {!apiMode && <p className="text-sm text-gray-400 text-center py-8">Connect to the backend to view the audit log.</p>}

      {!loading && apiMode && events.length === 0 && !error && (
        <p className="text-sm text-gray-400 text-center py-8">No events recorded yet.</p>
      )}

      {events.length > 0 && (
        <div className="bg-white rounded-[12px] border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Visitor</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={cls("px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap",
                      typeColor[e.event_type] || "bg-gray-100 text-gray-600")}>
                      {e.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 font-medium">{e.actor_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{e.visitor_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[180px] truncate">{e.detail || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmt(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ─── RESTRICTED AREAS ─────────────────────────────────────────────
function RestrictedAreas({ requests, user, apiMode = false }) {
  const [areas,       setAreas]       = useState([]);
  const [selected,    setSelected]    = useState(null);  // area for occupant view
  const [occupants,   setOccupants]   = useState([]);
  const [loadingAreas,setLoadingAreas]= useState(false);
  const [loadingOcc,  setLoadingOcc]  = useState(false);
  const [areaError,   setAreaError]   = useState("");

  // Create area dialog
  const [showCreate,  setShowCreate]  = useState(false);
  const [areaForm,    setAreaForm]    = useState({ name:"", description:"", floor:"" });
  const [saving,      setSaving]      = useState(false);

  // Grant access dialog
  const [showGrant,   setShowGrant]   = useState(null);  // area object
  const [grantReqId,  setGrantReqId]  = useState("");
  const [granting,    setGranting]    = useState(false);
  const [grantError,  setGrantError]  = useState("");

  // Guard: issue badge dialog
  const [showIssue,   setShowIssue]   = useState(null);  // area object
  const [issueQR,     setIssueQR]     = useState("");
  const [issueBadge,  setIssueBadge]  = useState("");
  const [issuing,     setIssuing]     = useState(false);
  const [issueResult, setIssueResult] = useState(null);
  const [issueError,  setIssueError]  = useState("");

  // Guard: confirm entry/exit
  const [scanMode,    setScanMode]    = useState(null);   // "entry" | "exit"
  const [scanBadge,   setScanBadge]   = useState("");
  const [scanResult,  setScanResult]  = useState(null);
  const [scanError,   setScanError]   = useState("");
  const [scanning,    setScanning]    = useState(false);

  // Search
  const [q, setQ] = useState("");

  const isAdmin = user.role === "Administrator";
  const isAdminOrRecep = ["Administrator","Receptionist"].includes(user.role);
  const isGuard = user.role === "Security Guard";

  function loadAreas() {
    if (!apiMode) return;
    setLoadingAreas(true);
    getRestrictedAreas()
      .then(r => setAreas(r.data))
      .catch(() => setAreaError("Failed to load restricted areas."))
      .finally(() => setLoadingAreas(false));
  }

  useEffect(() => { loadAreas(); }, [apiMode]);

  function loadOccupants(area) {
    setSelected(area);
    setLoadingOcc(true);
    getAreaOccupants(area.id)
      .then(r => setOccupants(r.data))
      .catch(() => setOccupants([]))
      .finally(() => setLoadingOcc(false));
  }

  async function createArea() {
    if (!areaForm.name) return;
    setSaving(true);
    try {
      await createRestrictedArea(areaForm);
      setShowCreate(false); setAreaForm({ name:"", description:"", floor:"" });
      loadAreas();
    } catch(e) { setAreaError(e?.response?.data?.detail || "Failed to create area."); }
    finally { setSaving(false); }
  }

  async function removeArea(id) {
    if (!confirm("Deactivate this restricted area?")) return;
    await deleteRestrictedArea(id); loadAreas();
  }

  async function doGrant() {
    if (!grantReqId) return;
    setGranting(true); setGrantError("");
    try {
      await grantRestrictedAccess(showGrant.id, { visit_request_id: grantReqId });
      setShowGrant(null); setGrantReqId(""); loadAreas();
    } catch(e) { setGrantError(e?.response?.data?.detail || "Failed to grant access."); }
    finally { setGranting(false); }
  }

  async function doIssueBadge() {
    if (!issueQR || !issueBadge) return;
    setIssuing(true); setIssueError(""); setIssueResult(null);
    try {
      const r = await issueRestrictedBadge({ qr_ref: issueQR, restricted_area_id: showIssue.id, restricted_badge: issueBadge });
      setIssueResult(r.data); setIssueQR(""); setIssueBadge("");
      loadAreas();
    } catch(e) { setIssueError(e?.response?.data?.detail || "Failed to issue badge."); }
    finally { setIssuing(false); }
  }

  async function doScan() {
    if (!scanBadge) return;
    setScanning(true); setScanError(""); setScanResult(null);
    try {
      const fn = scanMode === "entry" ? confirmRestrictedEntry : confirmRestrictedExit;
      const r = await fn({ restricted_badge: scanBadge });
      setScanResult(r.data); setScanBadge(""); loadAreas();
      if (selected) loadOccupants(selected);
    } catch(e) { setScanError(e?.response?.data?.detail || "Badge not found or wrong status."); }
    finally { setScanning(false); }
  }

  function statusColor(s) {
    return s === "Inside"       ? "text-emerald-600 bg-emerald-50"
         : s === "Badge Issued" ? "text-blue-600 bg-blue-50"
         : s === "Exited"       ? "text-gray-500 bg-gray-100"
         :                        "text-amber-600 bg-amber-50";
  }

  const filteredAreas = areas.filter(a =>
    a.name.toLowerCase().includes(q.toLowerCase()) ||
    a.floor?.toLowerCase().includes(q.toLowerCase())
  );

  // Approved requests that can be granted restricted access
  const approvedRequests = requests.filter(r => r.approval_status === "Approved");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Restricted Areas</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? "Manage areas, grant access, and view occupants"
             : isAdminOrRecep ? "Manage areas and grant access"
             : "Issue and scan restricted badges"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdminOrRecep && (
            <Btn onClick={() => setShowCreate(true)}>+ New Area</Btn>
          )}
          {(isGuard || isAdmin) && (<>
            <Btn variant="outline" onClick={() => { setScanMode("entry"); setScanResult(null); setScanError(""); }}>🔍 Confirm Entry</Btn>
            <Btn variant="outline" onClick={() => { setScanMode("exit");  setScanResult(null); setScanError(""); }}>🚪 Confirm Exit</Btn>
          </>)}
        </div>
      </div>

      {/* Entry / Exit scan panel */}
      {scanMode && (
        <div className="bg-white rounded-[12px] border border-gray-200 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">
              {scanMode === "entry" ? "🔍 Confirm Restricted Area Entry" : "🚪 Confirm Restricted Area Exit"}
            </h3>
            <button onClick={() => { setScanMode(null); setScanResult(null); setScanError(""); }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
          <div className="flex gap-2">
            <input value={scanBadge} onChange={e => setScanBadge(e.target.value)}
              placeholder="Enter restricted badge number e.g. RA-1024"
              className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              onKeyDown={e => e.key === "Enter" && doScan()} />
            <Btn onClick={doScan} disabled={scanning || !scanBadge}>{scanning ? "…" : "Confirm"}</Btn>
          </div>
          {scanError && <p className="text-xs text-red-500">{scanError}</p>}
          {scanResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800">✅ {scanResult.visitor_name}</p>
              <p className="text-xs text-emerald-600">{scanResult.area_name} — {scanResult.status}</p>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-[12px] border border-gray-200 p-3">
        <input className="w-full h-9 pl-4 pr-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="Search areas by name or floor…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {areaError && <p className="text-sm text-red-500">{areaError}</p>}
      {loadingAreas && <p className="text-sm text-gray-400 text-center py-8">Loading…</p>}

      {/* Areas grid */}
      {!loadingAreas && filteredAreas.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No restricted areas defined yet.</p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredAreas.map(area => (
          <div key={area.id} className="bg-white rounded-[12px] border border-gray-200 p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base">🔒</span>
                  <h3 className="font-bold text-gray-900 text-sm">{area.name}</h3>
                </div>
                {area.floor && <p className="text-xs text-gray-400 mt-0.5">Floor: {area.floor}</p>}
                {area.description && <p className="text-xs text-gray-500 mt-1">{area.description}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {area.current_occupants} inside
                </span>
                {isAdmin && (
                  <button onClick={() => removeArea(area.id)}
                    className="text-gray-300 hover:text-red-400 text-sm leading-none transition-colors">✕</button>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && (
                <button onClick={() => loadOccupants(area)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                  👥 View Occupants
                </button>
              )}
              {isAdmin && (
                <button onClick={() => { setShowGrant(area); setGrantReqId(""); setGrantError(""); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium transition-colors">
                  ＋ Grant Access
                </button>
              )}
              {(isGuard || isAdmin) && (
                <button onClick={() => { setShowIssue(area); setIssueQR(""); setIssueBadge(""); setIssueResult(null); setIssueError(""); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 font-medium transition-colors">
                  🪪 Issue Badge
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Occupants panel — Admin only */}
      {selected && isAdmin && (
        <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Occupants — {selected.name}</h3>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
          {loadingOcc
            ? <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
            : occupants.length === 0
              ? <p className="text-sm text-gray-400 text-center py-6">No access records for this area.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3">Visitor</th>
                      <th className="px-4 py-3">Badge</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Approved By</th>
                      <th className="px-4 py-3">Entered</th>
                      <th className="px-4 py-3">Exited</th>
                    </tr></thead>
                    <tbody>
                      {occupants.map(o => (
                        <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{o.visitor_name}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-600">{o.restricted_badge || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={cls("px-2 py-0.5 rounded-full text-[11px] font-semibold", statusColor(o.status))}>
                              {o.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{o.approved_by_name || "—"}</td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {o.entry_confirmed_at ? new Date(o.entry_confirmed_at).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {o.exited_at ? new Date(o.exited_at).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          }
        </div>
      )}

      {/* Create Area Dialog */}
      <Dialog open={showCreate} title="Create Restricted Area" onClose={() => setShowCreate(false)}
        footer={<><Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn><Btn onClick={createArea} disabled={saving}>{saving ? "Saving…" : "Create Area"}</Btn></>}>
        <Input label="Area Name" value={areaForm.name} onChange={e => setAreaForm(p => ({...p, name: e.target.value}))} required placeholder="e.g. Server Room, Lab B" />
        <Input label="Floor / Location" value={areaForm.floor} onChange={e => setAreaForm(p => ({...p, floor: e.target.value}))} placeholder="e.g. 3rd Floor" />
        <Input label="Description" value={areaForm.description} onChange={e => setAreaForm(p => ({...p, description: e.target.value}))} placeholder="Optional notes about this area" />
      </Dialog>

      {/* Grant Access Dialog — Admin only */}
      <Dialog open={!!showGrant} title={`Grant Restricted Access — ${showGrant?.name}`} onClose={() => setShowGrant(null)}
        footer={<><Btn variant="ghost" onClick={() => setShowGrant(null)}>Cancel</Btn><Btn onClick={doGrant} disabled={granting || !grantReqId}>{granting ? "Granting…" : "Grant Access"}</Btn></>}>
        <p className="text-xs text-gray-500 mb-2">Select an approved visit request to grant access to this restricted area. The guard will then issue a special badge.</p>
        {grantError && <p className="text-xs text-red-500 mb-2">{grantError}</p>}
        <label className="block text-xs font-semibold text-gray-600 mb-1">Approved Visit Request
          <select value={grantReqId} onChange={e => setGrantReqId(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
            <option value="">— Select a request —</option>
            {approvedRequests.map(r => (
              <option key={r.id} value={r.id}>{r.visitor_name} · {r.visit_date} · {r.purpose}</option>
            ))}
          </select>
        </label>
      </Dialog>

      {/* Issue Restricted Badge Dialog — Guard / Admin */}
      <Dialog open={!!showIssue} title={`Issue Restricted Badge — ${showIssue?.name}`} onClose={() => setShowIssue(null)}
        footer={<><Btn variant="ghost" onClick={() => setShowIssue(null)}>Close</Btn><Btn onClick={doIssueBadge} disabled={issuing || !issueQR || !issueBadge}>{issuing ? "Issuing…" : "Issue Badge"}</Btn></>}>
        <p className="text-xs text-gray-500 mb-2">Scan or enter the visitor's approval QR code, then assign a restricted badge number.</p>
        {issueError && <p className="text-xs text-red-500 mb-2">{issueError}</p>}
        {issueResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-emerald-800">✅ Badge issued to {issueResult.visitor_name}</p>
            <p className="text-xs text-emerald-600">Badge: {issueResult.restricted_badge} → {issueResult.area_name}</p>
          </div>
        )}
        <Input label="Visitor QR Ref" value={issueQR} onChange={e => setIssueQR(e.target.value)} placeholder="Paste or scan approval QR ref" />
        <Input label="Restricted Badge Number" value={issueBadge} onChange={e => setIssueBadge(e.target.value)} placeholder="e.g. RA-1024" />
      </Dialog>
    </div>
  );
}

// ─── LAYOUT ───────────────────────────────────────────────────────
function Sidebar({ page, setPage, user, open, onClose }) {
  const adminNav=[{id:"dashboard",label:"Dashboard",icon:"📊"},{id:"visitors",label:"Visitors",icon:"👥"},{id:"requests",label:"Visit Requests",icon:"📋"},{id:"security",label:"Security Desk",icon:"🔒"},{id:"analytics",label:"Analytics",icon:"📈"},{id:"audit",label:"Audit Log",icon:"📜"},{id:"restricted",label:"Restricted Areas",icon:"🔒"}];
  const guardNav=[{id:"dashboard",label:"Dashboard",icon:"📊"},{id:"visitors",label:"Visitors",icon:"👥"},{id:"security",label:"Security Desk",icon:"🔒"},{id:"audit",label:"Audit Log",icon:"📜"},{id:"restricted",label:"Restricted Areas",icon:"🔒"}];
  const recepNav=[{id:"dashboard",label:"Dashboard",icon:"📊"},{id:"visitors",label:"Visitors",icon:"👥"},{id:"requests",label:"Visit Requests",icon:"📋"},{id:"analytics",label:"Analytics",icon:"📈"},{id:"audit",label:"Audit Log",icon:"📜"}];
  const nav=user.role==="Administrator"?adminNav:user.role==="Security Guard"?guardNav:recepNav;

  function handleNav(id) { setPage(id); onClose(); }

  return (
    <>
      {/* Backdrop — mobile only */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-[110] lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside className={cls(
        "fixed left-0 top-0 w-60 h-screen bg-[#0F172A] flex flex-col z-[120] transition-transform duration-300",
        // On large screens: always visible, no transform needed
        // On mobile: slide in/out based on `open`
        "lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-white/[.06]">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs">🪪</div>
          <span className="text-white font-bold text-sm">Vista VMS</span>
          {/* Close button — mobile only */}
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white lg:hidden text-lg leading-none">✕</button>
        </div>
        <div className="px-3 py-3 border-b border-white/[.06]">
          <div className="flex items-center gap-2 px-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">{user.initials}</div>
            <div><p className="text-white text-xs font-semibold">{user.name}</p><p className="text-slate-400 text-[10px]">{user.role}</p></div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {nav.map(n=>(
            <button key={n.id} onClick={()=>handleNav(n.id)}
              className={cls("flex items-center gap-2.5 mx-2 px-3 py-2 text-[13px] font-medium rounded-lg transition-colors text-left w-[calc(100%-16px)]",page===n.id?"bg-blue-600 text-white":"text-slate-400 hover:bg-white/5 hover:text-white")}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 text-[10px] text-slate-500 border-t border-white/[.06]">Vista VMS · v1.2</div>
      </aside>
    </>
  );
}

function Topbar({ user, onLogout, onMenuOpen }) {
  const roleColors={Administrator:"bg-purple-600","Security Guard":"bg-emerald-600",Receptionist:"bg-blue-600"};
  return (
    <header className="fixed top-0 left-0 lg:left-60 right-0 h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4 z-[50]">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuOpen}
        className="lg:hidden flex flex-col gap-1.5 p-1.5 rounded-md hover:bg-gray-100 transition-colors"
        aria-label="Open menu"
      >
        <span className="block w-5 h-0.5 bg-gray-600 rounded"/>
        <span className="block w-5 h-0.5 bg-gray-600 rounded"/>
        <span className="block w-5 h-0.5 bg-gray-600 rounded"/>
      </button>

      {/* Logo — mobile only (hidden on desktop since sidebar shows it) */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs">🪪</div>
        <span className="font-bold text-sm text-gray-800">Vista VMS</span>
      </div>

      <div className="flex-1"/>
      <div className={cls("px-2.5 py-1 rounded-full text-white text-[11px] font-bold hidden sm:block",roleColors[user.role]||"bg-gray-600")}>{user.role}</div>
      <div className="text-sm font-medium text-gray-700 hidden sm:block">{user.name}</div>
      <button onClick={onLogout} className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Sign Out</button>
    </header>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────
export default function VistaVMS({ apiMode = false, authUser = null, onSignInWithPassword = null, onEnrollBiometric = null, onVerifyBiometric = null, onLogout = null }) {
  const [screen, setScreen] = useState("landing"); // landing | visitor | staff-login | app | retrieve
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visitors, setVisitors] = useState(SEED_VISITORS);
  const [requests, setRequests] = useState(SEED_REQUESTS);

  // Fetch real visit requests from the backend when running in apiMode
  const refreshRequests = useCallback(async () => {
    if (!apiMode) return;
    try {
      const res = await getVisitRequests();
      setRequests(res.data);
    } catch (e) {
      console.error("Failed to load visit requests", e);
    }
  }, [apiMode]);

  const refreshVisitors = useCallback(async () => {
    if (!apiMode) return;
    try {
      const res = await getVisitors();
      setVisitors(res.data);
    } catch (e) {
      console.error("Failed to load visitors", e);
    }
  }, [apiMode]);

  // Initial fetch when the app screen mounts
  useEffect(() => {
    if (apiMode && screen === "app") { refreshRequests(); refreshVisitors(); }
  }, [apiMode, screen, refreshRequests, refreshVisitors]);

  // Re-fetch whenever the user switches back to this tab or returns to the app
  // from the phone home screen. Fixes the stale-data bug where a laptop left
  // open on the dashboard showed different counts than a phone opened fresh.
  useEffect(() => {
    if (!apiMode || screen !== "app") return;
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshRequests(); refreshVisitors();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [apiMode, screen, refreshRequests, refreshVisitors]);

  // NOTE: screen/user transitions are driven directly by handleLoginSuccess
  // and handleLogout below — there is no longer a separate effect syncing
  // from `authUser`, since that raced with handleLoginSuccess (both could
  // flip `screen` to "app" independently, sometimes before `user` was fully
  // populated, causing a render crash reading `user.role` on undefined).

  const handleLoginSuccess = (realUser) => {
    if (!realUser || !realUser.role) {
      console.error("Login succeeded but user object is incomplete:", realUser);
      return;
    }
    setUser(realUser); setPage("dashboard"); setScreen("app");
  };

  const handleLogout = async () => {
    if (onLogout) await onLogout();
    setUser(null); setScreen("landing");
  };

  if (screen === "landing") return <LandingPage onVisitor={() => setScreen("visitor")} onStaff={() => setScreen("staff-login")} onRetrieve={() => setScreen("retrieve")} />;
  if (screen === "visitor") return <VisitorPortal onBack={() => setScreen("landing")} apiMode={apiMode} />;
  if (screen === "retrieve") return <RetrievePass onBack={() => setScreen("landing")} />;
  if (screen === "staff-login") return (
    // BUG #5 FIX: onBack must be passed here so the "← Back" button inside
    // StaffLogin can navigate back to the landing page. Without it, clicking
    // "← Back" called undefined and silently did nothing.
    <StaffLogin
      onSignInWithPassword={onSignInWithPassword}
      onEnrollBiometric={onEnrollBiometric}
      onVerifyBiometric={onVerifyBiometric}
      onSuccess={handleLoginSuccess}
      onBack={() => setScreen("landing")}
    />
  );

  if (screen === "app" && (!user || !user.role)) {
    // Guards against any stale localStorage state or timing edge case —
    // never render the dashboard shell with an incomplete user object.
    return <LandingPage onVisitor={() => setScreen("visitor")} onStaff={() => setScreen("staff-login")} onRetrieve={() => setScreen("retrieve")} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Sidebar page={page} setPage={setPage} user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Topbar user={user} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} />
      <main className="lg:ml-60 mt-14 min-h-[calc(100vh-3.5rem)] p-4 lg:p-6">
        {/* URL BYPASS FIX: every page checks the user role before rendering.
             A Security Guard who manually sets page="requests" in React DevTools
             or localStorage will see "Access denied" instead of the page. */}
        {page === "dashboard" && <Dashboard requests={requests} visitors={visitors} user={user} />}
        {page === "visitors" && <VisitorsPage visitors={visitors} setVisitors={setVisitors} requests={requests} user={user} apiMode={apiMode} refreshVisitors={refreshVisitors} />}
        {page === "requests" && (["Administrator","Receptionist"].includes(user.role)
          ? <VisitRequestsPage requests={requests} setRequests={setRequests} user={user} apiMode={apiMode} refreshRequests={refreshRequests} />
          : <AccessDenied />)}
        {page === "security" && (["Administrator","Security Guard"].includes(user.role)
          ? <SecurityDesk requests={requests} setRequests={setRequests} apiMode={apiMode} refreshRequests={refreshRequests} />
          : <AccessDenied />)}
        {page === "analytics" && (["Administrator","Receptionist"].includes(user.role)
          ? <Analytics requests={requests} visitors={visitors} user={user} apiMode={apiMode} />
          : <AccessDenied />)}
        {page === "audit" && (["Administrator"].includes(user.role)
          ? <AuditLog apiMode={apiMode} />
          : <AccessDenied />)}
        {page === "restricted" && (["Administrator","Security Guard"].includes(user.role)
          ? <RestrictedAreas requests={requests} user={user} apiMode={apiMode} />
          : <AccessDenied />)}
      </main>
    </div>
  );
}
