// app/api/forecast/data/route.ts
// Bulk upsert forecast data — called when user edits the forecast grid
// Handles individual cell edits and batch imports from call data
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

interface DataSlot {
  forecast_id:        number;
  day:                number;
  hour:               number;
  quarter:            number;
  ave_calls?:         number;
  ave_talk_time?:     number;
  ave_calls_adj?:     number;
  ave_talk_time_adj?: number;
  ave_agent_adj?:     number;
  operators?:         string;
}

// PUT — upsert one or many slots
export async function PUT(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const slots: DataSlot[] = Array.isArray(body) ? body : [body];

    for (const slot of slots) {
      // Check if slot exists
      const existing = await companyQuery<mysql.RowDataPacket[]>(
        config,
        `SELECT id FROM forecast_data
         WHERE forecast_id=? AND day=? AND hour=? AND quarter=? LIMIT 1`,
        [slot.forecast_id, slot.day, slot.hour, slot.quarter]
      );

      if (existing.length > 0) {
        // Build dynamic UPDATE only for provided fields
        const updates: string[] = [];
        const values:  unknown[] = [];

        if (slot.ave_calls         !== undefined) { updates.push('ave_calls = ?');         values.push(slot.ave_calls); }
        if (slot.ave_talk_time     !== undefined) { updates.push('ave_talk_time = ?');     values.push(slot.ave_talk_time); }
        if (slot.ave_calls_adj     !== undefined) { updates.push('ave_calls_adj = ?');     values.push(slot.ave_calls_adj); }
        if (slot.ave_talk_time_adj !== undefined) { updates.push('ave_talk_time_adj = ?'); values.push(slot.ave_talk_time_adj); }
        if (slot.ave_agent_adj     !== undefined) { updates.push('ave_agent_adj = ?');     values.push(slot.ave_agent_adj); }
        if (slot.operators         !== undefined) { updates.push('operators = ?');         values.push(slot.operators); }

        if (updates.length > 0) {
          values.push(slot.forecast_id, slot.day, slot.hour, slot.quarter);
          await companyQuery(config,
            `UPDATE forecast_data SET ${updates.join(', ')}
             WHERE forecast_id=? AND day=? AND hour=? AND quarter=?`,
            values
          );
        }
      } else {
        // Insert
        await companyQuery(config,
          `INSERT INTO forecast_data
             (forecast_id, day, hour, quarter, operators,
              ave_calls, ave_talk_time, ave_calls_adj, ave_talk_time_adj, ave_agent_adj)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            slot.forecast_id, slot.day, slot.hour, slot.quarter,
            slot.operators         ?? null,
            slot.ave_calls         ?? 0,
            slot.ave_talk_time     ?? 0,
            slot.ave_calls_adj     ?? 0,
            slot.ave_talk_time_adj ?? 0,
            slot.ave_agent_adj     ?? 0,
          ]
        );
      }
    }

    return NextResponse.json({ success: true, updated: slots.length });
  } catch (err) {
    console.error('PUT forecast data error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
