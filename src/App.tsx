import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AnalysisResult } from "./types";
import Header from "./components/Header";
import InputSection from "./components/InputSection";
import AnalysisLoading from "./components/AnalysisLoading";
import ResultDisplay from "./components/ResultDisplay";
import HistoryDashboard from "./components/HistoryDashboard";
import { Language, translations } from "./translations";
import { analyzeWithGemini } from "./lib/gemini";

type AppState = "input" | "loading" | "result" | "history";

export default function App() {
  const [state, setState] = useState<AppState>("input");
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [language, setLanguage] = useState<Language>("zh");
  const [isTranslating, setIsTranslating] = useState(false);
  const [history, setHistory] = useState<AnalysisResult[]>([]);

  const t = translations[language];
  const [translationsCache, setTranslationsCache] = useState<Record<string, AnalysisResult>>({});

  const normalizeScore = (n: any) => {
    if (typeof n === 'string') {
      // Clean string: "88%" -> "88", "88/100" -> "88"
      const cleaned = n.replace(/[^0-9.]/g, '');
      const val = parseFloat(cleaned);
      if (isNaN(val)) return 0;
      if (val > 0 && val <= 1 && n.includes('.')) return Math.round(val * 100);
      return Math.min(100, Math.max(0, Math.round(val)));
    }
    const val = parseFloat(n);
    if (isNaN(val)) return 0;
    if (val > 0 && val <= 1) return Math.round(val * 100);
    return Math.min(100, Math.max(0, Math.round(val)));
  };

  const normalizeResult = (data: any, id: string, timestamp: number, jd: string): AnalysisResult => {
    // Robust score extraction: look for score in multiple common fields
    const rawScore = data.score !== undefined ? data.score : (data.match_score || data.total_score || data.overall_score || data.匹配度 || data.分数 || 0);
    
    // Check match breakdown for translated keys as well
    const mb = data.match_breakdown || {};
    const skillVal = mb.skills !== undefined ? mb.skills : (mb.技能 || mb.专业技能 || 0);
    const expVal = mb.experience !== undefined ? mb.experience : (mb.经验 || mb.工作经验 || 0);
    const toolVal = mb.tools !== undefined ? mb.tools : (mb.工具 || mb.软件工具 || 0);
    
    const finalScore = normalizeScore(rawScore);
    
    const result: AnalysisResult = {
      summary: data.summary || data.总结 || data.概述 || "",
      score: finalScore,
      confidence: data.confidence || data.可信度 || "Medium",
      match_breakdown: {
        skills: normalizeScore(skillVal),
        experience: normalizeScore(expVal),
        tools: normalizeScore(toolVal),
      },
      strengths: Array.isArray(data.strengths || data.优势) ? (data.strengths || data.优势) : [],
      gaps: Array.isArray(data.gaps || data.差距 || data.不足) ? (data.gaps || data.差距 || data.不足) : [],
      suggestions: Array.isArray(data.suggestions || data.建议) ? (data.suggestions || data.建议) : [],
      keyword_match: {
        matched: Array.isArray(data.keyword_match?.matched || data.关键词匹配?.已匹配) ? (data.keyword_match?.matched || data.关键词匹配?.已匹配) : [],
        missing: Array.isArray(data.keyword_match?.missing || data.关键词匹配?.缺失) ? (data.keyword_match?.missing || data.关键词匹配?.缺失) : [],
      },
      id,
      timestamp,
      jd: jd.slice(0, 150),
    };

    if (result.score === 0) {
      console.error("[DEBUG] Score is 0. Data received:", data);
    }
    
    return result;
  };

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem("careerlens_history");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("careerlens_history", JSON.stringify(history));
  }, [history]);

  // Logic to translate result when language toggles
  const translateResult = async (targetLang: Language, result: AnalysisResult) => {
    if (!result) return;
    
    // Check cache
    const cacheKey = `${result.id}-${targetLang}`;
    if (translationsCache[cacheKey]) {
      setCurrentResult(translationsCache[cacheKey]);
      return;
    }

    setIsTranslating(true);
    try {
      const prompt = `Translate this career analysis result into ${targetLang === 'zh' ? 'Simplified Chinese' : 'English'}.
 
 CRITICAL RULES:
 1. Return ONLY the translated JSON.
 2. DO NOT change ANY numeric values.
 3. DO NOT translate the field 'confidence'. Keep it strictly as '${result.confidence}'.
 4. MANDATORY: All descriptions, issues, reasons, and actions MUST be in ${targetLang === 'zh' ? 'Simplified Chinese' : 'English'}.
 5. Even if technical keywords (e.g., "Java", "SQL") remain in English, the SENTENCE structure and EXPLANATION must be ${targetLang === 'zh' ? 'Simplified Chinese' : 'English'}.
 6. SUMMARY: Keep it under 15 words.
 
 Data to translate: ${JSON.stringify(result)}`;
 
      const text = await analyzeWithGemini(prompt);
      
      if (text) {
        const translatedData = JSON.parse(text);
        const finalResult = normalizeResult(translatedData, result.id, result.timestamp, result.jd);
        setTranslationsCache(prev => ({ ...prev, [cacheKey]: finalResult }));
        setCurrentResult(finalResult);
      }
    } catch (error: any) {
      console.error("Translation Error:", error);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleLanguageChange = (newLang: Language) => {
    if (newLang === language) return;
    setLanguage(newLang);
    if (state === "result" && currentResult) {
      translateResult(newLang, currentResult);
    }
  };

  const handleAnalyze = async (jd: string, resume: string) => {
    if (!jd.trim() || !resume.trim()) return;
    
    console.log("[App] Starting analysis via backend...");
    setState("loading");
    
    try {
      const prompt = `Task: Professional Career Match Analysis.
Tone: Scientific, objective, and extremely precise.
Output Language: MUST BE ${language === 'zh' ? 'Simplified Chinese' : 'English'}.

JD Content:
${jd.slice(0, 10000)}

Resume Content:
${resume.slice(0, 10000)}

CRITICAL RULES:
1. You are a highly professional career analysis expert. Your goal is to map the Resume against the JD.
2. Even if the resume format is messy, extract all information you can find.
3. If information is missing (e.g., specific skill not found), provide a null or empty array, DO NOT hallucinate.
4. "score" must be a 0-100 integer. 0 is absolutely not a match, 100 is a perfect match.
5. IF the input is too messy to extract structured data, attempt your best to infer based on context rather than failing.

Schema Requirements (JSON format, NO Markdown, NO extra text):
{
  "score": integer (0-100),
  "confidence": "High" | "Medium" | "Low",
  "summary": "exactly one short summary sentence, max 15 words",
  "match_breakdown": { "skills": integer(0-100), "experience": integer(0-100), "tools": integer(0-100) },
  "strengths": ["string"],
  "gaps": ["string"],
  "suggestions": [ { "issue": "string", "reason": "string", "action": "string" } ],
  "keyword_match": { "matched": ["string"], "missing": ["string"] }
}

STRICT JSON OUTPUT ONLY.`;

      const text = await analyzeWithGemini(prompt);

      if (!text) throw new Error("Empty response from analysis engine");

      // Robust JSON extraction
      let data;
      try {
        const cleanedText = text.replace(/```json\n?|```/g, '').trim();
        data = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.error("[App] Initial parse failed, attempting intelligent data repair", parseErr);
        
        // Strategy: If fail, ask AI again with specific instruction to return ONLY repairable JSON? 
        // Or in this case, a fallback strategy: 
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            data = JSON.parse(jsonMatch[0]);
          } catch (e) {
            throw new Error(`AI returned malformed data. Text preview: ${text.slice(0, 100)}...`);
          }
        } else {
          // If completely no JSON, throw error for user.
          throw new Error("Unable to parse analysis into structured format. Please check if resume has enough content.");
        }
      }

      // Final validation to ensure essential fields exist
      if (!data.score && data.score !== 0) {
        data.score = 50; // Fallback score instead of 0
        data.confidence = "Low";
      }

      const result = normalizeResult(data, crypto.randomUUID(), Date.now(), jd);

      setHistory(prev => [result, ...prev].slice(0, 30)); // Expanded history to 30
      
      setTranslationsCache(prev => ({
        ...prev,
        [`${result.id}-${language}`]: result
      }));

      setCurrentResult(result);
      setState("result");
    } catch (error: any) {
      console.error("[App] Analysis Error:", error);
      
      const isQuotaError = error.message?.toLowerCase().includes("quota") || error.message?.toLowerCase().includes("429");
      
      if (isQuotaError) {
        alert(language === 'zh'
          ? "API 免费额度已用完（429 Quota Exceeded）。请稍后再试，或者更换 API 密钥。"
          : "API Quota exceeded. Please try again later or use a different API key.");
      } else {
        alert(language === 'zh' 
          ? `分析过程中发生错误: ${error.message || "未知错误"}` 
          : `Analysis failed: ${error.message || "Unknown error"}`);
      }
      
      // Always reset back to input so the UI doesn't hang in "loading" state forever
      setState("input"); 
    }
  };

  const clearHistory = () => {
    if (window.confirm(language === 'zh' ? '确定要重构所有历史记录吗？(此操作不可逆)' : 'Clear all history permanently?')) {
      setHistory([]);
      localStorage.removeItem("careerlens_history");
    }
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const viewHistoryItem = (item: AnalysisResult) => {
    setCurrentResult(item);
    setState("result");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] selection:bg-indigo-100 selection:text-indigo-900">
      <Header 
        language={language}
        onLanguageChange={handleLanguageChange}
        viewHistory={() => setState(state === "history" ? "input" : "history")}
        isHistoryActive={state === "history"}
      />
      
      <main className="container mx-auto px-4 pt-40 md:pt-36 pb-12">
        <AnimatePresence mode="wait">
          {isTranslating && (
            <motion.div
              key="translating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-white/60 backdrop-blur-md z-[100] flex items-center justify-center"
            >
              <div className="text-center">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"
                />
                <p className="text-slate-900 font-bold">{language === 'zh' ? '正在切换语言...' : 'Switching Language...'}</p>
              </div>
            </motion.div>
          )}

          {state === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-5xl mx-auto"
            >
              <HistoryDashboard 
                history={history} 
                onView={viewHistoryItem}
                onDelete={deleteHistoryItem}
                onClearAll={clearHistory}
                onBack={() => setState("input")}
                language={language}
              />
            </motion.div>
          )}

          {state === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="max-w-4xl mx-auto"
            >
              <div className="text-center mb-12 relative">
                <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-100/40 rounded-full blur-[100px] -z-10" />
                
                <h2 className="text-3xl md:text-6xl font-black mb-6 tracking-tighter text-slate-900 leading-[1.1]">
                  {t.title} <br />
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-indigo-400 font-black">
                    {language === 'zh' ? '成就职业新高度' : 'Direct Career Insight'}
                  </span>
                </h2>
              </div>

              <div className="bg-white/50 backdrop-blur-xl p-2 rounded-[3rem] shadow-2xl shadow-indigo-600/5">
                <InputSection onAnalyze={handleAnalyze} language={language} isAnalyzing={state === "loading"} />
              </div>
            </motion.div>
          )}

          {state === "loading" && (
            <motion.div 
              key="loading" 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-xl mx-auto py-12"
            >
              <AnalysisLoading language={language} />
            </motion.div>
          )}

          {state === "result" && currentResult && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <ResultDisplay 
                result={currentResult} 
                onBack={() => {
                  setState("input");
                  setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
                }} 
                language={language}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
