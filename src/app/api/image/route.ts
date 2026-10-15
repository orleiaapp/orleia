import { NextResponse } from "next/server";
import { guardApi } from "@/lib/apiGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

// NVIDIA NIM image generation via FLUX.1-dev (high quality).
export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 120, perDay: 5000 });
  if (denied) return denied;

  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }
    const key = process.env.NVIDIA_API_KEY;
    if (!key) return NextResponse.json({ error: "no key" }, { status: 500 });

    // FLUX.1-dev is primary; fall back through the other NIM image models so
    // one stalled/decommissioned endpoint doesn't take image gen down entirely.
    const MODELS = [
      "black-forest-labs/flux.1-dev",
      "black-forest-labs/flux.1-schnell",
      "stabilityai/stable-diffusion-xl",
    ];
    let lastErr = "";
    for (const model of MODELS) {
      const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${model}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ prompt: prompt.slice(0, 900) }),
        signal: AbortSignal.timeout(50000),
      });
      if (!res.ok) {
        const errText = await res.text();
        lastErr = `${model} (${res.status}): ${errText.slice(0, 120)}`;
        console.error("[image] model failed:", lastErr);
        continue;
      }
      const data = await res.json();
      const b64 = data?.artifacts?.[0]?.base64;
      if (!b64) {
        lastErr = `${model}: empty result`;
        continue;
      }
      return NextResponse.json({ imageDataUrl: `data:image/jpeg;base64,${b64}` });
    }
    return NextResponse.json(
      { error: `image failed: ${lastErr || "no image models responded"}` },
      { status: 502 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: `image generation failed: ${msg}` }, { status: 500 });
  }
}
