// tests/mandatory_rules.test.ts
// Automated tests for Section H Mandatory Failure Tests and Section C/D 25-Meals Story
import test from 'node:test';
import assert from 'node:assert/strict';
import { workEngineStore } from '../lib/store';

test.beforeEach(() => {
  workEngineStore.resetForTest();
});

// ============================================================================
// MANDATORY FAILURE TEST 1 (Section H): An expired lot cannot be accepted
// ============================================================================
test('Mandatory Failure Test 1: An expired lot cannot be accepted (Section H)', () => {
  // 1. Create a lot with an already elapsed pickup window (in the past)
  const now = Date.now();
  const pastStart = new Date(now - 7200000).toISOString();
  const pastEnd = new Date(now - 3600000).toISOString(); // Expired 1 hour ago

  // Setup: Create open lot and forcefully simulate expiration
  const { lot, offers } = workEngineStore.createLot(
    {
      donor_id: 'donor-1',
      title: 'Expired Past Sandwiches',
      quantity: 15,
      unit: 'meals',
      pickup_window_start: new Date(now).toISOString(),
      pickup_window_end: new Date(now + 1800000).toISOString(),
    },
    'donor_outlet'
  );

  assert.ok(offers.length > 0, 'Should have matched eligible recipients');
  const targetOffer = offers[0];

  // Manually mark lot as expired (pickup window elapsed, Section D)
  workEngineStore.expireLot(lot.id, 'donor_outlet');

  const refreshedLot = workEngineStore.getLots().find((l) => l.id === lot.id);
  assert.equal(refreshedLot?.status, 'expired', 'Lot status must be expired');

  // Attempt: Charity coordinator attempts to accept an expired lot
  assert.throws(
    () => {
      workEngineStore.acceptOffer(targetOffer.id, 'charity_coordinator');
    },
    (err: Error) => {
      return (
        err.message.includes('Mandatory Rule (Section H)') &&
        err.message.includes('expired')
      );
    },
    'Must throw error rejecting acceptance of expired lot (Section H)'
  );

  // Invariant check: Impact metric must remain 0
  const metrics = workEngineStore.getMetrics();
  assert.equal(
    metrics.lots_collected,
    0,
    'Expired lot must never be counted as collected/donated (Section D, H)'
  );
});

// ============================================================================
// MANDATORY FAILURE TEST 2 (Section H): Two recipients cannot claim the same lot
// ============================================================================
test('Mandatory Failure Test 2: Two recipients cannot claim the same lot (Section H)', () => {
  const now = Date.now();
  // Create lot with capacity that matches multiple recipients
  const { lot, offers } = workEngineStore.createLot(
    {
      donor_id: 'donor-1',
      title: 'Campus Hot Tray Dinners',
      quantity: 20,
      unit: 'meals',
      pickup_window_start: new Date(now).toISOString(),
      pickup_window_end: new Date(now + 7200000).toISOString(), // 2 hours
    },
    'donor_outlet'
  );

  // Ensure there are at least two distinct offers generated
  assert.ok(
    offers.length >= 2,
    `Need at least 2 matched offers to test collision, got ${offers.length}`
  );

  const [firstOffer, secondOffer] = offers;
  assert.notEqual(firstOffer.recipient_id, secondOffer.recipient_id);

  // Recipient 1 accepts first offer (Section D4)
  const acceptResult = workEngineStore.acceptOffer(
    firstOffer.id,
    'charity_coordinator'
  );
  assert.equal(acceptResult.lot.status, 'accepted');
  assert.equal(acceptResult.offer.status, 'accepted');
  assert.equal(acceptResult.pickup.status, 'scheduled');

  // Recipient 2 attempts to claim the same lot via secondOffer
  assert.throws(
    () => {
      workEngineStore.acceptOffer(secondOffer.id, 'charity_coordinator');
    },
    (err: Error) => {
      return (
        err.message.includes('Mandatory Rule (Section H)') &&
        err.message.includes('Two recipients cannot claim the same lot')
      );
    },
    'Must reject second recipient claiming already accepted lot (Section H)'
  );

  // Verify only 1 pickup exists for this lot
  const pickupsForLot = workEngineStore
    .getPickups()
    .filter((p) => p.lot_id === lot.id);
  assert.equal(pickupsForLot.length, 1, 'Only one pickup can be scheduled per lot');
});

