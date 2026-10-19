// app/api/offers/[id]/accept/route.ts (Sections D4, E, H)
import { NextResponse } from 'next/server';
import { workEngineStore } from '@/lib/store';
import { UserRole } from '@/lib/types';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: offerId } = await params;
    const body = await req.json().catch(() => ({}));
    const actorRole: UserRole = (body.role as UserRole) || 'charity_coordinator';

    // Section D4, E, H: Accept offer, schedule pickup, lock lot
    const result = workEngineStore.acceptOffer(
      offerId,
      actorRole,
      body.scheduled_pickup_time
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    let status = 500;

    if (message.includes('Unauthorized')) {
      status = 403;
    } else if (message.includes('expired')) {
      status = 410; // Gone / Expired (Section H)
    } else if (message.includes('Two recipients cannot claim the same lot')) {
      status = 409; // Conflict (Section H)
    } else if (message.includes('Validation') || message.includes('not found')) {
      status = 400;
    }

    return NextResponse.json({ error: message }, { status });
  }
}
