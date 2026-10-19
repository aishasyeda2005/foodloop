// lib/handover.ts (Sections C, D5, D6, H, I)

export interface HandoverVerificationResult {
  valid: boolean;
  error?: string;
  verified_quantity?: number;
  chain_of_custody_closed: boolean;
}

/**
 * Generates an authorized proof-of-handover payload (Section C, D5).
 */
export function generateHandoverPayload(pickupId: string, lotId: string): {
  otp: string;
  qrPayload: string;
} {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const qrPayload = `FOODLOOP:v1:HANDOVER:${pickupId}:${lotId}:${otp}`;
  return { otp, qrPayload };
}

/**
 * Validates donor-entered token (OTP or QR payload) against stored handover record.
 * Section D5: Handover must be confirmed by the donor.
 * Section H: Impact counts include ONLY confirmed handovers.
 */
export function verifyHandoverToken(
  storedOtp: string,
  storedQrPayload: string,
  submittedToken: string
): boolean {
  const clean = submittedToken.trim();
  return clean === storedOtp || clean === storedQrPayload;
}
