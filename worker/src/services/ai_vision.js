export async function analyzeFrameWithOpenAI(base64Image, env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const prompt = `You are StreamSnap AI, an advanced visual commerce recognition engine for video frames.
Analyze this video frame.
Identify every prominent consumer product, brand, device, packaging, or item visible in the frame (e.g. health supplements, electronics, apparel).

GUIDELINES:
1. Provide a specific, searchable product title with brand and model.
2. Provide bounding box coordinates [ymin, xmin, ymax, xmax] normalized between 0 and 1000 tightly enclosing the product.
3. If any creator handle (@user), song name, or caption is visible on screen, output it in "videoTitle".
4. For each item provide a realistic retail price in USD (e.g. "29.99"), confidence (80 to 99), and a short 1-sentence "matchReason".
5. DO NOT identify generic background room items.

YOU MUST OUTPUT ONLY VALID JSON matching this structure exactly:
{
  "videoTitle": "@creator or caption",
  "products": [
    {
      "title": "Specific Product Name with Brand & Model",
      "brand": "Brand",
      "price": "29.99",
      "confidence": 95,
      "matchReason": "Clear brand packaging.",
      "box_2d": [180, 220, 650, 780]
    }
  ]
}`;

  const payload = {
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    response_format: { type: "json_object" },
    max_tokens: 1000
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}
