import { useEffect, useRef, useState } from "react";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import ToolPanel from "./ToolPanel";

const logo = 'https://www.pfotenpiloten.org/wp-content/uploads/2024/03/Logo-Pfotenpiloten-ohne-Text-1.webp';

export default function App() {
  const [isSessionActive,   setIsSessionActive]   = useState(false);
  const [events,            setEvents]            = useState([]);
  const [dataChannel,       setDataChannel]       = useState(null);
  const [userLocation,      setUserLocation]      = useState(null);
  const [petFriendlyPlaces, setPetFriendlyPlaces] = useState([]);

  const peerConnection = useRef(null);
  const audioElement   = useRef(null);

  async function getCityAndCountry(lat, lon) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}`;
  
    try {
      const response = await fetch(url);
      const data = await response.json();
  
      if (data.results.length > 0) {
        const addressComponents = data.results[0].address_components;
        const city = addressComponents.find((c) => c.types.includes("locality"))?.long_name;
        const country = addressComponents.find((c) => c.types.includes("country"))?.long_name;
  
        return city && country ? `${city}, ${country}` : null;
      } else {
        console.warn("No location found for the coordinates.");
        return null;
      }
    } catch (error) {
      console.error("Error fetching location:", error);
      return null;
    }
  }

  async function startSession() {

    // Get an ephemeral key from the Fastify server
    const tokenResponse = await fetch("/token");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    pc.addTrack(ms.getTracks()[0]);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
    // const model = "gpt-4o-mini-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  }

  // async function startSession() {
  //   let userCoords = null;
  
  //   // Request user location
  //   if (navigator.geolocation) {
  //     try {
  //       userCoords = await new Promise((resolve, reject) => {
  //         navigator.geolocation.getCurrentPosition(
  //           (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
  //           (error) => reject(error)
  //         );
  //       });
  //       setUserLocation(userCoords);
  //       console.log("User location:", userCoords);
  //     } catch (error) {
  //       console.error("Geolocation error:", error.message);
  //       setUserLocation(null);
  //     }
  //   } else {
  //     console.error("Geolocation is not supported by this browser.");
  //     setUserLocation(null);
  //   }
  
  //   // Get an ephemeral key from the Fastify server
  //   const tokenResponse = await fetch("/token");
  //   const data = await tokenResponse.json();
  //   const EPHEMERAL_KEY = data.client_secret.value;
  
  //   // Create a peer connection
  //   const pc = new RTCPeerConnection();
  
  //   // Set up to play remote audio
  //   audioElement.current = document.createElement("audio");
  //   audioElement.current.autoplay = true;
  //   pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);
  
  //   // Add local audio track for microphone input
  //   const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
  //   pc.addTrack(ms.getTracks()[0]);
  
  //   // Set up data channel
  //   const dc = pc.createDataChannel("oai-events");
  //   setDataChannel(dc);
  
  //   // Start the session using SDP
  //   const offer = await pc.createOffer();
  //   await pc.setLocalDescription(offer);
  
  //   const baseUrl = "https://api.openai.com/v1/realtime";
  //   const model = "gpt-4o-realtime-preview-2024-12-17";
  
  //   const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
  //     method: "POST",
  //     body: offer.sdp,
  //     headers: {
  //       Authorization: `Bearer ${EPHEMERAL_KEY}`,
  //       "Content-Type": "application/sdp",
  //     },
  //   });
  
  //   const answer = { type: "answer", sdp: await sdpResponse.text() };
  //   await pc.setRemoteDescription(answer);
  
  //   peerConnection.current = pc;
  
  //   // Ensure data channel is open before sending location
  //   dc.addEventListener("open", async () => {
  //     console.log("Data channel opened. Preparing to send location...");
    
  //     if (userCoords) {
  //       const locationString = await getCityAndCountry(userCoords.latitude, userCoords.longitude);
    
  //       if (locationString) {
  //         console.log("Sending location:", locationString);
    
  //         const locationEvent = {
  //           type: "conversation.item.create",
  //           item: {
  //             type: "message",
  //             role: "user",
  //             content: [
  //               {
  //                 type: "input_text",
  //                 text: `I am currently in ${locationString}.`,
  //               },
  //             ],
  //           },
  //         };
    
  //         sendClientEvent(locationEvent);
  //       } else {
  //         console.warn("Could not determine city and country.");
  //       }
  //     }
  //   });
    
  // }
  
  
  
  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  // Send a message to the model
function sendClientEvent(message) {
  if (dataChannel) {
    message.event_id = message.event_id || crypto.randomUUID();
    console.log("Sending event:", message);  // Debugging log
    dataChannel.send(JSON.stringify(message));
    setEvents((prev) => [message, ...prev]);
  } else {
    console.error("Failed to send message - no data channel available", message);
  }
}

  // Send a text message to the model
  function sendTextMessage(message) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }

    // Attach event listeners to the data channel when a new one is created
    useEffect(() => {
      if (dataChannel) {
        // Append new server events to the list
        dataChannel.addEventListener("message", (e) => {
          setEvents((prev) => [JSON.parse(e.data), ...prev]);
        });
  
        // Set session active when the data channel is opened
        dataChannel.addEventListener("open", () => {
          setIsSessionActive(true);
          setEvents([]);
        });
      }
    }, [dataChannel]);

  // call Google Places API
  async function fetchPetFriendlyPlaces(query) {
    let location = null;
  
    try {
      const locationResponse = await fetch("/location");
      const locationData = await locationResponse.json();
  
      if (locationData.latitude && locationData.longitude) {
        location = `${locationData.latitude},${locationData.longitude}`;
      }
    } catch (error) {
      console.error("Failed to get location from server", error);
    }
  
    try {
      const response = await fetch(`/places?query=${query}&location=${location}`);
      const data = await response.json(); // Store the parsed JSON
      setPetFriendlyPlaces(data); // Set the data once
      return data; // Return the parsed JSON
    } catch (error) {
      console.error("Error fetching pet-friendly places:", error);
      return null;
    }
  }

  // Location
  async function trackUserLocation() {
    try {
      const response = await fetch("/track-location");
      const data = await response.json();
  
      if (data.location) {
        // console.log("User's location:", data.location);
        setUserLocation(data.location);
        console.log("User's location:", userLocation);
        return data.location; // Returns "lat,lon" string
      } else {
        console.warn("Failed to retrieve location from server.");
        return null;
      }
    } catch (error) {
      console.error("Error fetching user location:", error);
      return null;
    }
  }

  useEffect(() => {
    async function fetchLocationAndPlaces() {
      const location = await trackUserLocation();
      
      if (location) {
        await fetchPetFriendlyPlaces('restaurant');
      }
    }
  
    fetchLocationAndPlaces();
  }, []);

  useEffect(() => {
    console.log("Updated User Location:", userLocation);
  }, [userLocation]);
  
  useEffect(() => {
    console.log("Updated Pet Friendly Places:", petFriendlyPlaces);
  }, [petFriendlyPlaces]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <img style={{ width: "24px" }} src={logo} />
          <h1 className="text-lg font-bold">AI DogMap Voice Agent</h1>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="absolute top-0 left-0 right-[380px] bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            {/* <EventLog events={events} /> */}
            <ToolPanel
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
            events={events}
            isSessionActive={isSessionActive}
          />
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>
        <section className="absolute top-0 w-[380px] right-0 bottom-0 p-4 pt-0 overflow-y-auto">
        <EventLog events={events} />
          {/* <ToolPanel
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
            events={events}
            isSessionActive={isSessionActive}
          /> */}
        </section>
      </main>
    </>
  );
}
