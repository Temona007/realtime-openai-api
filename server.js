import Fastify from "fastify";
import FastifyVite from "@fastify/vite";
import fastifyEnv from "@fastify/env";

const server = Fastify({
  logger: {
    transport: {
      target: "@fastify/one-line-logger",
    },
  },
  trustProxy: true,
});

const schema = {
  type: "object",
  required: ["OPENAI_API_KEY"],
  properties: {
    OPENAI_API_KEY: { type: "string" },
  },
};

await server.register(fastifyEnv, { dotenv: true, schema });
await server.register(FastifyVite, {
  root: import.meta.url,
  renderer: "@fastify/react",
});

await server.vite.ready();

// Google Places API
server.get("/places", async (request, reply) => {
  const { query, location } = request.query;
  if (!query || !location) {
    return reply.status(400).send({ error: "Missing query or location" });
  }

  const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${location}&radius=5000&key=${API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      throw new Error(data.error_message || "Failed to fetch places");
    }

    const places = data.results.map((place) => ({
      name: place.name,
      address: place.formatted_address,
      rating: place.rating || "N/A",
    }));

    reply.send({ query, places });
  } catch (error) {
    reply.status(500).send({ error: error.message });
  }
});

// Realtime Token API
server.get("/token", async (request, reply) => {
  try {
    let ip = request.headers["x-forwarded-for"] || request.ip;
    if (ip === "127.0.0.1" || ip === "::1") {
      ip = "91.242.199.131"; 
    }

    let location = "unknown location";
    const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon`);
    const geoData = await geoResponse.json();

    if (geoData.status === "success") {
      let geoDataLocation = `${geoData.lat},${geoData.lon}`;
      const convertLocation = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${geoDataLocation}&key=${process.env.GOOGLE_PLACES_API_KEY}`
      );
      const dataLocation = await convertLocation.json();
      const addressComponents = dataLocation.results[0]?.address_components || [];

      const city =
        addressComponents.find((c) => c.types.includes("locality"))?.long_name ||
        addressComponents.find((c) => c.types.includes("administrative_area_level_1"))?.long_name ||
        "Unknown City";

      const street =
        addressComponents.find((s) => s.types.includes("route"))?.long_name ||
        "Unknown Street";

      location = `City: ${city}, Street: ${street}`;
    }

    const query = "pet-friendly places";
    const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${geoData.lat},${geoData.lon}&radius=5000&key=${process.env.GOOGLE_PLACES_API_KEY}`;
    const placesResponse = await fetch(placesUrl);
    const placesData = await placesResponse.json();

    if (placesData.status !== "OK") {
      throw new Error(placesData.error_message || "Failed to fetch places");
    }

    const places = placesData.results.slice(0, 5).map((place) => ({
      name: place.name,
      address: place.formatted_address,
      rating: place.rating || "N/A",
    }));

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "shimmer",
        instructions: `You are a helpful assistant specializing in pet-friendly place recommendations. User's location: ${location}. Based on Google Maps, here are 5 places:
        ${places.map((p) => `- ${p.name} (${p.address}, Rating: ${p.rating})`).join("\n")}.
        Provide relevant recommendations only.`,
        temperature: 0.8,
      }),
    });

    const tokenData = await r.json();
    reply.send(tokenData);
  } catch (error) {
    reply.status(500).send({ error: "Error generating token" });
  }
});

await server.listen({
  port: process.env.PORT || 4242,
  host: "0.0.0.0",
});
