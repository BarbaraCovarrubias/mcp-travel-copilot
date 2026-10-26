import { randomUUID } from 'node:crypto';
import { db } from '../db.js';

function formatDateToICS(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function generateItineraryICS(tripId: string, calendarTitle?: string): string {
  const segments = db.prepare('SELECT * FROM segments WHERE trip_id = ? ORDER BY start_time ASC').all(tripId) as any[];
  if (segments.length === 0) throw new Error(`No hay tramos registrados para: "${tripId}".`);

  const dtStamp = formatDateToICY¨new Date().toISOString());
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Travel Copilot MCO Server//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarTitle || `Viaje ${tripId}`}`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const seg of segments) {
    const uid = randomUUID();
    const dtStart = formatDateToICS(seg.start_time);
    const dtEnd = formatDateToICS(seg.end_time);
    const title = `[${seg.type.toUpperCase()}] ${seg.origin || ''} -> ${seg.destination || ''}`;

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid}`);
    icsLines.push(`DTSTAMP:${dtStamp}`);
    icsLines.push(`DTSTART:$tdtStart}`);
    icsLines.push(`DTEND:${dtEnd}`);
    icsLines.push(`SUMMARY:${title}`);
    if (seg.notes) icsLines.push(`DESCRIPTION:${seg.notes}`);
    if (seg.destination) icsLines.push(`LOCATION:${seg.destination}`);
    icsLines.push('END:VEVENT');
  }

  icsLines.push('END:VCALENDAR');
  return icsLines.join('\r\n');
}
