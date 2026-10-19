// lib/store.ts
// In-memory Work Engine & Audit Store with Section F sample data (Sections D, E, F, H, I)
import {
  Lot,
  Offer,
  Pickup,
  Handover,
  AuditEvent,
  Recipient,
  Donor,
  UserRole,
} from './types';
import { rankRecipients } from './matcher';
import { assertAuthorized } from './rbac';

// Pre-seeded simulated sample data (Rule 4: All numbers are simulated sample data)
const SAMPLE_DONORS: Donor[] = [
  {
    id: 'donor-1',
    name: 'Campus Cafeteria',
    role: 'donor_outlet',
    latitude: 40.7128,
    longitude: -74.006,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'donor-2',
    name: 'Metro Bakery',
    role: 'donor_outlet',
    latitude: 40.72,
    longitude: -73.99,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
];

const SAMPLE_RECIPIENTS: Recipient[] = [
  {
    id: 'recip-1',
    name: 'Hope Shelter Kitchen',
    role: 'charity_coordinator',
    is_verified: true,
    capacity: 50,
    accepted_units: ['meals', 'kg'],
    latitude: 40.715,
    longitude: -74.002,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 'recip-2',
    name: 'Downtown Community Food Bank',
    role: 'charity_coordinator',
    is_verified: true,
    capacity: 35,
    accepted_units: ['meals', 'kg'],
    latitude: 40.725,
    longitude: -73.995,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 'recip-3',
    name: 'Westside Youth Center',
    role: 'charity_coordinator',
    is_verified: false, // Not verified (Section C, D3: will be filtered out by rules)
    capacity: 60,
    accepted_units: ['meals', 'kg'],
    latitude: 40.73,
    longitude: -74.01,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

// Pre-seeded rows from Section F wireframe
const INITIAL_LOTS: Lot[] = [
  {
    id: 'lot-sample-1',
    donor_id: 'donor-1',
    donor_name: 'Campus Cafeteria',
    title: 'Campus lunches',
    quantity: 25,
    unit: 'meals',
    pickup_window_start: new Date(Date.now() - 1800000).toISOString(),
    pickup_window_end: new Date(Date.now() + 5400000).toISOString(), // ~90 mins (until ~16:30)
    status: 'open',
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'lot-sample-2',
    donor_id: 'donor-2',
    donor_name: 'Metro Bakery',
    title: 'Bakery items',
    quantity: 12,
    unit: 'kg',
    pickup_window_start: new Date(Date.now() - 3600000).toISOString(),
    pickup_window_end: new Date(Date.now() + 10800000).toISOString(), // until 18:00
    status: 'open',
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'lot-sample-3',
    donor_id: 'donor-1',
    donor_name: 'Campus Cafeteria',
    title: 'Packed fruit',
    quantity: 30,
    unit: 'kg',
    pickup_window_start: new Date(Date.now() + 86400000).toISOString(),
    pickup_window_end: new Date(Date.now() + 90000000).toISOString(), // tomorrow
    status: 'open',
    created_at: new Date().toISOString(),
  },
];

class WorkEngineStore {
  private donors: Donor[] = [...SAMPLE_DONORS];
  private recipients: Recipient[] = [...SAMPLE_RECIPIENTS];
  private lots: Lot[] = [...INITIAL_LOTS];
  private offers: Offer[] = [];
  private pickups: Pickup[] = [];
  private handovers: Handover[] = [];
  private auditEvents: AuditEvent[] = [];

  constructor() {
    this.initInitialOffers();
  }

  private initInitialOffers() {
    // Generate initial offers for pre-seeded open lots
    for (const lot of this.lots) {
      const matches = rankRecipients(lot, this.recipients);
      for (const match of matches) {
        this.offers.push({
          id: `offer-${lot.id}-${match.recipient_id}`,
          lot_id: lot.id,
          recipient_id: match.recipient_id,
          recipient_name: match.recipient_name,
          rank: match.rank,
          distance_km: match.distance_km,
          status: 'pending',
          created_at: lot.created_at,
        });
      }
    }
  }

  // --- Audit Logger (Section E) ---
  public logAudit(
    entity_type: AuditEvent['entity_type'],
    entity_id: string,
    action: string,
    actor_role: UserRole,
    payload: Record<string, unknown>
  ): AuditEvent {
    const event: AuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entity_type,
      entity_id,
      action,
      actor_role,
      payload,
      created_at: new Date().toISOString(),
    };
    this.auditEvents.unshift(event);
    return event;
  }

  // --- Queries ---
  public getLots(): Lot[] {
    this.checkAndExpireLots();
    return [...this.lots];
  }

  public getOffers(lotId?: string): Offer[] {
    return lotId ? this.offers.filter((o) => o.lot_id === lotId) : [...this.offers];
  }

  public getPickups(): Pickup[] {
    return [...this.pickups];
  }

  public getHandovers(): Handover[] {
    return [...this.handovers];
  }

  public getAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }

  public getRecipients(): Recipient[] {
    return [...this.recipients];
  }

  public getDonors(): Donor[] {
    return [...this.donors];
  }

  // --- Step 5 API 1: POST /lots (Sections C, D1, D2, E) ---
  public createLot(
    data: {
      donor_id: string;
      title: string;
      quantity: number;
      unit: 'meals' | 'kg';
      pickup_window_start: string;
      pickup_window_end: string;
    },
    actorRole: UserRole
  ): { lot: Lot; offers: Offer[]; audit_event: AuditEvent } {
    assertAuthorized(actorRole, 'lot:create');

    // Section D2: Check required lot information
    if (!data.title?.trim()) {
      throw new Error('Validation failed: Title is required (Section D2).');
    }
    if (!data.quantity || data.quantity <= 0) {
      throw new Error('Validation failed: Quantity must be greater than zero (Section D2).');
    }
    if (data.unit !== 'meals' && data.unit !== 'kg') {
      throw new Error("Validation failed: Unit must be 'meals' or 'kg' (Section D2).");
    }
    const startTime = new Date(data.pickup_window_start).getTime();
    const endTime = new Date(data.pickup_window_end).getTime();
    if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
      throw new Error('Validation failed: Invalid pickup window (Section D1, D2).');
    }
    if (endTime <= Date.now()) {
      throw new Error('Validation failed: Pickup window end must be in the future (Section D1).');
    }

    const donor = this.donors.find((d) => d.id === data.donor_id) || this.donors[0];

    const lot: Lot = {
      id: `lot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      donor_id: donor.id,
      donor_name: donor.name,
      title: data.title.trim(),
      quantity: data.quantity,
      unit: data.unit,
      pickup_window_start: new Date(startTime).toISOString(),
      pickup_window_end: new Date(endTime).toISOString(),
      status: 'open',
      created_at: new Date().toISOString(),
    };

    this.lots.unshift(lot);

    // Section D3: Deterministically rank verified recipients
    const matches = rankRecipients(lot, this.recipients);
    const createdOffers: Offer[] = [];

    for (const match of matches) {
      const offer: Offer = {
        id: `offer-${lot.id}-${match.recipient_id}`,
        lot_id: lot.id,
        recipient_id: match.recipient_id,
        recipient_name: match.recipient_name,
        rank: match.rank,
        distance_km: match.distance_km,
        status: 'pending',
        created_at: lot.created_at,
      };
      this.offers.push(offer);
      createdOffers.push(offer);
    }

    // Section E: Audit event on state change
    const audit_event = this.logAudit('lot', lot.id, 'LOT_CREATED', actorRole, {
      title: lot.title,
      quantity: lot.quantity,
      unit: lot.unit,
      matched_recipients_count: matches.length,
    });

    return { lot, offers: createdOffers, audit_event };
  }

  // --- Step 5 API 2: POST /offers/{id}/accept (Sections D4, E, H) ---
  public acceptOffer(
    offerId: string,
    actorRole: UserRole,
    scheduledPickupTime?: string
  ): { lot: Lot; offer: Offer; pickup: Pickup; handover: Handover; audit_events: AuditEvent[] } {
    assertAuthorized(actorRole, 'offer:accept');

    const offer = this.offers.find((o) => o.id === offerId);
    if (!offer) {
      throw new Error(`Offer not found: ${offerId}`);
    }

    const lot = this.lots.find((l) => l.id === offer.lot_id);
    if (!lot) {
      throw new Error(`Associated lot not found for offer ${offerId}`);
    }

    // Mandatory Failure Test 1 (Section H): An expired lot cannot be accepted
    if (lot.status === 'expired' || new Date(lot.pickup_window_end).getTime() <= Date.now()) {
      lot.status = 'expired';
      offer.status = 'expired';
      this.logAudit('lot', lot.id, 'LOT_ACCEPT_REJECTED_EXPIRED', actorRole, {
        reason: 'Pickup window elapsed',
      });
      throw new Error('Mandatory Rule (Section H): An expired lot cannot be accepted.');
    }

    // Mandatory Failure Test 2 (Section H): Two recipients cannot claim the same lot
    if (lot.status === 'accepted' || lot.status === 'completed') {
      throw new Error('Mandatory Rule (Section H): Two recipients cannot claim the same lot.');
    }

    if (offer.status !== 'pending') {
      throw new Error(`Offer cannot be accepted because its status is '${offer.status}'.`);
    }

    // State changes (Section D4)
    offer.status = 'accepted';
    lot.status = 'accepted';

    // Mark other pending offers for this lot as rejected / superseded
    for (const other of this.offers) {
      if (other.lot_id === lot.id && other.id !== offer.id && other.status === 'pending') {
        other.status = 'rejected';
      }
    }

    // Schedule pickup (Section D4)
    const pickupTime = scheduledPickupTime || lot.pickup_window_end;
    const pickupId = `pickup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pickup: Pickup = {
      id: pickupId,
      lot_id: lot.id,
      offer_id: offer.id,
      recipient_id: offer.recipient_id,
      recipient_name: offer.recipient_name,
      scheduled_time: pickupTime,
      status: 'scheduled',
      created_at: new Date().toISOString(),
    };
    this.pickups.unshift(pickup);

    // Prepare Handover token with 6-digit OTP & QR payload (Section D5)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const handover: Handover = {
      id: `handover-${pickupId}`,
      pickup_id: pickupId,
      lot_id: lot.id,
      donor_id: lot.donor_id,
      otp_code: otp,
      qr_code_payload: `FOODLOOP:HANDOVER:${pickupId}:${lot.id}:${otp}`,
      confirmed_by_donor: false,
    };
    this.handovers.unshift(handover);

    // Section E: Audit events
    const audit1 = this.logAudit('offer', offer.id, 'OFFER_ACCEPTED', actorRole, {
      lot_id: lot.id,
      recipient_id: offer.recipient_id,
    });
    const audit2 = this.logAudit('pickup', pickup.id, 'PICKUP_SCHEDULED', actorRole, {
      scheduled_time: pickup.scheduled_time,
    });

    return { lot, offer, pickup, handover, audit_events: [audit1, audit2] };
  }

  // --- Step 5 API 3: POST /pickups/{id}/handover (Sections C, D5, D6, E, H, I) ---
  public confirmHandover(
    pickupId: string,
    token: string, // OTP or QR payload string (Section D5)
    actorRole: UserRole,
    verifiedQuantity?: number
  ): { handover: Handover; pickup: Pickup; lot: Lot; audit_event: AuditEvent } {
    assertAuthorized(actorRole, 'handover:confirm');

    const pickup = this.pickups.find((p) => p.id === pickupId);
    if (!pickup) {
      throw new Error(`Pickup not found: ${pickupId}`);
    }

    if (pickup.status === 'completed') {
      throw new Error('Pickup handover has already been confirmed.');
    }

    const handover = this.handovers.find((h) => h.pickup_id === pickupId);
    if (!handover) {
      throw new Error(`Handover record not found for pickup: ${pickupId}`);
    }

    // Token verification (Section D5: OTP / QR)
    const trimmed = token.trim();
    const isValidOtp = trimmed === handover.otp_code;
    const isValidQr = trimmed === handover.qr_code_payload;

    if (!isValidOtp && !isValidQr) {
      this.logAudit('handover', handover.id, 'HANDOVER_VERIFICATION_FAILED', actorRole, {
        submitted_token: token,
      });
      throw new Error('Invalid proof-of-handover: OTP or QR code does not match (Section D5).');
    }

    const lot = this.lots.find((l) => l.id === pickup.lot_id);
    if (!lot) {
      throw new Error(`Associated lot not found: ${pickup.lot_id}`);
    }

    const finalVerifiedQty = verifiedQuantity !== undefined && verifiedQuantity > 0 ? verifiedQuantity : lot.quantity;

    // State change: Donor confirms handover (Section D5, D6)
    handover.confirmed_by_donor = true;
    handover.verified_quantity = finalVerifiedQty;
    handover.verified_unit = lot.unit;
    handover.verified_at = new Date().toISOString();

    pickup.status = 'completed';
    lot.status = 'completed'; // Closes donation chain of custody (Section C)

    const audit_event = this.logAudit('handover', handover.id, 'HANDOVER_CONFIRMED', actorRole, {
      pickup_id: pickup.id,
      lot_id: lot.id,
      verified_quantity: finalVerifiedQty,
      unit: lot.unit,
      verified_at: handover.verified_at,
    });

    return { handover, pickup, lot, audit_event };
  }

  // --- Step 8: Expiry & Exceptions (Section D exception branch, H) ---
  public checkAndExpireLots(): void {
    const now = Date.now();
    for (const lot of this.lots) {
      if ((lot.status === 'open' || lot.status === 'matched') && new Date(lot.pickup_window_end).getTime() <= now) {
        lot.status = 'expired';
        // Unaccepted food is marked expired without claiming it was donated (Section D)
        for (const offer of this.offers) {
          if (offer.lot_id === lot.id && offer.status === 'pending') {
            offer.status = 'expired';
          }
        }
        this.logAudit('lot', lot.id, 'LOT_EXPIRED', 'donor_outlet', {
          reason: 'Pickup window elapsed unaccepted',
        });
      }
    }
  }

  public expireLot(
    lotId: string,
    actorRole: UserRole = 'donor_outlet'
  ): { lot: Lot; audit_event: AuditEvent } {
    const lot = this.lots.find((l) => l.id === lotId);
    if (!lot) {
      throw new Error(`Lot not found: ${lotId}`);
    }
    if (lot.status === 'completed' || lot.status === 'accepted') {
      throw new Error(
        `Cannot expire lot with status '${lot.status}'. Only unaccepted lots can be marked expired (Section D).`
      );
    }

    lot.status = 'expired';
    for (const offer of this.offers) {
      if (offer.lot_id === lot.id && offer.status === 'pending') {
        offer.status = 'expired';
      }
    }

    const audit_event = this.logAudit('lot', lot.id, 'LOT_EXPIRED', actorRole, {
      reason: 'Unaccepted food marked expired without claiming it was donated (Section D)',
    });

    return { lot, audit_event };
  }

  // --- Metrics (Section I, H: Impact counts include ONLY confirmed handovers) ---
  public getMetrics() {
    this.checkAndExpireLots();

    // Mandatory Failure Test 3 (Section H): Impact counts include only confirmed handovers
    const confirmedHandovers = this.handovers.filter((h) => h.confirmed_by_donor);

    const lotsSuccessfullyCollected = confirmedHandovers.length;

    // Convert to kg (assume meals average 0.4 kg per meal if specified in meals) [ASSUMPTION]
    const estimatedKgDiverted = confirmedHandovers.reduce((sum, h) => {
      const qty = h.verified_quantity || 0;
      if (h.verified_unit === 'kg') return sum + qty;
      return sum + qty * 0.4; // [ASSUMPTION] 1 meal = 0.4 kg
    }, 0);

    // Median time from listing to acceptance (Section I)
    const acceptanceDeltasMinutes: number[] = [];
    for (const lot of this.lots) {
      if (lot.status === 'accepted' || lot.status === 'completed') {
        const matchingOffer = this.offers.find((o) => o.lot_id === lot.id && o.status === 'accepted');
        if (matchingOffer) {
          const delta = (new Date(matchingOffer.created_at).getTime() - new Date(lot.created_at).getTime()) / 60000;
          acceptanceDeltasMinutes.push(Math.max(1, Math.round(delta)));
        }
      }
    }

    acceptanceDeltasMinutes.sort((a, b) => a - b);
    const medianMinutes =
      acceptanceDeltasMinutes.length === 0
        ? 0
        : acceptanceDeltasMinutes[Math.floor(acceptanceDeltasMinutes.length / 2)];

    return {
      lots_collected: lotsSuccessfullyCollected,
      kg_diverted: Math.round(estimatedKgDiverted * 10) / 10,
      median_acceptance_minutes: medianMinutes,
    };
  }

  // For testing reset
  public resetForTest() {
    this.donors = [...SAMPLE_DONORS];
    this.recipients = [...SAMPLE_RECIPIENTS];
    this.lots = [...INITIAL_LOTS];
    this.offers = [];
    this.pickups = [];
    this.handovers = [];
    this.auditEvents = [];
    this.initInitialOffers();
  }
}

// Global singleton for Next.js dev server persistence
const globalForWorkEngine = global as unknown as { workEngineStore?: WorkEngineStore };
export const workEngineStore = globalForWorkEngine.workEngineStore || new WorkEngineStore();
if (process.env.NODE_ENV !== 'production') globalForWorkEngine.workEngineStore = workEngineStore;
