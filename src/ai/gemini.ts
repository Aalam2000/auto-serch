// Gemini call: one ad = one request (text + all photos).

export interface AiReview {
  body_score: number;        // 0..10
  rust_score: number;        // 0..10, 10 = no rust
  accident_signs: string;
  interior_score: number;    // 0..10
  has_ac: boolean | null;
  real_mileage_note: string;
  engine_note: string;
  credit_possible: boolean;
  total_score: number;       // 0..100
  summary: string;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    body_score: { type: "INTEGER" },
    rust_score: { type: "INTEGER" },
    accident_signs: { type: "STRING" },
    interior_score: { type: "INTEGER" },
    has_ac: { type: "BOOLEAN", nullable: true },
    real_mileage_note: { type: "STRING" },
    engine_note: { type: "STRING" },
    credit_possible: { type: "BOOLEAN" },
    total_score: { type: "INTEGER" },
    summary: { type: "STRING" },
  },
  required: [
    "body_score", "rust_score", "accident_signs", "interior_score", "has_ac",
    "real_mileage_note", "engine_note", "credit_possible", "total_score", "summary",
  ],
};

export interface Photo {
  mime: string;
  base64: string;
}

export async function reviewWithGemini(
  apiKey: string,
  model: string,
  prompt: string,
  photos: Photo[],
): Promise<AiReview> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...photos.map((p) => ({ inline_data: { mime_type: p.mime, data: p.base64 } })),
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          temperature: 0.2,
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty answer");
  return JSON.parse(text) as AiReview;
}
