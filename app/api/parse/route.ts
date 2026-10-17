const MODEL = "gemini-3.8-flash";

export async function POST(req: Request) {
  const { text } = await req.json();
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY nahi mili. .env.local check karein aur server restart karein.");
    return Response.json({ error: "no key" }, { status: 500 });
  }

  const prompt = `Extract from this food donation message JSON: {"item": string, "quantity": number, "minutes": number (minutes from now until the pickup deadline)}. Message: ${text}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    console.error("Gemini error:", res.status, await res.text());
    return Response.json({ error: "ai failed" }, { status: 502 });
  }

  try {
    const j = await res.json();
    const o = JSON.parse(j.candidates[0].content.parts[0].text);
    return Response.json({ item: String(o.item), quantity: Number(o.quantity), minutes: Number(o.minutes) });
  } catch (e) {
    console.error("AI output parse error:", e);
    return Response.json({ error: "bad ai output" }, { status: 502 });
  }
}