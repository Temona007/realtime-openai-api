import Fastify from "fastify";
import FastifyVite from "@fastify/vite";
import fastifyEnv from "@fastify/env";

// Fastify + React + Vite configuration
const server = Fastify({
  logger: {
    transport: {
      target: "@fastify/one-line-logger",
    },
  },
});

const schema = {
  type: "object",
  required: ["OPENAI_API_KEY"],
  properties: {
    OPENAI_API_KEY: {
      type: "string",
    },
  },
};

await server.register(fastifyEnv, { dotenv: true, schema });

await server.register(FastifyVite, {
  root: import.meta.url,
  renderer: "@fastify/react",
});

await server.vite.ready();

// Connect Google Maps API
server.get("/places", async (request, reply) => {
  const { query, location } = request.query;

  if (!query || !location) {
    return reply.status(400).send({ error: "Missing query or location" });
  }

  const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${location}&radius=5000&key=${process.env.GOOGLE_PLACES_API_KEY}`;

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

    console.log("Google Places API Response:", data.results);

    reply.send({ query, places });
  } catch (error) {
    reply.status(500).send({ error: error.message });
  }
});


// Server-side API route to return an ephemeral realtime session token
server.get("/token", async () => {
  const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions: "You are a helpful assistant that specializes in providing recommendations for pet-friendly places (5 places) based on user location (ask user), talk quickly.  Use information from www.pfotenpiloten.org,  www.assistancedogfoundation.org , www.stiftungassistenzhund.org, map-app.pfotenpiloten.org/up, and Google Places and from database json file (focus on this file show all data) to suggest nearby pet-friendly locations, including parks, cafes, hotels, and restaurants. Tailor your recommendations based on the user's location or provided details. Be concise, informative, and user-focused. Prioritize accuracy and relevance to the user's needs. Dosn't talk thing unrelated DogMap and pet friednly places",
      temperature: 0.8,

      // tools: [
      //   {
      //     type: "function",
      //     name: "get_pet_friendly_locations",
      //     description: "Find pet-friendly places using Google Places API.",
      //     parameters: {
      //       type: "object",
      //       properties: {
      //         query: { type: "string", description: "Type of place (e.g., pet-friendly cafes)" },
      //         location: { type: "string", description: "User's location (latitude,longitude)" }
      //       },
      //       required: ["query", "location"]
      //     }
      //   }
      // ]

    }),
  });

  return new Response(r.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
});

await server.listen({ 
  port: process.env.PORT || 4242, 
  host: '0.0.0.0'  // Bind to all network interfaces
});
