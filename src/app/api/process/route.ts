// src/app/api/process/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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
    const mask = form.get("mask") as File | null; // optional
    const userAdditions = (form.get("prompt")?.toString() ?? "").trim();
    const mode = (form.get("mode")?.toString() ?? "enhance").toLowerCase();

    if (!file) return new Response(JSON.stringify({ error: "No image uploaded" }), { status: 400 });
    if (!["enhance", "staging", "design"].includes(mode)) return new Response(JSON.stringify({ error: "Invalid mode" }), { status: 400 });

    const base = BASE_PROMPTS[mode];
    const promptEngineering = `
Combine the BASE INSTRUCTIONS and USER ADDITIONS into a single polished prompt.
Keep geometry, perspective, lighting, and all non-transparent (masked) areas unchanged.
Only modify the transparent mask regions.

BASE:
${base}

USER:
${userAdditions}
`;

    // Step 1: Refine prompt with GPT-5
    const refined = await client.responses.create({
      model: "gpt-5",
      input: promptEngineering,
    });
    const refinedPrompt = (refined.output_text || "").trim();

    // Step 2: Call Images API with edit
    const bytes = await file.arrayBuffer();
    const imageFile = new File([bytes], file.name || "upload.png", { type: file.type || "image/png" });

    let maskFile: File | undefined;
    if (mask) {
      const maskBytes = await mask.arrayBuffer();
      maskFile = new File([maskBytes], mask.name || "mask.png", { type: mask.type || "image/png" });
    }

    const edited = await client.images.edit({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      image: imageFile,
      mask: maskFile,
      prompt: refinedPrompt,
      size: "1024x1024",
      response_format: "b64_json",
    });

    const b64 = edited.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");

    return new Response(JSON.stringify({ image: `data:image/png;base64,${b64}`, refinedPrompt }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || "Unexpected error" }), { status: 500 });
  }
}
