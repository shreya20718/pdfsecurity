// src/MeasurementLanding.jsx
import React, { useState, useEffect } from "react";
import MeasurementCapture from "./MeasurementCapture";

export default function MeasurementLanding() {
  const [token, setToken] = useState(null);
  const [measurement, setMeasurement] = useState(null);
  const [status, setStatus] = useState("");

  // Read token from URL once
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t);
  }, []);

  async function confirmAndSend() {
    if (!measurement) return alert("No measurement to send.");
    if (!token) return alert("Missing token (invalid flow).");

    setStatus("Sending measurement...");

    try {
      // send JSON with token + measurement
      const res = await fetch("/save-measurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...measurement })
      });

      const data = await res.json();
      if (data.success) {
        setStatus("✅ Measurement saved and sent to owner.");
      } else {
        setStatus("❌ Error: " + (data.error || "Unknown"));
      }
    } catch (err) {
      setStatus("❌ Network error: " + err.message);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "30px auto", padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>📏 Take Eye & Frame Measurement</h1>
      {!token && <div style={{color:"red"}}>No token found in URL — open via secure link.</div>}

      <p>
        Use your webcam to capture. The measurement tool below includes a simple click-to-mark pupils method.
        Replace `computeMeasurement` inside <code>MeasurementCapture</code> with your OpenCV/MediaPipe logic if you have it.
      </p>

      <MeasurementCapture onDetected={setMeasurement} />

      {measurement && (
        <div style={{ marginTop: 20, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
          <h3>Preview</h3>
          <p><strong>Pupillary Distance:</strong> {measurement.pupillaryDistanceMm ?? "—"} mm</p>
          <p><strong>Frame Width:</strong> {measurement.frameWidthMm ?? "—"} mm</p>
          <div style={{ marginTop: 10 }}>
            <button onClick={confirmAndSend} style={{ padding: "10px 16px", marginRight: 8 }}>✅ Confirm & Send</button>
            <button onClick={() => setMeasurement(null)} style={{ padding: "10px 12px" }}>↺ Retake</button>
          </div>
          <div style={{marginTop: 12, color: "#333"}}>{status}</div>
        </div>
      )}
    </div>
  );
}
