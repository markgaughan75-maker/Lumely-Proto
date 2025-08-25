# Lumely.ai Prototype (Preservation-first)

A minimal Next.js app to test your upload → prompt polish (GPT-5) → image **edits** (GPT-Image-1) flow with optional **mask** support for maximum preservation.

## Quick Start

1) Clone or unzip this folder.
2) `npm install`
3) Copy `.env.local.example` to `.env.local` and fill in your `OPENAI_API_KEY`.
4) `npm run dev` and open http://localhost:3000

## Deploy to Vercel

1) Push this folder to a GitHub repo.
2) In Vercel → New Project → Import the repo.
3) Add Environment Variables:
   - `OPENAI_API_KEY`
   - `OPENAI_IMAGE_MODEL` (optional: `gpt-image-1` recommended)
4) Deploy.

## Notes

- This uses **Images Edits** endpoint with an optional PNG **mask**. Transparent pixels = editable; opaque = preserved.
- For DALL·E 3, prefer **generate** (no edits). For **edits/masks**, keep `gpt-image-1`.
- The prompt is refined server-side using **GPT-5** for consistent quality.

