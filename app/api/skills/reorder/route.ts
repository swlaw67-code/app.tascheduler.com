// app/api/skills/reorder/route.ts
// Swaps POI (sort_order) between two adjacent skills — mirrors MoveUp/MoveDown
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id_a, id_b, poi_a, poi_b } = await req.json() as {
      id_a: number; id_b: number;
      poi_a: number; poi_b: number;
    };

    // Swap the sort_order (POI) values between the two skills
    await companyQuery(config,
      'UPDATE skills SET sort_order = ? WHERE id = ?', [poi_b, id_a]
    );
    await companyQuery(config,
      'UPDATE skills SET sort_order = ? WHERE id = ?', [poi_a, id_b]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Reorder skills error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
