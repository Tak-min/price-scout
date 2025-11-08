const GEMINI_MODEL = "gemini-1.5-flash-latest";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const FALLBACK_RESPONSE = {
    name: "",
    store: "",
    total: "",
    date: "",
    quantity: "",
    unit: "",
    memo: ""
};

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // const apiKey = process.env.GEMINI_API_KEY;
    const apiKey = "AIzaSyCa1H-inASCzPZtLmzag4rEuXJqxx-um8s";
    if (!apiKey) {
        return res.status(500).json({ error: "Gemini APIキーが設定されていません。" });
    }

    let body;
    try {
        body = await parseJsonBody(req);
    } catch (error) {
        console.error("Failed to parse request body", error);
        return res.status(400).json({ error: "リクエストボディがJSONとして解釈できませんでした。" });
    }

    const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";
    if (!rawText) {
        return res.status(400).json({ error: "rawText は必須です。" });
    }

    try {
        const payload = buildGeminiPayload(rawText);
        const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorDetail = await safeReadJson(response);
            console.error("Gemini API error", response.status, errorDetail);
            return res.status(response.status).json({ error: "Gemini API呼び出しでエラーが発生しました。" });
        }

        const data = await response.json();
        const structured = extractStructuredJson(data) || { ...FALLBACK_RESPONSE };
        return res.status(200).json(structured);
    } catch (error) {
        console.error("Gemini handler failure", error);
        return res.status(500).json({ error: "Gemini APIの呼び出しに失敗しました。" });
    }
}

function buildGeminiPayload(rawText) {
    const prompt = buildPrompt(rawText);
    return {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: prompt
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.15,
            topP: 0.8,
            topK: 32,
            maxOutputTokens: 512,
            responseMimeType: "application/json"
        }
    };
}

function buildPrompt(rawText) {
    return [
        "あなたはスーパーマーケットのレシート解析に精通したアシスタントです。",
        "以下のテキストは Tesseract.js が OCR したものであり、数字や文字の誤認識を含む可能性があります。",
        "文脈を推測し、JSON形式で以下のキーを必ず含めてください:",
        "name (代表的な商品名がわかる場合のみ)",
        "store (店舗名)",
        "total (税込合計金額。数値のみで円は含めない)",
        "date (購入日。YYYY-MM-DD形式)",
        "quantity (わかる場合の合計数量。数値のみ)",
        "unit (数量の単位。わからなければ空文字)",
        "memo (補足情報があれば記載。なければ空文字)",
        "わからない情報は空文字にし、適当に作らないでください。",
        "数値は半角で出力し、小数点が必要な場合のみ使用してください。",
        "【OCRテキスト】\n" + rawText
    ].join("\n");
}

function extractStructuredJson(geminiResponse) {
    try {
        const text = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text !== "string") {
            return null;
        }
        const jsonString = extractJsonString(text);
        if (!jsonString) {
            return null;
        }
        const parsed = JSON.parse(jsonString);
        return sanitizeResponse(parsed);
    } catch (error) {
        console.error("Failed to parse Gemini response", error);
        return null;
    }
}

function extractJsonString(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }
    return text.slice(start, end + 1).replace(/```json|```/g, "").trim();
}

function sanitizeResponse(parsed) {
    return {
        name: typeof parsed.name === "string" ? parsed.name.trim() : "",
        store: typeof parsed.store === "string" ? parsed.store.trim() : "",
        total: normalizeNumber(parsed.total ?? parsed.price ?? ""),
        date: typeof parsed.date === "string" ? parsed.date.trim() : "",
        quantity: normalizeNumber(parsed.quantity ?? ""),
        unit: typeof parsed.unit === "string" ? parsed.unit.trim() : "",
        memo: typeof parsed.memo === "string" ? parsed.memo.trim() : ""
    };
}

function normalizeNumber(value) {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value !== "string") {
        return "";
    }
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (!cleaned) {
        return "";
    }
    const parsed = Number.parseFloat(cleaned);
    if (Number.isNaN(parsed)) {
        return "";
    }
    return parsed;
}

async function safeReadJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}

async function parseJsonBody(req) {
    if (req.body) {
        return coerceJson(req.body);
    }

    let raw = "";
    for await (const chunk of req) {
        raw += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    }
    if (!raw) {
        return null;
    }
    return JSON.parse(raw);
}

function coerceJson(payload) {
    if (typeof payload === "string") {
        return JSON.parse(payload);
    }
    if (Buffer.isBuffer(payload)) {
        return JSON.parse(payload.toString("utf8"));
    }
    if (typeof payload === "object") {
        return payload;
    }
    return null;
}
