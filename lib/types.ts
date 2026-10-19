// lib/types.ts
// Strict entity definitions corresponding to Section E and Step 2 Data Model

export type UserRole = 'donor_outlet' | 'charity_coordinator' | 'volunteer_dispatcher';

export type LotStatus = 'open' | 'matched' | 'accepted' | 'completed' | 'expired';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type PickupStatus = 'scheduled' | 'completed' | 'cancelled';

export interface Donor {
  id: string;
  name: string;
  role: 'donor_outlet';
  latitude?: number;
  longitude?: number;
  created_at: string;
}

export interface Recipient {
  id: string;
  name: string;
  role: 'charity_coordinator';
  is_verified: boolean;
  capacity: number;
  accepted_units: ('meals' | 'kg')[];
  latitude?: number;
  longitude?: number;
  created_at: string;
}

export interface Eligibility {
  id: string;
  recipient_id: string;
  accepted_unit: 'meals' | 'kg';
  max_capacity: number;
  active: boolean;
}

export interface Lot {
  id: string;
  donor_id: string;
  donor_name: string;
  title: string;
  quantity: number;
  unit: 'meals' | 'kg';
  pickup_window_start: string;
  pickup_window_end: string;
  status: LotStatus;
  created_at: string;
}

export interface Offer {
  id: string;
  lot_id: string;
  recipient_id: string;
  recipient_name: string;
  rank: number;
  distance_km: number;
  status: OfferStatus;
  created_at: string;
}

export interface Pickup {
  id: string;
  lot_id: string;
  offer_id: string;
  recipient_id: string;
  recipient_name: string;
  dispatcher_id?: string;
  scheduled_time: string;
  status: PickupStatus;
  created_at: string;
}

export interface Handover {
  id: string;
  pickup_id: string;
  lot_id: string;
  donor_id: string;
  otp_code: string;
  qr_code_payload: string;
  confirmed_by_donor: boolean;
  verified_quantity?: number;
  verified_unit?: 'meals' | 'kg';
  verified_at?: string;
}

export interface AuditEvent {
  id: string;
  entity_type: 'lot' | 'offer' | 'pickup' | 'handover';
  entity_id: string;
  action: string;
  actor_role: UserRole;
  actor_id?: string;
  payload: Record<string, unknown>;
  created_at: string;
}
