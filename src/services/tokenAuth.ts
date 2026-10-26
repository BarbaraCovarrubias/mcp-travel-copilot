import { randomBytes } from 'node:crypto';
import { db } from '../db.js';

export async function getOrCreateCalendarToken(tripId: string): Promise<string> {
  const result = await db.execute({
    sql: 'SELECT token FROM calendar_tokens WHERE trip_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1',
    args: [tripId],
  });

  if (result.rows.length > 0) {
    return String(result.rows[0].token);
  }

  const token = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: 'INSERT INTO calendar_tokens (trip_id, token, created_at, revoked) VALUES (?, ?, ?, 0)',
    args: [tripId, token, now],
  });

  return token;
}

export async function validateCalendarToken(tripId: string, token: string): Promise<boolean> {
  if (!token || !tripId) return false;
  const result = await db.execute({
    sql: 'SELECT trip_id FROM calendar_tokens WHERE token = ? AND trip_id = ? AND revoked = 0',
    args: [token, tripId],
  });
  return result.rows.length > 0;
}
