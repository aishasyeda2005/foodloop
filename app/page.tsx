"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Lot = { id: string; donor_name: string; item: string; quantity: number; pickup_by: string; status: string };
type Recipient = { id: string; name: string; capacity: number };
type Pickup = { id: string; lot_id: string; recipient_id: string; otp: string; status: string };
type Notice = { kind: "success" | "error" | "info"; text: string };

const BADGE: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  accepted: "bg-amber-50 text-amber-700 ring-amber-600/20",
  completed: "bg-sky-50 text-sky-700 ring-sky-600/20",
  expired: "bg-slate-100 text-slate-600 ring-slate-500/20",
};
const NOTICE: Record<Notice["kind"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};
const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20";
const btnPrimary =
  "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function Badge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${BADGE[status] ?? BADGE.expired}`}>
      {status}
    </span>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mb-4 mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">{text}</p>;
}

export default function Home() {
  const [role, setRole] = useState<"donor" | "ngo">("donor");
  const [lots, setLots] = useState<Lot[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [otpInput, setOtpInput] = useState<Record<string, string>>({});

  const [freeText, setFreeText] = useState("");
  const [donor, setDonor] = useState("Campus Cafeteria");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [minutes, setMinutes] = useState("90");

  function notify(kind: Notice["kind"], text: string) {
    setNotice({ kind, text });
    setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 8000);
  }

  const load = useCallback(async () => {
    const [l, r, p] = await Promise.all([
      supabase.from("lots").select("*").order("pickup_by"),
      supabase.from("recipients").select("*"),
      supabase.from("pickups").select("*"),
    ]);
    if (l.error) return notify("error", l.error.message);
    setLots(l.data ?? []);
    setPickups(p.data ?? []);
    if (r.data) {
      setRecipients(r.data);
      setRecipientId((prev) => prev || r.data[0]?.id || "");
    }
  }, []);

  useEffect(() => {
    load();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [load]);

  const isExpired = (l: Lot) => now > 0 && l.status === "open" && new Date(l.pickup_by).getTime() <= now;
  const shownStatus = (l: Lot) => (isExpired(l) ? "expired" : l.status);
  const lotOf = (id: string) => lots.find((l) => l.id === id);
  const timeLeft = (l: Lot) => {
    if (!now) return "";
    const m = Math.floor((new Date(l.pickup_by).getTime() - now) / 60000);
    if (m <= 0) return "Expired";
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m} min left`;
  };

  async function fillFromAI() {
    if (!freeText.trim()) return notify("info", "Type a short message first, then let the assistant fill the form.");
    setBusy("ai");
    try {
      const res = await fetch("/api/parse", { method: "POST", body: JSON.stringify({ text: freeText }) });
      const d = await res.json();
      if (!res.ok || !d.item || !(d.quantity > 0) || !(d.minutes > 0)) throw new Error();
      setItem(d.item);
      setQty(String(d.quantity));
      setMinutes(String(d.minutes));
      notify("success", "Form filled from your message. Please review it and post.");
    } catch {
      notify("error", "The assistant is unavailable. Please fill in the form manually.");
    }
    setBusy(null);
  }

  async function postLot() {
    const q = Number(qty);
    const m = Number(minutes);
    if (!donor.trim() || !item.trim() || !Number.isInteger(q) || q <= 0 || !(m > 0))
      return notify("error", "Please complete the form: donor, item, a whole-number quantity and a pickup window.");
    setBusy("post");
    const { error } = await supabase.from("lots").insert({
      donor_name: donor.trim(),
      item: item.trim(),
      quantity: q,
      pickup_by: new Date(Date.now() + m * 60000).toISOString(),
    });
    setBusy(null);
    if (error) return notify("error", error.message);
    notify("success", "Surplus lot posted and visible to partner NGOs.");
    setItem("");
    setQty("");
    setFreeText("");
    load();
  }

  async function accept(lot: Lot) {
    const rec = recipients.find((r) => r.id === recipientId);
    if (!rec) return notify("error", "Select an NGO first.");
    if (lot.quantity > rec.capacity)
      return notify("error", `${rec.name} cannot take ${lot.quantity} units (capacity ${rec.capacity}).`);
    setBusy(lot.id);
    // One conditional update: only an open, non-expired lot can be claimed, so two NGOs cannot take the same lot
    const { data, error } = await supabase
      .from("lots")
      .update({ status: "accepted" })
      .eq("id", lot.id)
      .eq("status", "open")
      .gt("pickup_by", new Date().toISOString())
      .select();
    if (error) {
      setBusy(null);
      return notify("error", error.message);
    }
    if (!data?.length) {
      setBusy(null);
      notify("error", "Rejected: this lot was already claimed or has expired.");
      return load();
    }
    // shortcut: OTP is generated in the browser, move it to a server route before real use
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const p = await supabase.from("pickups").insert({ lot_id: lot.id, recipient_id: rec.id, otp });
    if (p.error) {
      await supabase.from("lots").update({ status: "open" }).eq("id", lot.id); // roll back so the lot is not stuck
      setBusy(null);
      return notify("error", p.error.message);
    }
    setBusy(null);
    notify("success", `Accepted by ${rec.name}. Share pickup code ${otp} with the donor at handover.`);
    load();
  }

  async function handover(pk: Pickup) {
    setBusy(pk.id);
    const { data, error } = await supabase
      .from("pickups")
      .update({ status: "completed" })
      .eq("id", pk.id)
      .eq("status", "scheduled")
      .eq("otp", (otpInput[pk.id] ?? "").trim())
      .select();
    if (error) {
      setBusy(null);
      return notify("error", error.message);
    }
    if (!data?.length) {
      setBusy(null);
      return notify("error", "Incorrect code, or this handover is already completed.");
    }
    await supabase.from("lots").update({ status: "completed" }).eq("id", pk.lot_id);
    setBusy(null);
    notify("success", "Handover confirmed and added to verified impact.");
    load();
  }

  const scheduled = pickups.filter((p) => p.status === "scheduled");
  const delivered = lots.filter((l) => l.status === "completed");
  const units = delivered.reduce((s, l) => s + l.quantity, 0);
  const openLots = lots.filter((l) => l.status === "open" && !isExpired(l));
  const myPickups = scheduled.filter((p) => p.recipient_id === recipientId);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Food<span className="text-emerald-600">Loop</span> Dispatch
            </h1>
            <p className="text-sm text-slate-500">Surplus food, matched and handed over with proof.</p>
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {(["donor", "ngo"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  role === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {r === "donor" ? "Donor" : "NGO partner"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Open lots" value={openLots.length} hint="Available to partner NGOs now" />
          <Stat label="Pending handovers" value={scheduled.length} hint="Accepted, awaiting pickup" />
          <Stat label="Verified impact" value={`${units} units`} hint={`${delivered.length} confirmed handovers only`} />
        </div>

        {notice && (
          <div role="status" className={`flex items-start justify-between gap-4 rounded-lg border p-3 text-sm ${NOTICE[notice.kind]}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="font-bold">
              ×
            </button>
          </div>
        )}

        {role === "donor" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Post a surplus lot" subtitle="Describe it in plain words and let the assistant fill the form, or type it yourself.">
              <div className="space-y-3">
                <textarea
                  className={input}
                  rows={2}
                  placeholder='e.g. "25 lunch packets left, please collect within 90 minutes"'
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                />
                <button className={btnGhost} onClick={fillFromAI} disabled={busy === "ai"}>
                  {busy === "ai" ? "Reading your message…" : "Fill form with AI"}
                </button>
                <hr className="border-slate-200" />
                <label className="block text-sm font-medium text-slate-700">
                  Donor
                  <input className={`${input} mt-1`} value={donor} onChange={(e) => setDonor(e.target.value)} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Item
                  <input className={`${input} mt-1`} placeholder="Packed lunches" value={item} onChange={(e) => setItem(e.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Quantity
                    <input className={`${input} mt-1`} type="number" min={1} placeholder="25" value={qty} onChange={(e) => setQty(e.target.value)} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Pickup window (min)
                    <input className={`${input} mt-1`} type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                  </label>
                </div>
                <button className={`${btnPrimary} w-full`} onClick={postLot} disabled={busy === "post"}>
                  {busy === "post" ? "Posting…" : "Post surplus lot"}
                </button>
              </div>
            </Card>

            <div className="space-y-6">
              <Card title="Confirm handover" subtitle="Ask the NGO volunteer for their 4-digit pickup code.">
                {scheduled.length === 0 && <Empty text="No pickups waiting for handover." />}
                <div className="space-y-3">
                  {scheduled.map((pk) => (
                    <div key={pk.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3">
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium text-slate-900">{lotOf(pk.lot_id)?.item}</p>
                        <p className="text-slate-500">{lotOf(pk.lot_id)?.quantity} units</p>
                      </div>
                      <input
                        className={`${input} w-24`}
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="Code"
                        value={otpInput[pk.id] ?? ""}
                        onChange={(e) => setOtpInput({ ...otpInput, [pk.id]: e.target.value })}
                      />
                      <button className={btnPrimary} onClick={() => handover(pk)} disabled={busy === pk.id}>
                        {busy === pk.id ? "Checking…" : "Complete"}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="All lots">
                {lots.length === 0 && <Empty text="No lots yet. Post your first surplus lot." />}
                <ul className="divide-y divide-slate-100">
                  {lots.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {l.quantity} × {l.item}
                        </p>
                        <p className="truncate text-slate-500">{l.donor_name}</p>
                      </div>
                      <Badge status={shownStatus(l)} />
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        )}

        {role === "ngo" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Available surplus" subtitle="Claim a lot before its pickup window closes.">
              <label className="mb-4 block text-sm font-medium text-slate-700">
                Receiving organisation
                <select className={`${input} mt-1`} value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (capacity {r.capacity})
                    </option>
                  ))}
                </select>
              </label>
              {openLots.length === 0 && <Empty text="No open lots right now. Check back soon." />}
              <div className="space-y-3">
                {openLots.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-slate-900">
                        {l.quantity} × {l.item}
                      </p>
                      <p className="text-slate-500">
                        {l.donor_name} · by {new Date(l.pickup_by).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {timeLeft(l)}
                      </p>
                    </div>
                    <button className={btnPrimary} onClick={() => accept(l)} disabled={busy === l.id}>
                      {busy === l.id ? "Claiming…" : "Accept"}
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="My pickups" subtitle="Show this code to the donor when you collect the food.">
              {myPickups.length === 0 && <Empty text="No pickups scheduled for this organisation." />}
              <div className="space-y-3">
                {myPickups.map((pk) => (
                  <div key={pk.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                    <div className="text-sm">
                      <p className="font-medium text-slate-900">{lotOf(pk.lot_id)?.item}</p>
                      <p className="text-slate-500">
                        {lotOf(pk.lot_id)?.quantity} units · {lotOf(pk.lot_id)?.donor_name}
                      </p>
                    </div>
                    <span className="rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-lg font-bold tracking-widest text-white">{pk.otp}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        <p className="pb-4 text-center text-xs text-slate-400">
          FoodLoop does not assess food safety. Donors and recipients are responsible for safe handling and suitability.
        </p>
      </main>
    </div>
  );
}