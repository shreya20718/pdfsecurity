// src/MeasurementCapture.jsx
import React, { useEffect, useRef, useState } from "react";

/*
 Behavior:
 1) Start webcam
 2) "Capture" -> draw video onto canvas and snapshot
 3) User clicks two pupil points on the canvas (left then right)
 4) (Optional) User clicks two reference points or enters known reference width to calibrate mm/pixel
 5) Compute PD in pixels and convert to mm if calibration provided
*/

export default function MeasurementCapture({ onDetected }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [snapshotTaken, setSnapshotTaken] = useState(false);
  const [clickPoints, setClickPoints] = useState([]); // [{x,y}] for pupils
  const [refPoints, setRefPoints] = useState([]); // for calibration
  const [knownRefMm, setKnownRefMm] = useState(""); // mm of reference object (user input)
  const [imgDataUrl, setImgDataUrl] = useState(null);

  // start camera
  useEffect(() => {
    let stream;
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      } catch (err) {
        console.error("Camera error:", err);
        alert("Could not start camera. Check permissions.");
      }
    }
    start();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  function takeSnapshot() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/png");
    setImgDataUrl(dataUrl);
    setSnapshotTaken(true);
    setClickPoints([]);
    setRefPoints([]);
  }

  function onCanvasClick(e) {
    if (!snapshotTaken) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (canvas.height / rect.height));

    // if ctrl/alt pressed -> record calibration ref points
    if (e.shiftKey) {
      setRefPoints(prev => {
        const next = [...prev, { x, y }];
        return next.slice(0, 2); // only two allowed
      });
      return;
    }

    setClickPoints(prev => {
      const next = [...prev, { x, y }];
      return next.slice(0, 2); // only left & right pupils
    });
  }

  function distancePx(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function computeAndSend() {
    if (clickPoints.length < 2) return alert("Mark both pupils (two clicks).");
    const pdPx = distancePx(clickPoints[0], clickPoints[1]);

    let mmPerPx = null;
    let frameWidthMm = null;

    if (refPoints.length === 2 && knownRefMm && !isNaN(Number(knownRefMm))) {
      const refPx = distancePx(refPoints[0], refPoints[1]);
      mmPerPx = Number(knownRefMm) / refPx;
      frameWidthMm = (videoRef.current ? videoRef.current.videoWidth : canvasRef.current.width) * mmPerPx; // example
    }

    const pupillaryDistanceMm = mmPerPx ? +(pdPx * mmPerPx).toFixed(2) : null;

    const out = {
      pupillaryDistancePx: Math.round(pdPx),
      pupillaryDistanceMm: pupillaryDistanceMm,
      frameWidthMm: frameWidthMm,
      leftEye: clickPoints[0],
      rightEye: clickPoints[1],
      imageDataURL: imgDataUrl
    };

    // pass to parent
    if (onDetected) onDetected(out);
  }

  function reset() {
    setSnapshotTaken(false);
    setImgDataUrl(null);
    setClickPoints([]);
    setRefPoints([]);
    setKnownRefMm("");
  }

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div>
        <div style={{ width: 420, height: 320, background: "#000", position: "relative" }}>
          {!snapshotTaken ? (
            <>
              <video ref={videoRef} style={{ width: 420, height: 320, background: "#000" }} muted playsInline />
            </>
          ) : (
            <>
              <canvas ref={canvasRef} style={{ width: 420, height: 320, border: "1px solid #ccc", cursor: "crosshair" }}
                onClick={onCanvasClick} />
            </>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          {!snapshotTaken ? (
            <button onClick={takeSnapshot} style={{ padding: "8px 12px" }}>📷 Capture</button>
          ) : (
            <>
              <button onClick={computeAndSend} style={{ padding: "8px 12px", marginRight: 6 }}>✅ Done (compute)</button>
              <button onClick={reset} style={{ padding: "8px 12px" }}>↺ Retake</button>
            </>
          )}
        </div>

        <p style={{ fontSize: 12, color: "#555" }}>
          How to mark:
          <ul style={{ textAlign: "left", display: "inline-block", marginLeft: 10 }}>
            <li>Click the left pupil then right pupil on the snapshot.</li>
            <li>To set calibration (mm/pixel): hold <strong>Shift</strong> and click two known points on the image, then enter the actual distance (mm) below.</li>
          </ul>
        </p>
      </div>

      <div style={{ minWidth: 300 }}>
        <h4>Marking</h4>
        <div>
          <strong>Pupil clicks:</strong>
          <pre style={{ background: "#f7f7f7", padding: 8 }}>{JSON.stringify(clickPoints, null, 2)}</pre>
        </div>

        <div>
          <strong>Calibration (shift+click two points):</strong>
          <pre style={{ background: "#f7f7f7", padding: 8 }}>{JSON.stringify(refPoints, null, 2)}</pre>
          <label>
            Known distance between ref points (mm):{" "}
            <input value={knownRefMm} onChange={e => setKnownRefMm(e.target.value)} style={{ width: 100 }} />
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <strong>Snapshot preview</strong>
          <div style={{ width: 200, height: 150, border: "1px solid #ddd", marginTop: 6 }}>
            {imgDataUrl ? <img src={imgDataUrl} alt="snapshot" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{padding:20}}>No snapshot</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
