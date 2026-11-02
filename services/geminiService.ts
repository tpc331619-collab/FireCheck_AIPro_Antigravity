
import { InspectionItem, InspectionStatus } from "../types";
import { auth } from "./firebase";

/**
 * 前端不再持有 Gemini API Key。
 * 所有呼叫都經由伺服器端代理 /api/gemini（附 Firebase ID Token 驗證）。
 */
type GeminiAction = 'analyzeDeficiency' | 'generateReportSummary' | 'askRobot';

async function callGemini(action: GeminiAction, payload: unknown): Promise<string> {
  const user = auth?.currentUser;
  if (!user || user.isAnonymous) throw new Error('AI_REQUIRES_LOGIN');

  const idToken = await user.getIdToken();
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ action, payload })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP_${res.status}`);
  return data?.text || '';
}

export const GeminiService = {
  /**
   * Analyzes an inspection deficiency and provides professional feedback/regulations.
   */
  async analyzeDeficiency(item: InspectionItem): Promise<string> {
    try {
      const text = await callGemini('analyzeDeficiency', {
        item: {
          type: (item as any).type,
          name: item.name,
          location: (item as any).location,
          notes: item.notes
        }
      });
      return text || "無法產生分析結果。";
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      if (error?.message === 'AI_REQUIRES_LOGIN') return "AI 分析僅限登入帳號使用（訪客模式不開放）。";
      return "AI 分析暫時無法使用，請稍後再試。";
    }
  },

  /**
   * Generates a summary for the entire report.
   */
  async generateReportSummary(items: InspectionItem[]): Promise<string> {
    const abnormalItems = items.filter(i => i.status === InspectionStatus.Abnormal);

    if (abnormalItems.length === 0) {
      return "本場所消防設備狀況良好，無發現明顯異常。";
    }

    try {
      const text = await callGemini('generateReportSummary', {
        items: abnormalItems.map(i => ({
          type: (i as any).type,
          name: i.name,
          location: (i as any).location,
          notes: i.notes
        }))
      });
      return text || "無法產生摘要。";
    } catch (error) {
      console.error("Gemini API Error:", error);
      return "無法連線至 AI 服務。";
    }
  },

  /**
   * General Q&A with the Fire Safety Expert AI.
   * Supports text and optional image input.
   */
  async askRobot(userPrompt: string, imageBase64?: string): Promise<string> {
    try {
      const text = await callGemini('askRobot', { prompt: userPrompt, imageBase64 });
      return text || "AI 無法回答此問題。";
    } catch (error) {
      console.error("Gemini Robot Error:", error);
      return "AI 小幫手發生錯誤，請稍後再試。";
    }
  }
};
