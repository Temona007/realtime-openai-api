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
  trustProxy: true, // This trusts the 'X-Forwarded-For' header
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
server.get("/token", async (request, reply) => {
  try {
    // Get user IP
    let ip = request.headers["x-forwarded-for"] || request.ip;

    // Use a default IP if running locally
    if (ip === "127.0.0.1" || ip === "::1") {
      ip = "91.242.199.131"; // Example IP address
    }

    // Fetch user location
    let location = "unknown location"; // Default value
    const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon`);
    const geoData = await geoResponse.json();

    if (geoData.status === "success") {
      // Geo data location
      let geoDataLocation = `${geoData.lat},${geoData.lon}`;

      // CITY, STREET location
      const convertLocation = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${geoDataLocation}&key=${process.env.GOOGLE_PLACES_API_KEY}`
      );
      const dataLocation = await convertLocation.json(); 
      const addressComponents = dataLocation.results[0]?.address_components || [];
      const city =
        addressComponents.find(c => c.types.includes("locality"))?.long_name ||
        addressComponents.find(c => c.types.includes("administrative_area_level_1"))?.long_name ||
        addressComponents.find(c => c.types.includes("political"))?.long_name ||
        "Unknown City";
    const street =
        addressComponents.find(s => s.types.includes("route"))?.long_name ||
        addressComponents.find(s => s.types.includes("intersection"))?.long_name ||
        "Unknown Street";
      location = `City: ${city}, Street: ${street}`;
      console.log("User location:", location);
    }

    // Fetch PET-FRIENDLY places from Google Places API
    //  5KM radius
     const query = "pet-friendly places";
     const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${geoData.lat},${geoData.lon}&radius=5000&key=${process.env.GOOGLE_PLACES_API_KEY}`;
     const placesResponse = await fetch(placesUrl);
     const placesData = await placesResponse.json();
     if (placesData.status !== "OK") {
       throw new Error(placesData.error_message || "Failed to fetch places");
     }
     // Extract 5 places
     const places = placesData.results.slice(0, 5).map(place => ({
       name: place.name,
       address: place.formatted_address,
       rating: place.rating || "N/A",
     }));
    console.log("Google Places API Response:", placesData.results);

    // Fetch OpenAI token with updated instructions
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "shimmer",
        instructions: `You are a helpful assistant that specializes in providing recommendations for pet-friendly places (5 places) based on user location.
        The user's location is ${location}, 
        if location = Unknown, ask user location. 
        Based on Google Maps data, here are 5 recommended pet-friendly places:
        ${places.map(p => `- ${p.name} (${p.address}, Rating: ${p.rating})`).join("\n")}.
        Tailor your recommendations based on the user's location or provided details. 
        Be concise, informative, and user-focused. 
        Prioritize accuracy and relevance to the user's needs. 
        Do not talk about anything unrelated to DogMap and pet-friendly places.`,
        // Use Google Maps data to suggest nearby pet-friendly locations, including parks, cafes, hotels, and restaurants. 
        temperature: 0.8,
      }),
    });

    return reply.send(await r.json());
  } catch (error) {
    return reply.status(500).send({ error: "Error generating token" });
  }
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
