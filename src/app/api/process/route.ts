// src/app/api/process/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // ~4 MB
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

const BASE_PROMPTS: Record<string, string> = {
  enhance: `Render this screenshot as if it were an ultra-realistic photograph.
Stay true to the original image in terms of structure, geometry, materials, and camera angle.
Have a bright and clear image like a high-quality photograph.
The image should be in the same format as attached.
Do not change any shapes or forms in the image — keep everything the EXACT same!`,

  staging: `Render this screenshot as if it were an ultra-realistic photograph.
Stay true to the original image in terms of structure, geometry, materials, and camera angle.
Keep everything EXACT the same unless explicitly staged.
Add tasteful, photorealistic furniture only in the transparent mask areas.
Maintain bright, clear photographic quality.`,

  design: `Render this screenshot as if it were an ultra-realistic photograph.
Stay true to the original image in terms of structure, geometry, and camera angle.
Keep everything EXACT the same except in the transparent mask areas,
where you apply the requested design or material changes.
Ensure the result looks like a high-quality professional photo.`
};

// Extract text from the Responses API no matter the shape
function extractOutputText(r: any): string {
  if (!r) return "";
  if (typeof r.output_text === "string") return r.output_text;
  // responses output shape
  if (Array.isArray(r.output)) {
    for (const item of r.output) {
      const c = item?.content;
      if (Array.isArray(c)) {
        const textPart = c.find((p: any) => p?.type?.includes("text") && typeof p.text === "string");
        if (textPart?.text) return textPart.text;
      }
    }
  }
  // chat/completions-like shape (rare via /responses, but just in case)
  const maybe = r?.choices?.[0]?.message?.content;
  if (typeof maybe === "string") return maybe;
  if (Array.isArray(maybe)) {
    const tp = maybe.find((p: any) => p?.type?.includes("text") && typeof p.text === "string");
    if (tp?.text) return tp.text;
  }
  return "";
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image") as File | null;
    const mask = form.get("mask") as File | null;
    const userAdditions = (form.get("prompt")?.toString() ?? "").trim();
    const mode = (form.get("mode")?.toString() ?? "enhance").toLowerCase();

    // Guards
    if (!OPENAI_API_KEY) return jsonError("Server missing OPENAI_API_KEY", 500);
    if (!file) return jsonError("No image uploaded", 400);
    if (file.size === 0) return jsonError("Uploaded file is empty. Please re-upload.", 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError(
        `Your file is ${(file.size / 1024 / 1024).toFixed(2)} MB. This prototype accepts ~4 MB max. Please upload a smaller image or resize it.`,
        400
      );
    }
    if (!["enhance", "staging", "design"].includes(mode)) return jsonError("Invalid mode", 400);

    // 1) Build & polish prompt
    const base = BASE_PROMPTS[mode];
    const combined = `TASK:
${base}

USER ADDITIONS:
${userAdditions || "(none)"}

HARD RULES:
- Do not modify non-transparent (masked/locked) regions.
- Preserve structure, geometry, camera, and materials.
- Apply changes ONLY in transparent mask regions (if a mask is supplied).
`;

    // Try GPT-5 polish; fall back to combined if anything goes wrong or empty
    let refinedPrompt = combined;
    try {
      const refineResp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model: "gpt-5", input: combined })
      });
      const refineJson = await refineResp.json();
      if (refineResp.ok) {
        const out = extractOutputText(refineJson).trim();
        if (out) refinedPrompt = out;
      } else {
        // keep fallback
        console.warn("Prompt polish failed:", refineJson?.error?.message || refineResp.statusText);
      }
    } catch (e) {
      console.warn("Prompt polish exception:", (e as any)?.message);
    }

    // Final safety: Images API requires a non-empty 'prompt'
    if (!refinedPrompt || !refinedPrompt.trim()) refinedPrompt = combined;

    // 2) Images Edit via raw multipart
    const fd = new FormData();
    fd.append("model", IMAGE_MODEL);
    fd.append("prompt", refinedPrompt);
    fd.append("size", "1024x1024");
    // send original File objects to preserve filename & headers
    fd.append("image", file, file.name || "upload.png");
    if (mask) fd.append("mask", mask, mask.name || "mask.png");

    const imgResp = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: fd
    });

    const imgJson = await imgResp.json();
    if (!imgResp.ok) {
      return jsonError(imgJson?.error?.message || "Image edit failed", imgResp.status);
    }

    const out = imgJson?.data?.[0];
    const imageUrl: string | undefined = out?.url;
    const b64: string | undefined = out?.b64_json;

    if (!imageUrl && !b64) return jsonError("No image returned from API", 500);

    return new Response(
      JSON.stringify({
        image: imageUrl ? imageUrl : `data:image/png;base64,${b64}`,
        refinedPrompt
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return jsonError(err?.message || "Unexpected error", 500);
  }
}
