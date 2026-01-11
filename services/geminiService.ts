
import { GoogleGenAI } from "@google/genai";
import { InspectionItem, InspectionStatus } from "../types";

// Always use process.env.API_KEY directly for initialization as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const GeminiService = {
  /**
   * Analyzes an inspection deficiency and provides professional feedback/regulations.
   */
  async analyzeDeficiency(item: InspectionItem): Promise<string> {
    // Guidelines: Assume API_KEY is pre-configured. The application must not ask the user for it.
    try {
      const prompt = `
        你是一位台灣的消防安全專家。
        請針對以下消防設備缺失進行分析：
        設備類型: ${item.type}
        位置: ${item.location}
        缺失描述: ${item.notes}
        
        請提供：
        1. 可能的法規依據（參考台灣消防法規）。
        2. 建議的改善措施。
        3. 風險評估（低/中/高）。
        
        請用繁體中文回答，語氣專業簡潔。
      `;

      // Use gemini-3-pro-preview for complex reasoning tasks as per guidelines.
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });

      // Directly access .text property (not a method) as per guidelines.
      return response.text || "無法產生分析結果。";
    } catch (error) {
      console.error("Gemini API Error:", error);
      return "AI 分析暫時無法使用，請稍後再試。";
    }
  },

  /**
   * Generates a summary for the entire report.
   */
  async generateReportSummary(items: InspectionItem[]): Promise<string> {
    // Guidelines: Assume API_KEY is available.
    const abnormalItems = items.filter(i => i.status === InspectionStatus.Abnormal);

    if (abnormalItems.length === 0) {
      return "本場所消防設備狀況良好，無發現明顯異常。";
    }

    const itemsDesc = abnormalItems.map(i => `- ${i.type} (${i.location}): ${i.notes}`).join('\n');

    try {
      const prompt = `
        請根據以下消防查檢異常項目撰寫一份簡短的總結報告：
        ${itemsDesc}

        重點：
        1. 摘要主要問題。
        2. 給予管理權人的整體改善建議。
        請用繁體中文，語氣權威且專業。
      `;

      // Use gemini-3-flash-preview for basic summarization tasks as per guidelines.
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      // Directly access .text property as per guidelines.
      return response.text || "無法產生摘要。";
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
      const systemPrompt = `
        你是一位台灣的「消防安全設備專家」與「法規顧問」。
        你的任務是協助現場人員判斷消防設備是否符合《消防安全設備設置標準》及相關消防法規。
        
        回答原則：
        1. **引用依據**：儘量具體引用法規條文（例如：根據設置標準第XX條...）。
        2. **判斷精準**：針對使用者的問題或提供的照片，指出是否合規。若照片不清或資訊不足，請提示需要補充什麼資訊。
        3. **實務建議**：除了法規，也可提供實務上的建議（例如：雖然合規但建議改善...）。
        4. **繁體中文**：請始終使用繁體中文回答。
        5. **語氣**：專業、客觀、友善。

        使用者問題：${userPrompt}
      `;

      let contents: any[] = [{ text: systemPrompt }];

      if (imageBase64) {
        // Remove header if present (e.g., "data:image/jpeg;base64,")
        const base64Data = imageBase64.split(',')[1] || imageBase64;

        contents.push({
          inlineData: {
            mimeType: "image/jpeg", // Assume JPEG for simplicity, or detect if needed
            data: base64Data
          }
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp', // Use latest model for best multimodal performance
        contents: contents,
      });

      return response.text || "AI 無法回答此問題。";
    } catch (error) {
      console.error("Gemini Robot Error:", error);
      return "AI 小幫手發生錯誤，請稍後再試。";
    }
  }
};
