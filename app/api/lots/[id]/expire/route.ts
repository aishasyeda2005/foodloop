// app/api/lots/[id]/expire/route.ts (Section D Exception Branch, Section H)
import { NextResponse } from 'next/server';
import { workEngineStore } from '@/lib/store';
import { UserRole } from '@/lib/types';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lotId } = await params;
    const body = await req.json().catch(() => ({}));
    const actorRole: UserRole = (body.role as UserRole) || 'donor_outlet';

    // Section D Exception Branch: Mark unaccepted lot as expired (never as donated)
    const result = workEngineStore.expireLot(lotId, actorRole);

    return NextResponse.json(
      {
        ...result,
        message: 'Unaccepted food marked expired without claiming it was donated (Section D).',
        food_safety_note:
          'Software does not decide food safety or edibility. Legal suitability remains solely with donor and recipient (Section K, Rule 5).',
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
