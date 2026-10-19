// app/api/lots/route.ts (Sections D1, D2, E)
import { NextResponse } from 'next/server';
import { workEngineStore } from '@/lib/store';
import { UserRole } from '@/lib/types';

export async function GET() {
  const lots = workEngineStore.getLots();
  const offers = workEngineStore.getOffers();
  const pickups = workEngineStore.getPickups();
  const handovers = workEngineStore.getHandovers();
  const metrics = workEngineStore.getMetrics();
  const audits = workEngineStore.getAuditEvents();
  const recipients = workEngineStore.getRecipients();
  const donors = workEngineStore.getDonors();

  return NextResponse.json({
    lots,
    offers,
    pickups,
    handovers,
    metrics,
    audits,
    recipients,
    donors,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const actorRole: UserRole = (body.role as UserRole) || 'donor_outlet';

    // Section D1, D2, E: Create lot & validate
    const result = workEngineStore.createLot(
      {
        donor_id: body.donor_id || 'donor-1',
        title: body.title,
        quantity: Number(body.quantity),
        unit: body.unit,
        pickup_window_start: body.pickup_window_start || new Date().toISOString(),
        pickup_window_end: body.pickup_window_end,
      },
      actorRole
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const status = message.includes('Unauthorized')
      ? 403
      : message.includes('Validation failed')
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
