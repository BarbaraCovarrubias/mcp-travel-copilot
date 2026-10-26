import { randomUUID } from 'node:crypto';
import { db } from '../db.js';

function formatDateToICS(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export async function generateItineraryICS(tripId: string, calendarTitle?: string): Promise<string> {
  const result = await db.execute({
    sql: 'SELECT * FROM segments WHERE trip_id = ? ORDER BY start_time ASC',
    args: [tripId],
  });

  const segments = result.rows;
  if (segments.length === 0) throw new Error(`No hay tramos registrados para: "${tripId}".`);

  const dtStamp = formatDateToICS(new Date().toISOString());
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID-://Travel Copilot MCP Server//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarTitle || `Viaje ${tripId}`}`,
    'X-WR-TIMEZONE:UTCS',
  ];

  for (const seg of segments) {
    const uid = randomUUID();
    const dtStart = formatDateToICS(String(seg.start_time));
    const dtEnd = formatDateToICS(String(seg.end_time));
    const type = String(seg.type).toUpperCase();
    const origin = seg.origin ? String(seg.origin) : '';
    const destination = seg.destination ? String(seg.destination) : '';
    const title = `[${type}] ${origin} -> ${destination}`;


    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid}`);
    icsLines.push(`DTSTAMP:${dtStamp}`);
    icsLines.push(`TSTART:${dtStart}`);
    icsLines.push(`DTEND:${dtEnd}`);
    icsLines.push(`SUMMARY:${title}`);
    if (seg.notes) icsLines.push(`DESCRIPTION:${seg.notes}`);
    if (seg.destination) icsLines.push(`LOCATION:${seg.destination}`);
    icsLines.push('END:VEVENT');
  }

  icsLines.push('END:VCALENDAR');
  return icsLines.join('\r\n');
}
