// components/HandoverCard.tsx (Sections C, D5, D6, H, I)
"use client";

import React, { useState } from "react";
import { Handover, Pickup, Lot, UserRole } from "@/lib/types";

interface HandoverCardProps {
  pickup: Pickup;
  handover?: Handover;
  lot: Lot;
  role: UserRole;
  onConfirm: (pickupId: string, token: string, verifiedQuantity: number) => Promise<void>;
  loading: boolean;
}

export default function HandoverCard({
  pickup,
  handover,
  lot,
  role,
  onConfirm,
  loading,
}: HandoverCardProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [verifiedQty, setVerifiedQty] = useState(lot.quantity);
  const [activeMode, setActiveMode] = useState<"otp" | "qr">("otp");

  if (pickup.status === "completed") {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
          <span className="flex items-center gap-1.5">
            <span>✓</span>
            <span>Chain of Custody Closed (Section C, D5)</span>
          </span>
          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px]">
            Verified
          </span>
        </div>
        <p className="text-xs text-slate-300">
          Handover confirmed by donor. Quantity recorded:{" "}
          <strong className="text-white font-mono">
            {handover?.verified_quantity ?? lot.quantity} {lot.unit}
          </strong>.
        </p>
        <span className="text-[10px] text-slate-500 block">
          Timestamp: {handover?.verified_at ? new Date(handover.verified_at).toLocaleTimeString() : "Confirmed"}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-slate-900 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Proof of Handover (Section D5)
          </span>
          <span className="block text-[10px] text-slate-400">
            Time-window logistics & authorized pickup confirmation
          </span>
        </div>
        <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
          Scheduled
        </span>
      </div>

      {/* Recipient / Dispatcher View: Display OTP and QR Code */}
      {(role === "charity_coordinator" || role === "volunteer_dispatcher") && (
        <div className="space-y-3">
          <div className="flex gap-2 border-b border-slate-800 pb-1">
            <button
              onClick={() => setActiveMode("otp")}
              className={`px-3 py-1 text-xs font-semibold rounded ${
                activeMode === "otp"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Numeric OTP
            </button>
            <button
              onClick={() => setActiveMode("qr")}
              className={`px-3 py-1 text-xs font-semibold rounded ${
                activeMode === "qr"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              QR Code
            </button>
          </div>

          {activeMode === "otp" ? (
            <div className="rounded-lg bg-slate-950 p-4 text-center border border-slate-800 space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                Present this OTP to Donor Outlet:
              </span>
              <span className="font-mono text-3xl font-black text-amber-400 tracking-widest block py-1">
                {handover?.otp_code || "------"}
              </span>
              <span className="text-[10px] text-slate-500 block">
                Valid for lot: {lot.title} ({lot.quantity} {lot.unit})
              </span>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-950 p-3 text-center border border-slate-800 space-y-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                Scan at Donor Outlet:
              </span>
              {/* Visual SVG QR Representation */}
              <div className="flex justify-center py-1">
                <svg
                  className="h-28 w-28 bg-white p-2 rounded shadow"
                  viewBox="0 0 100 100"
                  fill="black"
                >
                  {/* Outer corner boxes */}
                  <rect x="5" y="5" width="26" height="26" fill="black" />
                  <rect x="9" y="9" width="18" height="18" fill="white" />
                  <rect x="13" y="13" width="10" height="10" fill="black" />

                  <rect x="69" y="5" width="26" height="26" fill="black" />
                  <rect x="73" y="9" width="18" height="18" fill="white" />
                  <rect x="77" y="13" width="10" height="10" fill="black" />

                  <rect x="5" y="69" width="26" height="26" fill="black" />
                  <rect x="9" y="73" width="18" height="18" fill="white" />
                  <rect x="13" y="77" width="10" height="10" fill="black" />

                  {/* Inner simulated data modules */}
                  <rect x="36" y="8" width="6" height="6" />
                  <rect x="46" y="14" width="6" height="6" />
                  <rect x="56" y="8" width="6" height="6" />
                  <rect x="36" y="38" width="8" height="8" />
                  <rect x="48" y="48" width="8" height="8" />
                  <rect x="60" y="38" width="8" height="8" />
                  <rect x="76" y="52" width="6" height="6" />
                  <rect x="40" y="68" width="8" height="8" />
                  <rect x="56" y="76" width="6" height="6" />
                  <rect x="70" y="70" width="8" height="8" />
                </svg>
              </div>
              <span className="text-[9px] font-mono text-slate-500 break-all block">
                {handover?.qr_code_payload}
              </span>
            </div>
          )}

          <div className="text-[11px] text-slate-400 bg-slate-950 p-2 rounded border border-slate-800">
            Charity / Dispatcher presents code upon physical arrival. Donor must confirm to finalize handover (Section D5).
          </div>
        </div>
      )}

      {/* Donor Outlet View: Enter OTP / QR & Confirm */}
      {role === "donor_outlet" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-300 font-medium block">
              Enter Recipient OTP or QR Payload:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={handover?.otp_code ? `e.g. ${handover.otp_code}` : "6-digit OTP"}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white text-center tracking-widest focus:border-emerald-500 focus:outline-none"
              />
              {/* One-click test helper button */}
              {handover?.otp_code && (
                <button
                  type="button"
                  onClick={() => setTokenInput(handover.otp_code)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
                  title="Autofill OTP for testing"
                >
                  Paste OTP
                </button>
              )}
            </div>
          </div>

          {/* Verified Quantity Confirmation (Section D6, I) */}
          <div className="space-y-1">
            <label className="text-xs text-slate-300 font-medium block">
              Verified Quantity Handed Over ({lot.unit}):
            </label>
            <input
              type="number"
              min={1}
              value={verifiedQty}
              onChange={(e) => setVerifiedQty(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-500 block">
              Impact counts will only include this verified quantity once confirmed (Section H, I).
            </span>
          </div>

          <button
            onClick={() => onConfirm(pickup.id, tokenInput, verifiedQty)}
            disabled={loading || !tokenInput.trim()}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-900/50 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition"
          >
            {loading ? "Verifying..." : "Confirm Handover & Seal Chain of Custody (Sec. D5)"}
          </button>
        </div>
      )}

      {/* Invariant Note (Section H) */}
      <div className="rounded bg-slate-950/80 p-2 text-[10px] text-slate-400 border border-slate-800">
        <strong className="text-slate-300">Mandatory Rule (Section H):</strong> Impact counts and diverted kilograms include only confirmed handovers. Unconfirmed lots do not accrue impact.
      </div>
    </div>
  );
}
