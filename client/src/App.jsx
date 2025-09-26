// src/App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import MeasurementLanding from "./MeasurementLanding";

export default function App() {
  return (
    <Routes>
      <Route path="/measure" element={<MeasurementLanding />} />
      <Route path="*" element={<div style={{padding:40}}>Open <code>/measure?token=...</code></div>} />
    </Routes>
  );
}
