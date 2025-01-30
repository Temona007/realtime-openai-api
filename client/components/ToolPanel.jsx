import { useEffect, useState } from "react";

// Function to fetch places
const fetchPlaces = async (query, location) => {
  try {
    const response = await fetch(`/places?query=${encodeURIComponent(query)}&location=${location}`);
    const data = await response.json();

    if (response.ok) {
      return data.places || [];
    } else {
      console.error("Error fetching places:", data.error);
      return [];
    }
  } catch (error) {
    console.error("Request failed:", error.message);
    return [];
  }
};

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.warn(`Attempt ${attempt} failed: ${error.message}`);
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * attempt));
    }
  }
}

// Component to display places
function PlacesOutput({ places }) {
  return (
    <div className="flex flex-col gap-4">
      {places.slice(0, 5).map((place, index) => ( // 10 pet friednly places
        <div key={index} className="p-4 border rounded-md bg-gray-50">
          <h3 className="font-bold text-lg">{place.name} <img src="place.icon" alt="" /></h3>
          <p className="text-sm text-gray-700">{place.address}</p>
          <p className="text-sm text-gray-500">
            <b>
              {place.opening_hours?.open_now ? "OPEN" : "CLOSED"}
            </b>
          </p>
          <p className="text-sm text-gray-500">Rating: {place.rating}</p>
        </div>
      ))}
    </div>
  );
}

export default function ToolPanel({ isSessionActive, sendClientEvent, events }) {
  const [places, setPlaces] = useState([]);

  useEffect(() => {
    if (!events || events.length === 0) return;

    const lastEvent = events[0]; // Get the latest event

    if (lastEvent.type === "session.created") {
      sendClientEvent({
        type: "session.update",
        session: {
          tools: [
            {
              type: "function",
              name: "search_places",
              description: "Search for places near a specified location.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Type of place to search." },
                  location: { type: "string", description: "Location to search around (latitude,longitude)." },
                },
                required: ["query", "location"],
              },
            },
          ],
          tool_choice: "auto",
        },
      });
    }

    if (lastEvent.type === "response.done" && lastEvent.response?.output) {
      const output = lastEvent.response.output.find(
        (o) => o.type === "function_call" && o.name === "search_places"
      );

      if (output) {
        const { query, location } = JSON.parse(output.arguments);
        fetchPlaces(query, location).then(setPlaces);
      }
    }
  }, [events, sendClientEvent]);

  return (
    <section className="h-full w-full flex flex-col gap-4">
      <div className="h-full bg-gray-50 rounded-md p-4">
        <h2 className="text-lg font-bold">Places Search Tool</h2>
        {isSessionActive ? (
          places.length > 0 ? (
            <PlacesOutput places={places} />
          ) : (
            <p>Ask for a place to search...</p>
          )
        ) : (
          <p>Start the session to use this tool...</p>
        )}
      </div>
    </section>
  );
}
