// src/app/page.tsx
"use client";
import React, { useState } from "react";

type ApiOk = { image: string; refinedPrompt?: string };
type ApiErr = { error?: string; message?: string; stack?: string };

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [refined, setRefined] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setImage(null);
    setRefined(null);

    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/process", { method: "POST", body: fd });

      // Read body safely whether it's JSON or text
      const raw = await res.text();
      let data: ApiOk & ApiErr;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: raw as any };
      }

      if (!res.ok) {
        // Build a helpful message from whatever we got back
        const msg =
          data?.error ||
          data?.message ||
          (raw?.trim() || `Request failed with status ${res.status}`);
        throw new Error(msg);
      }

      setImage((data as ApiOk).image || null);
      setRefined((data as ApiOk).refinedPrompt || null);
    } catch (err: any) {
      setError(
        (err?.message || "Unexpected error") +
          (err?.stack ? `\n\n${String(err.stack)}` : "")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 780,
        margin: "40px auto",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Lumely.ai Prototype</h1>
      <p style={{ opacity: 0.8 }}>
        Upload a render/room photo and (optionally) a PNG mask. Transparent mask
        areas are editable; opaque areas stay frozen.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Mode:
          <select name="mode" defaultValue="enhance" style={{ marginLeft: 8 }}>
            <option value="enhance">Render Enhancement</option>
            <option value="staging">Virtual Staging</option>
            <option value="design">Design Options</option>
          </select>
        </label>

        <label>
          Photo: <input name="image" type="file" accept="ima
