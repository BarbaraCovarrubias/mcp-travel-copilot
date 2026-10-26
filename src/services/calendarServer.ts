import http from "node:http";
import { generateItineraryICS } from "./icsExporter.js";
import { validateCalendarToken } from "./tokenAuth.js";

let serverInstance: http.Server | null = null;

export function startCalendarServer(config: { port?: number; host?: string } = {}): http.Server {
  const port = config.port || 3456;
  const host = config.host || "0.0.0.0";

  if (serverInstance) return serverInstance;

  serverInstance = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const match = url.pathname.match(/^\/calendar\/([a-zA-Z0-9_-]+)(?:\.ics)?$/);

    if (req.method === "GET" && match) {
      const tripId = match[1];
      let token = url.searchParams.get("token");
      const authHeader = req.headers["authorization"];
      if (!token && authHeader?.startsWith("Bearer ")) token = authHeader.substring(7).trim();

      const isValid = await validateCalendarToken(tripId, token || "");
      if (!token || !isValid) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No autorizado" }));
        return;
      }

      try {
        const icsData = await generateItineraryICS(tripId);
        res.writeHead(200, {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `inline; filename="${tripId}.ics"`,
          "Access-Control-Allow-Origin": "*",
        });
        res.end(icsData);
        return;
      } catch (error: any) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
        return;
      }
    }

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Ruta no encontrada" }));
  });

  serverInstance.listen(port, host, () => {
    console.error(`[Webcal Server] Escuchando en http://${host}:${port}`);
  });

  serverInstance.unref();
  return serverInstance;
}
