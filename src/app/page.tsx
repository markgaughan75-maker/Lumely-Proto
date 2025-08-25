// src/app/page.tsx
"use client";
import React, { useState } from "react";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // ~4MB (Vercel body limit)

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [refined, setRefined] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setImage(null); setRefined(null);

    const fd = new FormData(e.currentTarget);

    // client-side size check
    const file = fd.get("image") as File | null;
    if (!file) { setBusy(false); setError("Please choose an image."); return; }
    if (file.size > MAX_UPLOAD_BYTES) {
      setBusy(false);
      setError(`Your file is ${(file.size/1024/1024).toFixed(2)} MB. The current limit is ~4 MB on this prototype. Please upload a smaller image (or resize to ~1024–1792px).`);
      return;
    }

    try {
      const res = await fetch("/api/process", { method: "POST", body: fd });
      const raw = await res.text();
      let data: any; try { data = JSON.parse(raw); } catch { data = { error: raw }; }
      if (!res.ok) throw new Error(data?.error || data?.message || raw?.trim() || `Request failed (${res.status})`);
      setImage(data?.image ?? null);
      setRefined(data?.refinedPrompt ?? null);
    } catch (err: any) {
      setError(err?.message || "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 780, margin: "40px auto", padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Lumely.ai Prototype</h1>
      <p style={{ opacity: 0.8 }}>
        Upload a render/room photo and (optionally) a PNG mask. Transparent mask areas are editable; opaque areas stay frozen.
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

        <label>Photo: <input name="image" type="file" accept="image/*" required /></label>
        <label>Mask (optional): <input name="mask" type="file" accept="image/png,image/*" /></label>
        <label>Extra Instructions: <textarea name="prompt" rows={3} placeholder="e.g., black window frames; add landscaping; light oak floors" /></label>

        <button disabled={busy} style={{ padding: "10px 14px", borderRadius: 8 }}>
          {busy ? "Processing…" : "Generate"}
        </button>
      </form>

      {busy && <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>Working…</div>}
      {error && <pre style={{ marginTop: 16, color: "#b00020", background: "#fff5f5", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>{error}</pre>}
      {refined && (
        <div style={{ marginTop: 16, background: "#fafafa", padding: 12, borderRadius: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Polished prompt used:</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{refined}</div>
        </div>
      )}
      {image && (
        <div style={{ marginTop: 16 }}>
          <img src={image} alt="Result" style={{ width: "100%", borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,.12)" }} />
          <a href={image} download="lumely-result.png" style={{ display: "inline-block", marginTop: 12 }}>Download result</a>
        </div>
      )}
    </main>
  );
}
