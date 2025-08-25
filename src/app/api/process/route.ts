// src/app/api/process/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // ~4 MB

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set");
}

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

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image") as File | null;
    const mask = form.get("mask") as File | null;
    const userAdditions = (form.get("prompt")?.toString() ?? "").trim();
    const mode = (form.get("mode")?.toString() ?? "enhance").toLowerCase();
    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

    // ---- Guards
    if (!file) return jsonError("No image uploaded", 400);
    if (file.size === 0) return jsonError("Uploaded file is empty. Please re-upload.", 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError(
        `Your file is ${(file.size / 1024 / 1024).toFixed(2)} MB. This prototype accepts ~4 MB max. Please upload a smaller image or resize it.`,
        400
      );
    }
    if (!["enhance", "staging", "design"].includes(mode)) {
      return jsonError("Invalid mode", 400);
    }

    // ---- 1) Prompt polish with GPT-5 (using Responses API over HTTP)
    const base = BASE_PROMPTS[mode];
    const promptEngineering = `
Combine the BASE INSTRUCTIONS and USER ADDITIONS into a single polished prompt.
Keep geometry, perspective, lighting, and all non-transparent (masked) areas unchanged.
Only modify the transparent mask regions.

BASE:
${base}

USER:
${userAdditions}
`.trim();

    const respRefine = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: promptEngineering,
      }),
    });

    const refineJson = await respRefine.json();
    if (!respRefine.ok) {
      return jsonError(refineJson?.error?.message || "Prompt refinement failed", respRefine.status);
    }
    const refinedPrompt: string = (refineJson?.output_text || "").trim();

    // ---- 2) Images Edit via raw multipart (most reliable on Vercel)
    const fd = new FormData();
    fd.append("model", model);
    fd.append("prompt", refinedPrompt);
    // IMPORTANT: send the original File objects directly so boundary/filename are correct
    fd.append("image", file, file.name || "upload.png");
    if (mask) {
      // Mask must be PNG; if user gives JPG, it usually still works, but PNG is safest.
      fd.append("mask", mask, mask.name || "mask.png");
    }
    fd.append("size", "1024x1024");
    // If you prefer base64 back instead of URL, uncomment the next line:
    // fd.append("response_format", "b64_json");

    const imgResp = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: fd,
    });

    const imgJson = await imgResp.json();
    if (!imgResp.ok) {
      const message = imgJson?.error?.message || "Image edit failed";
      return jsonError(message, imgResp.status);
    }

    // Prefer URL (simpler); switch to b64_json if you set response_format above
    const out = imgJson?.data?.[0];
    const imageUrl: string | undefined = out?.url;
    const b64: string | undefined = out?.b64_json;

    if (!imageUrl && !b64) {
      return jsonError("No image returned from API", 500);
    }

    return new Response(
      JSON.stringify({
        image: imageUrl ? imageUrl : `data:image/png;base64,${b64}`,
        refinedPrompt,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return jsonError(err?.message || "Unexpected error", 500);
  }
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
