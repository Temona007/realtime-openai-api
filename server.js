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
      instructions: "You are a helpful assistant that specializes in providing recommendations for pet-friendly places based on user location (ask user), talk quickly.  Use information from www.pfotenpiloten.org,  www.assistancedogfoundation.org , www.stiftungassistenzhund.org, map-app.pfotenpiloten.org/up, and Google Places and from database json file (focus on this file show all data) to suggest nearby pet-friendly locations, including parks, cafes, hotels, and restaurants. Tailor your recommendations based on the user's location or provided details. Be concise, informative, and user-focused. Prioritize accuracy and relevance to the user's needs.",
      temperature: 0.8,
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
