import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 60;

// ── PROVIDER ADAPTERS ─────────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userMsg: string, useSearch: boolean) {
  const body: Record<string, unknown> = {
    model: "claude-3-7-sonnet-20250219", // Latest Claude for 2026
    max_tokens: 8192,
    system: [{ type: "text", text: systemPrompt }],
    messages: [{ role: "user", content: userMsg }],
  };

  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message || "Claude API error");
  return data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

async function callGemini(systemPrompt: string, userMsg: string, useSearch: boolean) {
  // Gemini 3.1 Pro provides the best reasoning for trading logic in 2026
  const geminiModel = "gemini-3.1-pro"; 

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMsg }] }],
    generationConfig: { 
      maxOutputTokens: 8192, 
      temperature: 0.1,
      // Enables internal chain-of-thought for better market reasoning
      thinkingBudget: 1024 
    },
  };

  if (useSearch) {
    body.tools = [{ googleSearch: {} }];
  } else {
    (body.generationConfig as any).responseMimeType = "application/json";
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );

  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message || "Gemini API error");

  const candidates = data.candidates || [];
  // Correctly handles text or thought parts in 2026 schema
  return candidates[0]?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join("") || "";
}

async function callGrok(systemPrompt: string, userMsg: string, useSearch: boolean) {
  const body: Record<string, unknown> = {
    model: "grok-3-latest",
    max_tokens: 8192,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
  };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || "";
}

async function callOpenAI(systemPrompt: string, userMsg: string, useSearch: boolean) {
  const body: Record<string, unknown> = {
    model: "gpt-4o",
    max_tokens: 8192,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || "";
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { provider, systemPrompt, userMsg, useSearch } = await req.json();

    const keyMap: Record<string, string | undefined> = {
      claude: process.env.ANTHROPIC_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      grok:   process.env.GROK_API_KEY,
      openai: process.env.OPENAI_API_KEY,
    };

    if (!keyMap[provider]) {
      return NextResponse.json({ error: `API key for ${provider} is missing.` }, { status: 400 });
    }

    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const datedPrompt = `Today's date: ${today}. Focus on accuracy for trading logic.\n\n${systemPrompt}\n\nRESPOND ONLY WITH RAW JSON.`;

    let text = "";
    if (provider === "claude")      text = await callClaude(datedPrompt, userMsg, useSearch);
    else if (provider === "gemini") text = await callGemini(datedPrompt, userMsg, useSearch);
    else if (provider === "grok")   text = await callGrok(datedPrompt, userMsg, useSearch);
    else if (provider === "openai") text = await callOpenAI(datedPrompt, userMsg, useSearch);
    else return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });

    // Clean Markdown formatting if the AI includes it
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: "Response did not contain valid JSON." }, { status: 500 });
    }

    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return NextResponse.json({ result: parsed });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
