"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Lot,
  Offer,
  Pickup,
  Handover,
  Recipient,
  UserRole,
  AuditEvent,
} from "@/lib/types";
import HandoverCard from "@/components/HandoverCard";

export default function CoordinationDeskPage() {
  // Navigation & Role (Section B, F)
  const [activeTab, setActiveTab] = useState<
    "lots" | "matches" | "pickups" | "impact" | "partners"
  >("lots");
  const [role, setRole] = useState<UserRole>("donor_outlet");

  // Server state loaded from Section E API
  const [lots, setLots] = useState<Lot[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [metrics, setMetrics] = useState({
    lots_collected: 0,
    kg_diverted: 0,
    median_acceptance_minutes: 0,
  });

  // Selected state & UI interaction
  const [selectedLotId, setSelectedLotId] = useState<string>("lot-sample-1");
  const [offersApprovedMap, setOffersApprovedMap] = useState<Record<string, boolean>>({
    "lot-sample-1": false,
    "lot-sample-2": true,
    "lot-sample-3": false,
  });
  const [handoverInputOtp, setHandoverInputOtp] = useState<string>("");
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // New lot creation drawer/form
  const [showNewLotModal, setShowNewLotModal] = useState(false);
  const [newTitle, setNewTitle] = useState("25 Packed Meals");
  const [newQty, setNewQty] = useState(25);
  const [newUnit, setNewUnit] = useState<"meals" | "kg">("meals");
  const [newDurationMins, setNewDurationMins] = useState(90);

  // Assistant conversational input (Section F)
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<
    Array<{ sender: "user" | "assistant"; text: string; time: string }>
  >([
    {
      sender: "user",
      text: "25 meals ready at 3 PM from Campus Cafeteria.",
      time: "15:00",
    },
    {
      sender: "assistant",
      text: "Pickup window required. Recommend collection before 4:30 PM (90 mins).",
      time: "15:01",
    },
    {
      sender: "assistant",
      text: "2 verified partners match capacity: Hope Shelter Kitchen (50 cap) & Downtown Food Bank (35 cap).",
      time: "15:02",
    },
  ]);

  // Fetch state from API (Section E)
  const refreshData = useCallback(async () => {
    try {
      const res = await fetch("/api/lots");
      if (!res.ok) throw new Error("Failed to fetch coordination desk state");
      const data = await res.json();
      setLots(data.lots || []);
      setOffers(data.offers || []);
      setPickups(data.pickups || []);
      setHandovers(data.handovers || []);
      setRecipients(data.recipients || []);
      setAudits(data.audits || []);
      setMetrics(
        data.metrics || {
          lots_collected: 0,
          kg_diverted: 0,
          median_acceptance_minutes: 0,
        }
      );
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Helper notification
  const showNotice = (kind: "success" | "error" | "info", msg: string) => {
    setNotice({ kind, msg });
    setTimeout(() => setNotice(null), 6000);
  };

  const selectedLot = lots.find((l) => l.id === selectedLotId) || lots[0];
  const lotOffers = offers.filter((o) => o.lot_id === selectedLot?.id);
  const activePickup = pickups.find((p) => p.lot_id === selectedLot?.id);
  const activeHandover = handovers.find((h) => h.pickup_id === activePickup?.id);

  // Action: Create Surplus Lot (POST /lots, Section D1, D2, E)
  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const now = Date.now();
      const res = await fetch("/api/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          donor_id: "donor-1",
          title: newTitle,
          quantity: Number(newQty),
          unit: newUnit,
          pickup_window_start: new Date(now).toISOString(),
          pickup_window_end: new Date(now + newDurationMins * 60000).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create lot");

      showNotice("success", `Created lot '${data.lot.title}' with ${data.offers.length} eligible partners matched.`);
      setShowNewLotModal(false);
      setSelectedLotId(data.lot.id);
      await refreshData();
    } catch (err: unknown) {
      showNotice("error", err instanceof Error ? err.message : "Error creating lot");
    } finally {
      setLoading(false);
    }
  };

  // Action: Approve & Send Offers (Section F: "Offer to eligible partners")
  const handleApproveOffers = () => {
    if (!selectedLot) return;
    setOffersApprovedMap((prev) => ({ ...prev, [selectedLot.id]: true }));
    setAssistantMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text: `Approved: Offer to eligible partners for ${selectedLot.title}.`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      {
        sender: "assistant",
        text: `Offers dispatched to ${lotOffers.length} eligible partners. Recipient coordinator acceptance pending.`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    showNotice("success", "Offers approved and dispatched to eligible partners (Section F).");
  };

  // Action: Accept Offer (POST /offers/{id}/accept, Section D4, E, H)
  const handleAcceptOffer = async (offerId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/offers/${offerId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to accept offer");

      showNotice("success", `Offer accepted by charity coordinator. Pickup scheduled (Section D4).`);
      setAssistantMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: `Pickup scheduled for ${selectedLot?.title}. Handover OTP: ${data.handover?.otp_code}. Ready for collection.`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      await refreshData();
    } catch (err: unknown) {
      showNotice("error", err instanceof Error ? err.message : "Error accepting offer");
    } finally {
      setLoading(false);
    }
  };

  // Action: Confirm Handover (POST /pickups/{id}/handover, Section D5, E, H, I)
  const handleConfirmHandover = async (
    pickupId: string,
    token: string,
    verifiedQuantity: number
  ) => {
    if (!token?.trim()) {
      showNotice("error", "Please enter the 6-digit OTP or QR code to confirm handover.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/pickups/${pickupId}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          token: token.trim(),
          verified_quantity: verifiedQuantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm handover");

      showNotice(
        "success",
        `Handover confirmed! Chain of custody closed. Verified ${data.handover.verified_quantity} ${data.handover.verified_unit} (Section D5, D6).`
      );
      setHandoverInputOtp("");
      setAssistantMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: `Handover verified and signed. Quantity recorded into impact ledger. Donation closed.`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      await refreshData();
    } catch (err: unknown) {
      showNotice("error", err instanceof Error ? err.message : "Error confirming handover");
    } finally {
      setLoading(false);
    }
  };

  // Action: Mark Unaccepted Lot Expired (Section D Exception Branch, Section H)
  const handleExpireLot = async (lotId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lots/${lotId}/expire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to expire lot");

      showNotice("info", "Unaccepted lot marked expired without claiming it was donated (Section D).");
      setAssistantMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: `Exception triggered: Lot marked expired (unaccepted). Not counted as donated. Food safety judgement belongs to donor and recipient.`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      await refreshData();
    } catch (err: unknown) {
      showNotice("error", err instanceof Error ? err.message : "Error expiring lot");
    } finally {
      setLoading(false);
    }
  };

  // Quick NLP Assistant simulation (Section F)
  const handleSendAssistant = async () => {
    if (!assistantInput.trim()) return;
    const msg = assistantInput.trim();
    setAssistantInput("");
    setAssistantMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text: msg,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    // Use Gemini parser route if available
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg }),
      });
      if (res.ok) {
        const parsed = await res.json();
        setNewTitle(parsed.item || "Surplus Meals");
        setNewQty(parsed.quantity || 25);
        setNewDurationMins(parsed.minutes || 90);
        setShowNewLotModal(true);
        setAssistantMessages((prev) => [
          ...prev,
          {
            sender: "assistant",
            text: `Extracted: ${parsed.quantity} of ${parsed.item}, deadline in ${parsed.minutes} mins. Form populated for donor confirmation.`,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        return;
      }
    } catch {
      // Fallback
    }

    setAssistantMessages((prev) => [
      ...prev,
      {
        sender: "assistant",
        text: `Parsed lot request. Please review required lot info in the coordination desk before dispatch.`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  // Calculated counts
  const lotsOpenCount = lots.filter((l) => l.status === "open" || l.status === "matched").length;
  const acceptedTodayCount = lots.filter((l) => l.status === "accepted").length;
  const handoversCount = handovers.filter((h) => h.confirmed_by_donor).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100 font-sans">
      {/* Toast Notice */}
      {notice && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-xl border ${
            notice.kind === "success"
              ? "bg-emerald-950 border-emerald-600 text-emerald-200"
              : notice.kind === "error"
              ? "bg-rose-950 border-rose-600 text-rose-200"
              : "bg-sky-950 border-sky-600 text-sky-200"
          }`}
        >
          <span className="font-semibold uppercase tracking-wider text-xs">
            {notice.kind === "success" ? "✓" : notice.kind === "error" ? "✕" : "ℹ"}
          </span>
          <span>{notice.msg}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. LEFT SIDEBAR (Role-based Navigation, Section F)       */}
      {/* ======================================================== */}
      <aside className="w-64 flex-shrink-0 flex flex-col justify-between border-r border-slate-800 bg-slate-950 p-4">
        <div>
          {/* App Branding */}
          <div className="flex items-center gap-2.5 px-2 py-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-lg">
              FL
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white leading-none">
                FoodLoop
              </h1>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-400">
                Dispatch Desk
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {[
              { id: "lots", label: "Surplus Lots", icon: "📦" },
              { id: "matches", label: "Matches", icon: "⚡" },
              { id: "pickups", label: "Pickups", icon: "🚚" },
              { id: "impact", label: "Impact", icon: "🌱" },
              { id: "partners", label: "Partners", icon: "🤝" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Food Safety & Human Control Notice (Section K, Rule 5) */}
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-900/80 border border-amber-500/30 p-2.5 text-[11px] text-amber-300/90 leading-relaxed">
            <strong className="block text-amber-400 uppercase tracking-wider text-[10px] mb-0.5">
              ⚠ Food Safety Boundary (Sec. K)
            </strong>
            Software does not judge food safety or edibility. Legal suitability remains solely with donor and recipient.
          </div>

          {/* Bottom: Demo Account Switcher (Section F) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Demo Account (Sec. F)
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <select
              value={role}
              onChange={(e) => {
                const r = e.target.value as UserRole;
                setRole(r);
                showNotice("info", `Switched active demo role to '${r}'.`);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="donor_outlet">Donor Outlet (Cafeteria)</option>
              <option value="charity_coordinator">Charity Coordinator (NGO)</option>
              <option value="volunteer_dispatcher">Volunteer Dispatcher</option>
            </select>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. CENTER PANEL: Donation Coordination Desk (Section F)  */}
      {/* ======================================================== */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-900 overflow-y-auto">
        {/* Header Bar */}
        <header className="flex items-center justify-between border-b border-slate-800 px-8 py-4 bg-slate-900/90 backdrop-blur sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Donation Coordination Desk
              </h2>
              {/* Simulated Data Disclaimer (Rule 4) */}
              <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                Simulated Sample Data (Rule 4)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Time-window surplus matching & verified chain-of-custody dispatch
            </p>
          </div>

          {/* Quick Create Lot Button (Visible for donor_outlet) */}
          {role === "donor_outlet" && (
            <button
              onClick={() => setShowNewLotModal(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 transition"
            >
              <span>+</span>
              <span>Post Surplus Lot (Sec. D1)</span>
            </button>
          )}
        </header>

        <div className="p-8 space-y-6">
          {/* Three Counters (Section F: Lots open, Accepted today, Handovers) */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Lots Open
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">{lotsOpenCount}</span>
                <span className="text-xs text-slate-500">active surplus lots</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Accepted Today
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-amber-400">{acceptedTodayCount}</span>
                <span className="text-xs text-slate-500">pickup scheduled</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Handovers
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-400">{handoversCount}</span>
                <span className="text-xs text-slate-500">verified closed</span>
              </div>
            </div>
          </div>

          {/* Work Queue Table with Section F exact sample rows */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3 bg-slate-900/60">
              <h3 className="text-sm font-semibold text-white tracking-wide">
                Work Queue (Section F Sample Rows)
              </h3>
              <span className="text-xs text-slate-400">Click a row to inspect task view</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-900/40 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-5">Surplus Lot</th>
                  <th className="py-3 px-4">Quantity</th>
                  <th className="py-3 px-4">Pickup Window</th>
                  <th className="py-3 px-4">Recipients Matched</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {lots.map((lot) => {
                  const isSelected = lot.id === selectedLot?.id;
                  const matchedOffers = offers.filter((o) => o.lot_id === lot.id);
                  const isApproved = offersApprovedMap[lot.id] || false;

                  return (
                    <tr
                      key={lot.id}
                      onClick={() => setSelectedLotId(lot.id)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? "bg-emerald-950/30 text-white"
                          : "hover:bg-slate-900/60 text-slate-300"
                      }`}
                    >
                      <td className="py-3 px-5 font-semibold">
                        <div className="flex items-center gap-2">
                          {isSelected && <span className="text-emerald-400">▶</span>}
                          <span>{lot.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{lot.donor_name}</span>
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-slate-200">
                        {lot.quantity} {lot.unit}
                      </td>

                      <td className="py-3 px-4 text-slate-400">
                        {lot.title === "Campus lunches"
                          ? "until 16:30"
                          : lot.title === "Bakery items"
                          ? "until 18:00"
                          : lot.title === "Packed fruit"
                          ? "tomorrow"
                          : new Date(lot.pickup_window_end).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                      </td>

                      <td className="py-3 px-4">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                          {matchedOffers.length > 0 ? `${matchedOffers.length} recipients` : "pending"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${
                            lot.status === "open"
                              ? "bg-sky-950 border-sky-600 text-sky-400"
                              : lot.status === "accepted"
                              ? "bg-amber-950 border-amber-600 text-amber-400"
                              : lot.status === "completed"
                              ? "bg-emerald-950 border-emerald-600 text-emerald-400"
                              : "bg-slate-800 border-slate-700 text-slate-500"
                          }`}
                        >
                          {lot.status}
                        </span>
                      </td>

                      <td className="py-3 px-5 text-right">
                        {lot.status === "open" && !isApproved && (
                          <span className="text-[10px] text-amber-400 font-semibold">
                            Needs Review
                          </span>
                        )}
                        {lot.status === "open" && isApproved && (
                          <span className="text-[10px] text-emerald-400 font-semibold">
                            Offered
                          </span>
                        )}
                        {lot.status === "accepted" && (
                          <span className="text-[10px] text-amber-400 font-semibold">
                            Pickup Scheduled
                          </span>
                        )}
                        {lot.status === "completed" && (
                          <span className="text-[10px] text-emerald-400 font-semibold">
                            Closed
                          </span>
                        )}
                        {lot.status === "expired" && (
                          <span className="text-[10px] text-slate-500 font-semibold">
                            Expired
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Secondary Details View (Matches, Pickups, Impact, Audits) */}
          <div className="grid grid-cols-2 gap-4">
            {/* Impact Metric Cards (Section I) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Impact Ledger (Section I)
                </h4>
                <span className="text-[10px] text-slate-500">Confirmed Handovers Only</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-900 rounded-lg p-2.5">
                  <span className="block text-xl font-black text-emerald-400">
                    {metrics.lots_collected}
                  </span>
                  <span className="text-[10px] text-slate-400">Lots Collected</span>
                </div>
                <div className="bg-slate-900 rounded-lg p-2.5">
                  <span className="block text-xl font-black text-emerald-400">
                    {metrics.kg_diverted} kg
                  </span>
                  <span className="text-[10px] text-slate-400">Kg Diverted</span>
                </div>
                <div className="bg-slate-900 rounded-lg p-2.5">
                  <span className="block text-xl font-black text-emerald-400">
                    {metrics.median_acceptance_minutes}m
                  </span>
                  <span className="text-[10px] text-slate-400">Median Accept Time</span>
                </div>
              </div>
            </div>

            {/* Audit Trail Timeline (Section E) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Event Audit Stream (Section E)
                </h4>
                <span className="text-[10px] text-slate-500">Immutable Ledger</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 text-[11px]">
                {audits.slice(0, 5).map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center justify-between bg-slate-900 px-2 py-1.5 rounded border border-slate-800"
                  >
                    <div>
                      <span className="font-mono text-emerald-400 font-semibold mr-2">
                        {evt.action}
                      </span>
                      <span className="text-slate-400">by {evt.actor_role}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {new Date(evt.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ======================================================== */}
      {/* 3. RIGHT PANEL: Assistant / Task View (Section F)        */}
      {/* ======================================================== */}
      <aside className="w-96 flex-shrink-0 flex flex-col justify-between border-l border-slate-800 bg-slate-950 p-4 overflow-y-auto">
        <div className="space-y-4">
          {/* Header */}
          <div className="border-b border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold tracking-tight text-white">
                Assistant / Task View (Sec. F)
              </h3>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                Active Task
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Target: <strong className="text-white">{selectedLot?.title}</strong> ({selectedLot?.quantity} {selectedLot?.unit})
            </p>
          </div>

          {/* Conversational Stream (Section F wireframe messages) */}
          <div className="space-y-2 rounded-xl bg-slate-900 border border-slate-800 p-3 max-h-48 overflow-y-auto text-xs">
            {assistantMessages.map((msg, i) => (
              <div
                key={i}
                className={`p-2 rounded-lg leading-relaxed ${
                  msg.sender === "assistant"
                    ? "bg-slate-950 border border-slate-800 text-slate-200"
                    : "bg-emerald-950/60 border border-emerald-600/30 text-emerald-200 ml-4"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                  <span className="font-semibold uppercase tracking-wider">
                    {msg.sender === "assistant" ? "🤖 Task Assistant" : "👤 Dispatcher"}
                  </span>
                  <span>{msg.time}</span>
                </div>
                <p>{msg.text}</p>
              </div>
            ))}
          </div>

          {/* Ranked Eligible Partners Breakdown (Section D3) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
              <span>Matched Verified Partners (Sec. D3)</span>
              <span className="text-[10px] text-slate-500">{lotOffers.length} eligible</span>
            </div>

            {lotOffers.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2 text-center">
                No eligible partners match capacity & window.
              </p>
            ) : (
              <div className="space-y-1.5">
                {lotOffers.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between rounded bg-slate-950 p-2 border border-slate-800 text-xs"
                  >
                    <div>
                      <div className="font-medium text-slate-200 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>{o.recipient_name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Rank #{o.rank} • {o.distance_km} km away
                      </span>
                    </div>

                    {/* Role-based action on offer */}
                    <div>
                      {role === "charity_coordinator" && o.status === "pending" && (
                        <button
                          onClick={() => handleAcceptOffer(o.id)}
                          disabled={loading || selectedLot?.status !== "open"}
                          className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                        >
                          Accept (Sec. D4)
                        </button>
                      )}
                      {o.status === "accepted" && (
                        <span className="rounded bg-emerald-950 border border-emerald-600 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          Accepted
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CRITICAL: Explicit Review Action Button (Section F) */}
          {/* "The user must approve before any offer is sent." */}
          {selectedLot && selectedLot.status === "open" && !offersApprovedMap[selectedLot.id] && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 space-y-2">
              <div className="text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Donor Authorization Required (Sec. F)</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-normal">
                Review ranked capacity and time window before making this surplus lot visible to partner charities.
              </p>
              <button
                onClick={handleApproveOffers}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-900/50 hover:bg-emerald-500 transition"
              >
                Offer to eligible partners (Section F)
              </button>
            </div>
          )}

          {/* Exception Branch: Unaccepted food marked expired (Section D Exception, Section H) */}
          {selectedLot && (selectedLot.status === "open" || selectedLot.status === "matched") && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Exception Branch (Sec. D)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Unaccepted</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                If pickup window elapses without acceptance, lot is marked expired without claiming it was donated.
              </p>
              <button
                onClick={() => handleExpireLot(selectedLot.id)}
                disabled={loading}
                className="w-full rounded-lg border border-rose-900/50 bg-rose-950/30 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/50 transition"
              >
                Simulate Window Expiry (Sec. D)
              </button>
            </div>
          )}

          {/* Handover Proof Step (Section D5: OTP / QR verification) */}
          {activePickup && selectedLot && (
            <HandoverCard
              pickup={activePickup}
              handover={activeHandover}
              lot={selectedLot}
              role={role}
              onConfirm={handleConfirmHandover}
              loading={loading}
            />
          )}
        </div>

        {/* Bottom NLP Assistant Message Sender */}
        <div className="pt-3 border-t border-slate-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={assistantInput}
              onChange={(e) => setAssistantInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendAssistant()}
              placeholder="e.g. 25 meals ready at 3 PM..."
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              onClick={handleSendAssistant}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              Send
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 4. MODAL: Enter Surplus Lot (Section D1, D2)              */}
      {/* ======================================================== */}
      {showNewLotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                Post Surplus Lot (Section D1)
              </h3>
              <button
                onClick={() => setShowNewLotModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLot} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Lot Title / Food Description</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Campus lunches"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Unit</label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value as "meals" | "kg")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="meals">meals</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Pickup Window (Minutes from now)</label>
                <input
                  type="number"
                  min={15}
                  max={1440}
                  required
                  value={newDurationMins}
                  onChange={(e) => setNewDurationMins(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Example: 90 minutes corresponds to 25 meals collection window (Section C story).
                </span>
              </div>

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-[10px] text-amber-300">
                By posting, you certify food handling safety. Platform verifies recipient capacity and time window (Section C, K).
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewLotModal(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loading ? "Checking..." : "Submit Lot & Rank (Sec. D2)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}