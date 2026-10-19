// app/api/pickups/[id]/handover/route.ts (Sections D5, E, H, I)
import { NextResponse } from 'next/server';
import { workEngineStore } from '@/lib/store';
import { UserRole } from '@/lib/types';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pickupId } = await params;
    const body = await req.json();
    const actorRole: UserRole = (body.role as UserRole) || 'donor_outlet';

    if (!body.token) {
      return NextResponse.json(
        { error: 'Validation failed: OTP or QR token is required (Section D5).' },
        { status: 400 }
      );
    }

    // Section D5, D6, E: Donor confirms handover with OTP / QR
    const result = workEngineStore.confirmHandover(
      pickupId,
      body.token,
      actorRole,
      body.verified_quantity ? Number(body.verified_quantity) : undefined
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    let status = 500;

    if (message.includes('Unauthorized')) {
      status = 403;
    } else if (message.includes('Invalid proof-of-handover')) {
      status = 401; // Unauthorized token
    } else if (message.includes('not found') || message.includes('already')) {
      status = 400;
    }

    return NextResponse.json({ error: message }, { status });
  }
}
