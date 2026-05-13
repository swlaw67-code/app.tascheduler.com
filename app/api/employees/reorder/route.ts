// app/api/employees/reorder/route.ts
// Saves new sort order after drag-to-reorder
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { order } = await req.json() as { order: number[] };
    // order is an array of employee IDs in their new sequence
    for (let i = 0; i < order.length; i++) {
      await companyQuery(config,
        'UPDATE employees SET sort_num = ? WHERE id = ?',
        [i + 1, order[i]]
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Reorder error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
