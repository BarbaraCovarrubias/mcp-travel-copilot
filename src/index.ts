import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { db, initDb } from './db.js';
import { calculateOsmRoute } from './services/osmRouting.js';
import { optimizeAttractionsOrder } from './services/routeOptimizer.js';
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
      description: 'Registra traslados o reservas de hoteleria.',
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
      description: 'Ordena de forma optima un circuito de paradas urbanas por distancia minima.',
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
    const rawArgs = (args || {}) as Record<string, any>;
    const res = await db.execute({
      sql: `
        INSERT INTO segments (trip_id, type, origin, destination, start_time, end_time, booking_code, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        String(rawArgs.trip_id),
        String(rawArgs.type),
        rawArgs.origin ? String(rawArgs.origin) : null,
        rawArgs.destination ? String(rawArgs.destination) : null,
        String(rawArgs.start_time),
        String(rawArgs.end_time),
        rawArgs.booking_code ? String(rawArgs.booking_code) : null,
        rawArgs.notes ? String(rawArgs.notes) : null,
      ],
    });
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'success', id: Number(res.lastInsertRowid) }) }] };
  }

  if (name === 'calculate_transit_time') {
    const rawArgs = (args || {}) as Record<string, any>;
    const res = await calculateOsmRoute(String(rawArgs.origin), String(rawArgs.destination), rawArgs.mode as any);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  }

  if (name === 'optimize_attractions_order') {
    const rawArgs = (args || {}) as Record<string, any>;
    const res = await optimizeAttractionsOrder(rawArgs.attractions as string[], rawArgs.mode as any);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  }

  if (name === 'export_itinerary_to_ics') {
    const rawArgs = (args || {}) as Record<string, any>;
    const ics = await generateItineraryICS(String(rawArgs.trip_id));
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
    const segRes = await db.execute('SELECT * FROM segments ORDER BY start_time ASC');
    const expRes = await db.execute('SELECT * FROM expenses');
    return {
      contents: [
        { uri: req.params.uri, mimeType: 'application/json', text: JSON.stringify({ segments: segRes.rows, expenses: expRes.rows }, null, 2) },
      ],
    };
  }
  throw new Error(`Recurso no encontrado: ${req.params.uri}`);
});

async function run() {
  await initDb();
  startCalendarServer({ port: Number(process.env.PORT_CALENDAR) || 3456 });
  startTelegramBot().catch((err) => console.error('[Telegram] Error:', err));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error('Error fatal MCP Server:', err);
  process.exit(1);
});
