// app/api/forecast/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id = parseInt(params.id, 10);
    const forecastRows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT * FROM forecasts WHERE id = ? LIMIT 1', [id]
    );
    if (!forecastRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const dataRows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT day, hour, quarter, operators, ave_calls, ave_talk_time,
              ave_calls_adj, ave_talk_time_adj, ave_agent_adj
       FROM forecast_data WHERE forecast_id = ?
       ORDER BY day ASC, hour ASC, quarter ASC`,
      [id]
    );
    return NextResponse.json({ forecast: forecastRows[0], data: dataRows });
  } catch (err) {
    console.error('GET forecast error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const id   = parseInt(params.id, 10);
    const body = await req.json();

    if (body._method === 'DELETE') {
      const linked = await companyQuery<mysql.RowDataPacket[]>(
        config,
        'SELECT COUNT(*) AS cnt FROM schedules WHERE forecast_id = ? AND archived = 0', [id]
      );
      if ((linked[0]?.cnt ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Cannot delete — forecast is linked to an active schedule.' },
          { status: 409 }
        );
      }
      await companyQuery(config, 'DELETE FROM forecast_data WHERE forecast_id = ?', [id]);
      await companyQuery(config, 'DELETE FROM forecasts WHERE id = ?', [id]);
      return NextResponse.json({ success: true });
    }

    if (body.published !== undefined) {
      await companyQuery(config,
        'UPDATE forecasts SET published = ? WHERE id = ?', [body.published ? 1 : 0, id]
      );
      return NextResponse.json({ success: true });
    }
    if (body.archived !== undefined) {
      await companyQuery(config,
        'UPDATE forecasts SET archived = ? WHERE id = ?', [body.archived ? 1 : 0, id]
      );
      return NextResponse.json({ success: true });
    }
    await companyQuery(config,
      `UPDATE forecasts SET efficiency=?, weeks=?, erlang_c=?,
        service_level=?, target_answer_time=? WHERE id=?`,
      [body.efficiency ?? 100, body.weeks ?? 1, body.erlang_c ? 1 : 0,
       body.service_level ?? 80, body.target_answer_time ?? 20, id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('forecast/[id] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