// ============================================================================
// MANDATORY FAILURE TEST 3 (Section H): Impact counts include only confirmed handovers
// ============================================================================
test('Mandatory Failure Test 3: Impact counts include ONLY confirmed handovers (Section H)', () => {
  const now = Date.now();
  const { lot, offers } = workEngineStore.createLot(
    {
      donor_id: 'donor-1',
      title: 'Bakery Surplus Loaves',
      quantity: 50,
      unit: 'kg',
      pickup_window_start: new Date(now).toISOString(),
      pickup_window_end: new Date(now + 3600000).toISOString(),
    },
    'donor_outlet'
  );

  const offer = offers[0];

  // Stage A: Recipient accepts and pickup is scheduled (unconfirmed handover)
  const { pickup, handover } = workEngineStore.acceptOffer(
    offer.id,
    'charity_coordinator'
  );
  assert.equal(pickup.status, 'scheduled');
  assert.equal(handover.confirmed_by_donor, false);

  // Invariant assertion: Scheduled pickup MUST NOT be counted in impact
  const initialMetrics = workEngineStore.getMetrics();
  assert.equal(
    initialMetrics.lots_collected,
    0,
    'Unconfirmed scheduled pickup cannot be counted in lots_collected (Section H)'
  );
  assert.equal(
    initialMetrics.kg_diverted,
    0,
    'Unconfirmed scheduled pickup cannot be counted in kg_diverted (Section H)'
  );

  // Stage B: Donor confirms handover with valid OTP (Section D5)
  const confirmResult = workEngineStore.confirmHandover(
    pickup.id,
    handover.otp_code,
    'donor_outlet',
    50
  );
  assert.equal(confirmResult.handover.confirmed_by_donor, true);
  assert.equal(confirmResult.lot.status, 'completed');

  // Invariant assertion: Only NOW does the quantity accrue to metrics
  const finalizedMetrics = workEngineStore.getMetrics();
  assert.equal(
    finalizedMetrics.lots_collected,
    1,
    'Confirmed handover must count in lots_collected (Section H, I)'
  );
  assert.equal(
    finalizedMetrics.kg_diverted,
    50,
    'Confirmed handover must accrue verified quantity to kg_diverted (Section H, I)'
  );
});

// ============================================================================
// END-TO-END STORY: 25 Meals / 90 Minutes Story (Section C, D)
// "A cafeteria lists 25 packed meals for collection within 90 minutes;
//  an eligible partner accepts, a pickup is scheduled, and a QR handover closes the donation."
// ============================================================================
test('End-to-End Story: 25 meals listed for collection within 90 mins (Sections C, D)', () => {
  const now = Date.now();
  const ninetyMinsLater = new Date(now + 90 * 60000).toISOString();

  // Step 1: Donor enters surplus lot and pickup window (Section D1)
  // Step 2: Platform checks required lot information (Section D2)
  const lotCreation = workEngineStore.createLot(
    {
      donor_id: 'donor-1',
      title: 'Cafeteria Packed Meals',
      quantity: 25,
      unit: 'meals',
      pickup_window_start: new Date(now).toISOString(),
      pickup_window_end: ninetyMinsLater,
    },
    'donor_outlet'
  );

  const { lot, offers, audit_event: createAudit } = lotCreation;
  assert.equal(lot.title, 'Cafeteria Packed Meals');
  assert.equal(lot.quantity, 25);
  assert.equal(lot.unit, 'meals');
  assert.equal(lot.status, 'open');
  assert.equal(createAudit.action, 'LOT_CREATED');

  // Step 3: Rank verified recipients by capacity and route (Section D3)
  assert.ok(offers.length > 0, 'Must rank at least one eligible partner');
  // Check deterministic ranking: top rank must be 1
  assert.equal(offers[0].rank, 1, 'Top candidate must have rank 1');
  const chosenOffer = offers[0];

  // Step 4: Recipient accepts and pickup is scheduled (Section D4)
  const acceptance = workEngineStore.acceptOffer(
    chosenOffer.id,
    'charity_coordinator'
  );
  assert.equal(acceptance.lot.status, 'accepted');
  assert.equal(acceptance.offer.status, 'accepted');
  assert.equal(acceptance.pickup.status, 'scheduled');
  assert.ok(acceptance.handover.otp_code.length === 6, 'Generates 6-digit OTP');
  assert.ok(
    acceptance.handover.qr_code_payload.includes('FOODLOOP'),
    'Generates QR payload'
  );

  // Step 5: Donor confirms handover with OTP / QR (Section D5)
  // Donor enters the QR payload presented by recipient
  const handoverResult = workEngineStore.confirmHandover(
    acceptance.pickup.id,
    acceptance.handover.qr_code_payload,
    'donor_outlet',
    25
  );

  assert.equal(
    handoverResult.handover.confirmed_by_donor,
    true,
    'Handover must be confirmed by donor (Section D5)'
  );
  assert.equal(
    handoverResult.lot.status,
    'completed',
    'Donation chain of custody closed (Section C)'
  );
  assert.equal(
    handoverResult.pickup.status,
    'completed',
    'Pickup marked completed'
  );

  // Step 6: Dashboard records verified quantity and status (Section D6, I)
  const metrics = workEngineStore.getMetrics();
  assert.equal(metrics.lots_collected, 1, 'Records 1 lot collected');
  // 25 meals * 0.4 kg/meal = 10.0 kg diverted
  assert.equal(metrics.kg_diverted, 10.0, 'Records 10 kg diverted');

  // Verify Audit Log Event Stream (Section E)
  const auditEvents = workEngineStore.getAuditEvents();
  const eventActions = auditEvents.map((e) => e.action);
  assert.ok(eventActions.includes('LOT_CREATED'), 'Audit log contains LOT_CREATED');
  assert.ok(eventActions.includes('OFFER_ACCEPTED'), 'Audit log contains OFFER_ACCEPTED');
  assert.ok(eventActions.includes('PICKUP_SCHEDULED'), 'Audit log contains PICKUP_SCHEDULED');
  assert.ok(eventActions.includes('HANDOVER_CONFIRMED'), 'Audit log contains HANDOVER_CONFIRMED');
});
