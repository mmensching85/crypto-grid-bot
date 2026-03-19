import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 60;

// ── PROVIDER ADAPTERS ─────────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userMsg: string, useSearch: boolean) {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    // Prompt caching: system prompt is large but static.
    // Cached tokens cost 90% less — saves money on every call after the first.
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
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
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, unknown>;

  if (data.error) {
    const err = data.error as { type?: string; message?: string };
    if (err.type === "rate_limit_error") {
      throw new Error("Rate limit hit — wait 60 seconds and try again, or switch to Gemini");
    }
    if (err.type === "overloaded_error") {
      throw new Error("Claude is busy — try again in a moment, or switch to Gemini");
    }
    throw new Error(err.message || "Claude API error");
  }

  const content = (data.content as Array<{ type: string; text?: string }>) || [];
  return content.filter(b => b.type === "text").map(b => b.text || "").join("");
}

async function callGemini(systemPrompt: string, userMsg: string, useSearch: boolean) {
  const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMsg }] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
  };

  if (useSearch) {
    // Gemini 1.5 uses googleSearchRetrieval, 2.0 uses googleSearch
    const isV2 = geminiModel.startsWith("gemini-2");
    body.tools = isV2
      ? [{ googleSearch: {} }]
      : [{ googleSearchRetrieval: { dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.3 } } }];
  } else {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  // Note: no stray slash before :generateContent
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );

  const data = await res.json() as Record<string, unknown>;
  if ((data as { error?: { message?: string } }).error) {
    throw new Error((data as { error: { message?: string } }).error.message || "Gemini API error");
  }

  const candidates = (data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>) || [];
  return (candidates[0]?.content?.parts || []).filter(p => p.text).map(p => p.text || "").join("");
}

async function callGrok(systemPrompt: string, userMsg: string, useSearch: boolean) {
  const tools = useSearch
    ? [{ type: "function", function: { name: "web_search", description: "Search the web for current crypto prices and market data", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }]
    : undefined;

  const body: Record<string, unknown> = {
    model: "grok-3-latest",
    max_tokens: 8192,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
  };
  if (tools) body.tools = tools;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, unknown>;
  if ((data as { error?: { message?: string } }).error) {
    throw new Error((data as { error: { message?: string } }).error.message || "Grok API error");
  }

  const choices = (data.choices as Array<{ message?: { content?: string } }>) || [];
  return choices[0]?.message?.content || "";
}

async function callOpenAI(systemPrompt: string, userMsg: string, useSearch: boolean) {
  const tools = useSearch
    ? [{ type: "function", function: { name: "web_search", description: "Search the web for live crypto prices", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }]
    : undefined;

  const body: Record<string, unknown> = {
    model: "gpt-4o",
    max_tokens: 8192,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
  };
  if (tools) body.tools = tools;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, unknown>;
  if ((data as { error?: { message?: string } }).error) {
    throw new Error((data as { error: { message?: string } }).error.message || "OpenAI API error");
  }

  const choices = (data.choices as Array<{ message?: { content?: string } }>) || [];
  return choices[0]?.message?.content || "";
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { provider, systemPrompt, userMsg, useSearch } = await req.json() as {
      provider: string;
      systemPrompt: string;
      userMsg: string;
      useSearch: boolean;
    };

    const keyMap: Record<string, string | undefined> = {
      claude: process.env.ANTHROPIC_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      grok:   process.env.GROK_API_KEY,
      openai: process.env.OPENAI_API_KEY,
    };

    if (!keyMap[provider]) {
      return NextResponse.json(
        { error: `No API key configured for ${provider}. Add ${provider.toUpperCase()}_API_KEY in Vercel → Settings → Environment Variables.` },
        { status: 400 }
      );
    }

    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const datedPrompt = `Today's date: ${today}. All price data must be fetched live — NEVER use training data for current prices.\n\n${systemPrompt}\n\nRESPOND ONLY WITH RAW JSON. No markdown, no backticks, no explanation. Start with { and end with }.`;

    let text = "";
    if (provider === "claude")      text = await callClaude(datedPrompt, userMsg, useSearch);
    else if (provider === "gemini") text = await callGemini(datedPrompt, userMsg, useSearch);
    else if (provider === "grok")   text = await callGrok(datedPrompt, userMsg, useSearch);
    else if (provider === "openai") text = await callOpenAI(datedPrompt, userMsg, useSearch);
    else return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });

    // Strip markdown fences if present and extract JSON
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const f = cleaned.indexOf("{");
    const l = cleaned.lastIndexOf("}");
    if (f === -1 || l === -1) {
      return NextResponse.json(
        { error: `No JSON in response. Got: ${cleaned.slice(0, 300)}` },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(cleaned.slice(f, l + 1));
    return NextResponse.json({ result: parsed });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
