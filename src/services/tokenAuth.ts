import { randomBytes } from 'node:crypto';
import { db } from '../db.js';

export function getOrCreateCalendarToken(tripId: string): string {
  const existing = db.prepare(`
    SELECT token FROM calendar_tokens 
    WHERE trip_id = ? AND revoked = 0 
    ORDER BY created_at DESC LIMIT 1
  `).get(tripId) as { token: string } | undefined;

  if (existing) return existing.token;

  const token = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO calendar_tokens (trip_id, token, created_at, revoked)
    VALUES (?, ?, ?, 0)
  `).run(tripId, token, now);

  return token;
}

export function validateCalendarToken(tripId: string, token: string): boolean {
  if (!token || !tripId) return false;
  const record = db.prepare(`
    SELECT trip_id FROM calendar_tokens 
    WHERE token = ? AND trip_id = ? AND revoked = 0
  `).get(token, tripId);
  return Boolean(record);
}

export function revokeCalendarToken(token: string): boolean {
  const result = db.prepare('UPDATE calendar_tokens SET revoked = 1 WHERE token = ?').run(token);
  return result.changes > 0;
}
