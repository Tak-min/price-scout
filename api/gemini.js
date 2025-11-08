const GEMINI_MODEL = "gemini-1.5-flash-latest";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const FALLBACK_RESPONSE = {
    store: "",
    items: []
};

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "Gemini APIキーが設定されていません。" });
    }

    const contentType = req.headers["content-type"] || "";
    if (!contentType.startsWith("multipart/form-data")) {
        return res.status(400).json({ error: "multipart/form-data で画像を送信してください。" });
    }

    try {
        const bodyBuffer = await readRequestBuffer(req);
        const filePart = extractFilePart(bodyBuffer, contentType);
        if (!filePart) {
            return res.status(400).json({ error: "receipt フィールドの画像が見つかりませんでした。" });
        }

        const payload = buildGeminiPayload(filePart);
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
            const message = response.status === 429
                ? "Gemini APIの利用上限に達しました。時間をおいて再度お試しください。"
                : "Gemini API呼び出しでエラーが発生しました。";
            return res.status(response.status).json({ error: message });
        }

        const data = await response.json();
        const structured = extractStructuredJson(data) || { ...FALLBACK_RESPONSE };

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(200).send(JSON.stringify(structured, null, 2));
    } catch (error) {
        console.error("Gemini handler failure", error);
        return res.status(500).json({ error: "Gemini APIの呼び出しに失敗しました。" });
    }
};

async function readRequestBuffer(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
    }
    return Buffer.concat(chunks);
}

function extractFilePart(buffer, contentType) {
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    const boundary = boundaryMatch?.[1];
    if (!boundary) {
        return null;
    }
    const boundaryText = `--${boundary}`;
    const bodyString = buffer.toString("binary");
    const parts = bodyString.split(boundaryText).filter(part => part.trim() && part.trim() !== "--");

    for (const part of parts) {
        if (!part.includes('name="receipt"')) {
            continue;
        }
        // 手動で multipart の境界を解析し、ファイルバイナリとメタ情報を抽出する。
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
            continue;
        }
        const headerSection = part.slice(0, headerEnd);
        const dataSection = part.slice(headerEnd + 4);
        const dataEnd = dataSection.lastIndexOf("\r\n");
        const fileBinary = dataSection.slice(0, dataEnd);
        const fileBuffer = Buffer.from(fileBinary, "binary");

        const typeMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);
        const mimeType = typeMatch?.[1]?.trim() || "application/octet-stream";

        return {
            buffer: fileBuffer,
            mimeType
        };
    }
    return null;
}

function buildGeminiPayload(filePart) {
    const instructions = [
        "あなたはレシート解析に長けたアシスタントです。",
        "画像を解析し、JSON形式で次の情報のみを抽出してください:",
        "store: 店舗名 (不明なら空文字)",
        "items: 商品の配列。各要素は { \"name\": 商品名, \"price\": 価格(数値) } としてください。",
        "税抜/税込が判別できない場合は税込価格とみなし、推測は行わず不明なら除外してください。",
        "出力は厳密に JSON のみで、余分な説明は含めないでください。"
    ].join("\n");

    return {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: instructions
                    },
                    {
                        inline_data: {
                            mime_type: filePart.mimeType,
                            data: filePart.buffer.toString("base64")
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 512,
            responseMimeType: "application/json"
        }
    };
}

function extractStructuredJson(geminiResponse) {
    try {
        const raw = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof raw !== "string") {
            return null;
        }
        const trimmed = raw.trim();
        const parsed = JSON.parse(trimmed);
        return sanitizeResponse(parsed);
    } catch (error) {
        console.error("Failed to parse Gemini response", error);
        return null;
    }
}

function sanitizeResponse(parsed) {
    const store = typeof parsed?.store === "string" ? parsed.store.trim() : "";
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const normalizedItems = items
        .map(item => {
            const name = typeof item?.name === "string" ? item.name.trim() : "";
            const price = normalizeNumber(item?.price);
            if (!name || price === null) {
                return null;
            }
            return {
                name,
                price
            };
        })
        .filter(Boolean);

    return {
        store,
        items: normalizedItems
    };
}

function normalizeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const cleaned = value.replace(/[^0-9.]/g, "");
        if (!cleaned) {
            return null;
        }
        const parsed = Number.parseFloat(cleaned);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}

async function safeReadJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}
