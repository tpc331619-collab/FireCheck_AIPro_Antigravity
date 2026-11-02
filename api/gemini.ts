/**
 * Server-side Gemini proxy (Vercel Function, Web Request/Response signature).
 *
 * - GEMINI_API_KEY 只存在伺服器環境變數，永不進入前端 bundle。
 * - 必須帶 Firebase ID Token（Authorization: Bearer <token>），且不允許匿名（訪客）帳號。
 * - Prompt 與模型由伺服器端決定，前端只能送「動作 + 資料」，避免被當成免費 Gemini 代理濫用。
 */
import { GoogleGenAI } from '@google/genai';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'firecheck-ai-pro';
const JWKS = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const MODELS = {
    analyze: 'gemini-3-pro-preview',
    summary: 'gemini-3-flash-preview',
    robot: 'gemini-3-flash-preview'
} as const;

const MAX_TEXT = 2000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // base64 解碼後約 4MB
const MAX_ITEMS = 200;

type Action = 'analyzeDeficiency' | 'generateReportSummary' | 'askRobot';

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });

const clip = (v: unknown, max = MAX_TEXT) => String(v ?? '').slice(0, max);

async function verifyUser(req: Request) {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
            audience: FIREBASE_PROJECT_ID
        });
        const provider = (payload.firebase as any)?.sign_in_provider;
        if (!payload.sub || provider === 'anonymous') return null;
        return { uid: payload.sub };
    } catch {
        return null;
    }
}

function buildRequest(action: Action, payload: any): { model: string; contents: any } | { error: string } {
    switch (action) {
        case 'analyzeDeficiency': {
            const item = payload?.item || {};
            const prompt = `
你是一位台灣的消防安全專家。
請針對以下消防設備缺失進行分析：
設備類型: ${clip(item.type || item.name, 200)}
位置: ${clip(item.location, 200)}
缺失描述: ${clip(item.notes)}

請提供：
1. 可能的法規依據（參考台灣消防法規）。
2. 建議的改善措施。
3. 風險評估（低/中/高）。

請用繁體中文回答，語氣專業簡潔。`;
            return { model: MODELS.analyze, contents: prompt };
        }

        case 'generateReportSummary': {
            const items: any[] = Array.isArray(payload?.items) ? payload.items.slice(0, MAX_ITEMS) : [];
            if (items.length === 0) return { error: 'NO_ITEMS' };
            const itemsDesc = items
                .map(i => `- ${clip(i.type || i.name, 100)} (${clip(i.location, 100)}): ${clip(i.notes, 500)}`)
                .join('\n');
            const prompt = `
請根據以下消防查檢異常項目撰寫一份簡短的總結報告：
${itemsDesc}

重點：
1. 摘要主要問題。
2. 給予管理權人的整體改善建議。
請用繁體中文，語氣權威且專業。`;
            return { model: MODELS.summary, contents: prompt };
        }

        case 'askRobot': {
            const userPrompt = clip(payload?.prompt);
            if (!userPrompt.trim()) return { error: 'EMPTY_PROMPT' };
            const systemPrompt = `
你是一位台灣的「消防安全設備專家」與「法規顧問」。
你的任務是協助現場人員判斷消防設備是否符合《消防安全設備設置標準》及相關消防法規。

回答原則：
1. **引用依據**：儘量具體引用法規條文（例如：根據設置標準第XX條...）。
2. **判斷精準**：針對使用者的問題或提供的照片，指出是否合規。若照片不清或資訊不足，請提示需要補充什麼資訊。
3. **實務建議**：除了法規，也可提供實務上的建議（例如：雖然合規但建議改善...）。
4. **繁體中文**：請始終使用繁體中文回答。
5. **語氣**：專業、客觀、友善。

使用者問題：${userPrompt}`;

            const parts: any[] = [{ text: systemPrompt }];
            const image = typeof payload?.imageBase64 === 'string' ? payload.imageBase64 : '';
            if (image) {
                const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
                const mimeType = match?.[1] || 'image/jpeg';
                const data = image.includes(',') ? image.split(',')[1] : image;
                if ((data.length * 3) / 4 > MAX_IMAGE_BYTES) return { error: 'IMAGE_TOO_LARGE' };
                parts.push({ inlineData: { mimeType, data } });
            }
            return { model: MODELS.robot, contents: [{ role: 'user', parts }] };
        }

        default:
            return { error: 'UNKNOWN_ACTION' };
    }
}

export async function POST(req: Request): Promise<Response> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json(500, { error: 'SERVER_NOT_CONFIGURED' });

    const user = await verifyUser(req);
    if (!user) return json(401, { error: 'UNAUTHORIZED' });

    let body: any;
    try {
        body = await req.json();
    } catch {
        return json(400, { error: 'INVALID_JSON' });
    }

    const built = buildRequest(body?.action as Action, body?.payload);
    if ('error' in built) return json(400, { error: built.error });

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({ model: built.model, contents: built.contents });
        return json(200, { text: response.text || '' });
    } catch (e: any) {
        console.error('[api/gemini] upstream error', user.uid, e?.message);
        return json(502, { error: 'UPSTREAM_ERROR' });
    }
}

export async function GET(): Promise<Response> {
    return json(405, { error: 'METHOD_NOT_ALLOWED' });
}

