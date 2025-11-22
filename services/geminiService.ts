
import { GoogleGenAI, Type } from "@google/genai";
import { MarketCandle, RiskLevel, Trade } from "../types";

// Helper to safely get API Key in both Vite and other environments
const getApiKey = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
    return import.meta.env.VITE_API_KEY;
  }
  try {
    return process.env.API_KEY;
  } catch (e) {
    return '';
  }
};

const apiKey = getApiKey();

// Initialize the AI client only if key exists, otherwise handle gracefully
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const analyzeMarketCondition = async (
  symbol: string,
  candles: MarketCandle[],
  riskLevel: RiskLevel,
  activePositions: Trade[],
  initialCapital: number,
  strategyDescription: string 
): Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; reasoning: string; confidence: number }> => {

  if (!ai) {
    return { signal: 'HOLD', reasoning: '未配置 API Key，无法进行 AI 分析。请在 .env 文件中设置 VITE_API_KEY。', confidence: 0 };
  }

  const recentData = candles.slice(-200); 
  
  if (recentData.length < 30) {
    return { signal: 'HOLD', reasoning: '数据积累中，暂时无法分析', confidence: 0 };
  }

  const currentPrice = recentData[recentData.length - 1]?.close;
  
  const prompt = `
    你是一名资深加密货币量化交易员。请根据以下市场数据进行技术面分析。

    【分析对象】
    标的: ${symbol}
    数据: 1分钟K线 (近${recentData.length}根)
    当前价格: $${currentPrice}
    
    【系统配置】
    当前运行策略: ${strategyDescription}
    风险偏好: ${riskLevel} (LOW=保守, MEDIUM=稳健, HIGH=激进)
    
    【用户账户情境】
    1. 初始本金: $${initialCapital}
    2. 持仓状态: ${activePositions.length > 0 ? '当前持有仓位' : '当前空仓'}

    【收盘价序列 (最早 -> 最新)】: 
    ${JSON.stringify(recentData.map(c => Number(c.close.toFixed(2))))}

    【分析逻辑要求】
    请结合价格行为(Price Action)及隐含的 MACD/RSI/布林带形态进行推理。
    **必须**根据【用户账户情境】和【运行策略】调整策略建议：
    - 若为多策略组合，请综合判断。
    - 若本金较小 (如 <$2000) 或风险偏好为 LOW：请采取严格的防御策略。

    【输出格式】
    请返回 JSON 对象:
    {
      "signal": "BUY" | "SELL" | "HOLD",
      "reasoning": "中文简评 (60字内)。包含趋势判断、关键点位及针对当前本金/风险的建议。",
      "confidence": 0-100 (整数)
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            signal: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD'] },
            reasoning: { type: Type.STRING },
            confidence: { type: Type.NUMBER, description: "0-100 score" }
          },
          required: ['signal', 'reasoning', 'confidence']
        }
      }
    });

    const resultText = response.text;
    if (!resultText) return { signal: 'HOLD', reasoning: 'AI 未返回响应', confidence: 0 };
    
    return JSON.parse(resultText);
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return { signal: 'HOLD', reasoning: 'AI 分析服务暂时不可用', confidence: 0 };
  }
};

export const generateStrategyReport = async (
  trades: Trade[],
  totalPnl: number
): Promise<string> => {
    if (!ai) return "请配置 API Key 以启用 AI 报告功能。";

    const prompt = `
      分析本次交易会话:
      总盈亏: $${totalPnl.toFixed(2)}
      总交易次数: ${trades.length}
      盈利交易数: ${trades.filter(t => (t.pnl || 0) > 0).length}
      
      请提供一份简短、专业的中文总结，评价当前表现并给出一条改进建议。
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text || "无法生成报告。";
    } catch (e) {
      return "分析服务暂时不可用。";
    }
}
