import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { db } from './db.js';
import { calculateOsmRoute } from './services/osmRouting.js';
import { optimizeAttractionsOrdew } from './services/routeOptimizer.js';
import { generateItineraryICS } from './services/icsExporter.js';
import { startCalendarServer } from './services/calendarServer.js';
import { startTelegramBot } from './telegramBot.js';

const server = new Server(
  { name: 'mcp-travel-copilot', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'add_itinerary_segment',
      description: 'Registra traslados o reservas de hotelería.',
      inputSchema: {
        type: 'object',
        properties: {
          trip_id: { type: 'string' },
          type: { type: 'string', enum: ['flight', 'train', 'bus', 'lodging', 'activity'] },
          origin: { type: 'string' },
          destination: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          booking_code: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['trip_id', 'type', 'start_time', 'end_time'],
      },
    },
    {
      name: 'calculate_transit_time',
      description: 'Calcula distancia y tiempo de viaje real con OpenStreetMap y OSRM.',
      inputSchema: {
        type: 'object',
        properties: {
          origin: { type: 'string' },
          destination: { type: 'string' },
          mode: { type: 'string', enum: ['driving', 'foot', 'bike'] },
        },
        required: ['origin', 'destination'],
      },
    },
    {
      name: 'optimize_attractions_order',
      description: 'Ordena de forma óptima un circuito de paradas urbanas por distancia mínima.',
      inputSchema: {
        type: 'object',
        properties: {
          attractions: { type: 'array', items: { type: 'string' } },
          mode: { type: 'string', enum: ['driving', 'foot', 'bike'] },
        },
        required: ['attractions'],
      },
    },
    {
      name: 'export_itinerary_to_ics',
      description: 'Genera el archivo iCalendar (.ics) de un viaje.',
      inputSchema: {
        type: 'object',
        properties: { trip_id: { type: 'string' } },
        required: ['trip_id'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'add_itinerary_segment') {
    const stmt = db.prepare(`
      INSERT INTO segments (trip_id, type, origin, destination, start_time, end_time, booking_code, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      args!.trip_id,
      args!.type,
      args!.origin || null,
      args!.destination || null,
      args!.start_time,
      args!.end_time,
      args!.booking_code || null,
      args!.notes || null
    );
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'success', id: info.lastInsertRowid }) }] };
  }

  if (name === 'calculate_transit_time') {
    const res = await calculateOsmRoute(String(args!.origin), String(args!.destination), args!.mode as any);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  }

  if (name === 'optimize_attractions_order') {
    const res = await optimizeAttractionsOrder(args!.attractions as string[], args!.mode as any);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  }

  if (name === 'export_itinerary_to_ics') {
    const ics = generateItineraryICS(String(args!.trip_id));
    return { content: [{ type: 'text', text: ics }] };
  }

  throw new Error(`Herramienta no encontrada: ${name}`);
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: 'trip://itinerary/current', name: 'Itinerario Actual', mimeType: 'application/json' },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  if (req.params.uri === 'trip://itinerary/current') {
    const segments = db.prepare('SELECT * FROM segments ORDER BY start_time ASC').all();
    const expenses = db.prepare('SELECT * FROM expenses').all();
    return { contents: [{ uri: req.params.uri, mimeType: 'application/json', text: JSON.stringify({ segments, expenses }, null, 2) }] };
  }
  throw new Error(`Recurso no encontrado: ${req.params.uri}`);
});

async function run() {
  startCalendarServer({ port: Number(process.env.PORT_CALENDAR) || 3456 });
  startTelegramBot().catch((err) => console.error('[Telegram] Error:', err));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error('Error fatal MCO Server:', err);
  process.exit(1);
});
