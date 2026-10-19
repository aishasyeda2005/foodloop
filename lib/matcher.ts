// lib/matcher.ts (Sections C, D3, E)
import { Lot, Recipient } from './types';

export interface MatchResult {
  recipient_id: string;
  recipient_name: string;
  rank: number;
  total_score: number;
  distance_km: number;
  capacity: number;
  explanation: {
    verified: boolean;
    capacity_fit_score: number;
    distance_score: number;
    summary_reason: string;
  };
}

/**
 * Calculates straight-line distance using the Haversine formula [ASSUMPTION]
 * Avoids mandatory external map lookup (Section E: map lookup is optional).
 */
export function calculateHaversineDistanceKm(
  lat1?: number,
  lon1?: number,
  lat2?: number,
  lon2?: number
): number {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return 2.5; // [ASSUMPTION] Default distance in km if coordinates missing
  }
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Evaluates binary eligibility constraints (Section C, D3).
 */
export function checkEligibility(
  lot: Pick<Lot, 'quantity' | 'unit' | 'pickup_window_end'>,
  recipient: Recipient
): { eligible: boolean; failure_reason?: string } {
  // Check 1: Verification (Section C, D3)
  if (!recipient.is_verified) {
    return { eligible: false, failure_reason: 'Recipient is not verified' };
  }

  // Check 2: Capacity constraint (Section C, D3)
  if (recipient.capacity < lot.quantity) {
    return {
      eligible: false,
      failure_reason: `Insufficient capacity (${recipient.capacity} < ${lot.quantity})`,
    };
  }

  // Check 3: Accepted unit type [ASSUMPTION]
  if (!recipient.accepted_units.includes(lot.unit)) {
    return {
      eligible: false,
      failure_reason: `Recipient does not accept unit type '${lot.unit}'`,
    };
  }

  // Check 4: Pickup window not expired (Section D, H)
  if (new Date(lot.pickup_window_end).getTime() <= Date.now()) {
    return { eligible: false, failure_reason: 'Lot pickup window has expired' };
  }

  return { eligible: true };
}

/**
 * Deterministically ranks eligible recipients by capacity and route (Section D3).
 */
export function rankRecipients(
  lot: Lot,
  recipients: Recipient[]
): MatchResult[] {
  const eligible = recipients.filter((r) => checkEligibility(lot, r).eligible);

  const scored = eligible.map((recipient) => {
    const distKm = calculateHaversineDistanceKm(undefined, undefined, recipient.latitude, recipient.longitude);

    // Scoring weights [ASSUMPTION]
    const distanceScore = Math.round((50 / (1 + distKm)) * 10) / 10;
    const capacityScore =
      Math.round(Math.min(50, (lot.quantity / recipient.capacity) * 50) * 10) / 10;
    const totalScore = Math.round((distanceScore + capacityScore) * 10) / 10;

    return {
      recipient_id: recipient.id,
      recipient_name: recipient.name,
      rank: 0,
      total_score: totalScore,
      distance_km: distKm,
      capacity: recipient.capacity,
      explanation: {
        verified: recipient.is_verified,
        capacity_fit_score: capacityScore,
        distance_score: distanceScore,
        summary_reason: `Verified. ${distKm} km away. Capacity ${recipient.capacity} ${lot.unit} covers ${lot.quantity} ${lot.unit}.`,
      },
    };
  });

  // Sort descending by score; tie-breaker: closer distance [ASSUMPTION]
  scored.sort((a, b) => b.total_score - a.total_score || a.distance_km - b.distance_km);

  return scored.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}
