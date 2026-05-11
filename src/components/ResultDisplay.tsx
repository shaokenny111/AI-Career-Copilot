import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Target, 
  Lightbulb, 
  ShieldAlert, 
  Copy,
  Check,
  FileText,
  Sparkles
} from "lucide-react";
import { useState, useEffect } from "react";
import { AnalysisResult } from "../types";
import { Language, translations } from "../translations";

interface ResultDisplayProps {
  result: AnalysisResult;
  onBack: () => void;
  language: Language;
}

export default function ResultDisplay({ result, onBack, language }: ResultDisplayProps) {
  const t = translations[language];
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const isZh = language === 'zh';
  
  // Safe extraction with fallbacks to avoid white-screen crashes
  if (!result) {
    console.error("[ResultDisplay] No result provided");
    return <div className="text-center p-20 text-slate-500">Error: No result found.</div>;
  }
  
  const score = typeof result.score === 'number' && !isNaN(result.score) ? Math.max(0, Math.min(100, result.score)) : 0;
  const breakdown = result.match_breakdown || { skills: 0, experience: 0, tools: 0 };
  const summary = result.summary || (isZh ? "分析完成" : "Analysis complete.");

  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    const controls = animate(0, score, {
      duration: 2,
      ease: "easeOut",
      delay: 0.5,
      onUpdate(value) {
        setDisplayScore(Math.round(value));
      }
    });
    return () => controls.stop();
  }, [score]);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 85) return "text-indigo-600";
    if (score >= 75) return "text-emerald-500";
    if (score >= 60) return "text-amber-500";
    return "text-rose-500";
  };

  const getBadgeStyles = (score: number) => {
    if (score >= 85) {
      return {
        bg: "bg-indigo-50",
        border: "border-indigo-100",
        dot: "bg-indigo-500",
        text: "text-indigo-700",
        shadow: "shadow-[0_0_20px_rgba(99,102,241,0.3)]",
        aura: "from-indigo-400/20 to-indigo-600/5"
      };
    } else if (score >= 75) {
      return {
        bg: "bg-emerald-50",
        border: "border-emerald-100",
        dot: "bg-emerald-500",
        text: "text-emerald-700",
        shadow: "shadow-[0_0_20px_rgba(16,185,129,0.3)]",
        aura: "from-emerald-400/20 to-emerald-600/5"
      };
    } else if (score >= 60) {
      return {
        bg: "bg-amber-50",
        border: "border-amber-100",
        dot: "bg-amber-500",
        text: "text-amber-800",
        shadow: "shadow-[0_0_20px_rgba(245,158,11,0.3)]",
        aura: "from-amber-400/20 to-amber-600/5"
      };
    } else {
      return {
        bg: "bg-rose-50",
        border: "border-rose-100",
        dot: "bg-rose-500",
        text: "text-rose-700",
        shadow: "shadow-[0_0_20px_rgba(244,63,94,0.3)]",
        aura: "from-rose-400/20 to-rose-600/5"
      };
    }
  };

  const badgeStyles = getBadgeStyles(score);

  const getDecisionText = (score: number) => {
    if (score >= 85) return language === 'zh' ? '强烈建议投递' : 'Strongly Recommended';
    if (score >= 75) return language === 'zh' ? '推荐投递' : 'Recommended Match';
    if (score >= 60) return language === 'zh' ? '建议改善后投递' : 'Improve & Apply';
    return language === 'zh' ? '不建议投递' : 'Not Recommended';
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.6, ease: [0.215, 0.61, 0.355, 1] }
    }
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="max-w-4xl mx-auto space-y-8 pb-20 relative px-4"
    >
      {/* Control Bar */}
      <motion.div variants={itemVariants} className="flex items-center justify-between z-20 relative">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl hover:border-slate-300 transition-all font-bold text-sm text-slate-600 shadow-sm active:scale-95"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          {t.backToSearch}
        </button>
      </motion.div>

      <div className="space-y-12 pb-12">
        {/* Hero Section Container */}
        <motion.div 
          variants={itemVariants}
          className="relative group p-0"
        >
          {/* Static Environment Glow to prevent GPU crash */}
          <div 
            className={`absolute -inset-20 rounded-full -z-20 bg-gradient-to-br ${badgeStyles.aura} opacity-10 blur-3xl`}
          />
          
          <div className="bg-white rounded-[4rem] p-8 md:p-20 shadow-[0_0_80px_rgba(0,0,0,0.03)] border border-slate-50 relative z-10 transition-all duration-700 hover:shadow-indigo-500/5 flex flex-col items-center">
            {/* Design accents */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-slate-50/50 rotate-45 translate-x-40 -translate-y-40 -z-10 opacity-30" />
            
            <div className="flex flex-col items-center text-center w-full">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
                className={`inline-flex items-center gap-3 px-8 py-3 ${badgeStyles.bg} rounded-full border ${badgeStyles.border} mb-16 shadow-sm`}
              >
                <div className="relative flex h-4 w-4 items-center justify-center">
                  <motion.span 
                    animate={{ scale: [1, 1.8, 1], opacity: [0.2, 0.6, 0.2] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    className={`absolute inline-flex h-full w-full rounded-full ${badgeStyles.dot}`}
                  />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${badgeStyles.dot}`} />
                </div>
                <span className={`text-base font-black ${badgeStyles.text} tracking-tight`}>{getDecisionText(result.score)}</span>
              </motion.div>

              {/* Big Score with Tide Breathing Aura */}
              <div className="relative mb-4 flex justify-center items-center h-64 w-64 md:h-96 md:w-96">
                
                {/* Number Background Glow (Aura) */}
                <motion.div 
                  className={`absolute -inset-16 md:-inset-28 rounded-full -z-20 blur-[50px] md:blur-[80px] ${getScoreColorClass(score)}`}
                  style={{ background: 'radial-gradient(circle at center, currentColor 0%, transparent 65%)' }}
                  animate={{ 
                    opacity: [0.05, 0.4, 0.05],
                    scale: [1, 1.25, 1]
                  }}
                  transition={{ 
                    duration: 6, 
                    repeat: Infinity, 
                    ease: "easeInOut"
                  }}
                />

                {/* Bracelet Breathing Ring (Tide Effect) */}
                <motion.svg 
                  className="absolute inset-0 w-full h-full z-10 overflow-visible pointer-events-none origin-center"
                  viewBox="0 0 100 100"
                  animate={{ 
                    scale: [1, 1.15, 1],
                    opacity: [0.0, 0.5, 0.0]
                  }}
                  transition={{ 
                    duration: 6, 
                    repeat: Infinity, 
                    ease: "easeInOut"
                  }}
                >
                  <motion.circle
                    cx="50" cy="50" r="43"
                    fill="none" 
                    stroke="currentColor" 
                    strokeLinecap="round"
                    strokeDasharray="0 3.377" 
                    className={`${getScoreColorClass(score)}`}
                    animate={{ strokeWidth: [0.8, 3, 0.8] }}
                    transition={{ 
                      duration: 6, 
                      repeat: Infinity, 
                      ease: "easeInOut" 
                    }}
                  />
                </motion.svg>

                {/* Main Progress Ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90 z-20 overflow-visible" viewBox="0 0 100 100">
                  {/* Background Track */}
                  <circle
                    cx="50" cy="50" r="43"
                    fill="none" stroke="#F1F5F9" strokeWidth="3"
                  />
                  {/* Progress Line */}
                  <motion.circle
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: score / 100 }}
                    transition={{ duration: 2.5, ease: "easeOut", delay: 0.5 }}
                    cx="50" cy="50" r="43"
                    fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"
                    className={`${getScoreColorClass(score)} drop-shadow-[0_0_8px_currentColor]`}
                  />
                </svg>

                <div className="flex flex-col items-center z-30">
                  <motion.div 
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ 
                      scale: 1,
                      opacity: 1 
                    }}
                    transition={{ 
                      type: "spring", stiffness: 200, damping: 15, delay: 0.5
                    }}
                    className={`text-[120px] md:text-[180px] font-black leading-none tracking-tighter ${getScoreColorClass(score)} drop-shadow-2xl`}
                  >
                    <motion.span>{displayScore}</motion.span>
                  </motion.div>
                </div>
              </div>

              <motion.div 
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-slate-500 font-bold text-base md:text-xl tracking-[0.6em] uppercase mt-4 mb-24 opacity-80 flex items-center gap-2 drop-shadow-sm whitespace-nowrap"
              >
                <Sparkles size={20} className="text-indigo-400" />
                {t.matchScore}
              </motion.div>

              <motion.p 
                variants={itemVariants}
                className="text-slate-500 font-medium leading-relaxed max-w-2xl mb-12 text-lg md:text-xl px-12 italic border-l-4 border-slate-100 py-3 sm:border-l-0"
              >
                "{result.summary || 'Analysis complete.'}"
              </motion.p>

              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-3 text-slate-500 text-sm font-bold bg-slate-50 px-8 py-4 rounded-2xl border border-slate-100 shadow-inner cursor-default"
              >
                <ShieldAlert size={18} className="text-slate-400" />
                {t.confidence}: 
                <span className={`px-2 py-0.5 rounded-md ${result.confidence === 'High' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {result.confidence === 'High' ? t.confidenceHigh : t.confidenceMed}
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Match Analysis Section - Restored to Horizontal Bars */}
        <motion.div 
          variants={itemVariants} 
          className="bg-white rounded-[4rem] p-10 md:p-20 shadow-[0_4px_40px_rgba(0,0,0,0.02)] border border-slate-100/50 relative"
        >
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-16 gap-6">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
                  <Target size={32} />
                </div>
                <div>
                  <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{t.matchAnalysis}</h3>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Breakdown of your profile vs requirement</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-12">
              {[
                { label: t.skills, value: breakdown.skills, color: "from-indigo-600 to-indigo-400", icon: <Target size={20} /> },
                { label: t.experience, value: breakdown.experience, color: "from-slate-900 to-slate-700", icon: <CheckCircle2 size={20} /> },
                { label: t.tools, value: breakdown.tools, color: "from-indigo-400 to-indigo-300", icon: <Lightbulb size={24} /> },
              ].map((item, idx) => {
                const safeValue = typeof item.value === 'number' && !isNaN(item.value) ? item.value : 0;
                return (
                <div key={item.label} className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-300">{item.icon}</span>
                      <span className="text-lg font-black text-slate-700 tracking-wide uppercase">{item.label}</span>
                    </div>
                    <span className="text-3xl font-black text-slate-900 tabular-nums">{safeValue}%</span>
                  </div>
                  <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden p-1.5 shadow-inner border border-slate-200/50">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${safeValue}%` }}
                      transition={{ duration: 1.5, ease: "circOut", delay: 1 + (idx * 0.2) }}
                      className={`h-full bg-gradient-to-r ${item.color} rounded-full relative group`}
                    >
                      <div className="absolute inset-x-0 top-0 h-1/2 bg-white/20 rounded-full" />
                    </motion.div>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </motion.div>

        {/* Insights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <motion.div variants={itemVariants}>
            <InsightBlock 
              title={t.strengths} 
              icon={<CheckCircle2 size={24} className="text-emerald-500" />}
              items={result.strengths}
              borderColor="border-emerald-100"
              bgColor="bg-emerald-50/30"
              itemIcon={<div className="w-5 h-5 bg-emerald-500 text-white rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black mt-0.5 shadow-lg shadow-emerald-500/20">✓</div>}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <InsightBlock 
              title={t.gaps} 
              icon={<AlertCircle size={24} className="text-rose-500" />}
              items={result.gaps}
              borderColor="border-rose-100"
              bgColor="bg-rose-50/30"
              itemIcon={<div className="w-5 h-5 bg-rose-500 text-white rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black mt-0.5 shadow-lg shadow-rose-500/20">!</div>}
            />
          </motion.div>
        </div>

        {/* Actionable Suggestions */}
        <motion.div variants={itemVariants} className="space-y-8">
          <div className="flex items-center justify-between px-2">
            <h4 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-4">
              <span className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-xl shadow-xl shadow-indigo-100">💡</span>
              {t.suggestions}
            </h4>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            {Array.isArray(result.suggestions) && result.suggestions.map((s, idx) => (
              <div 
                key={idx}
                className="bg-white rounded-[2.5rem] p-8 md:p-12 border border-slate-100 shadow-lg group relative overflow-hidden transition-all hover:scale-[1.01]"
              >
                {/* Visual marker */}
                <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-8 mb-8">
                  <div className="flex items-center gap-6">
                    <div className="flex-shrink-0 w-14 h-14 rounded-[1.2rem] bg-slate-900 text-white flex items-center justify-center font-black text-2xl shadow-xl shadow-slate-200">
                      {idx + 1}
                    </div>
                    <h5 className="font-black text-slate-900 text-lg md:text-xl tracking-tight leading-snug">
                      {s.issue}
                    </h5>
                  </div>
                  <button 
                    onClick={() => handleCopy(s.action, idx)}
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-slate-50 text-slate-600 hover:bg-slate-900 hover:text-white transition-all rounded-2xl text-sm font-bold w-full md:w-auto active:scale-95 shadow-sm"
                  >
                    {copiedIndex === idx ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    {t.copyAction}
                  </button>
                </div>
                
                <div className="md:pl-20 space-y-6">
                  <p className="text-slate-400 font-medium italic leading-relaxed border-l-2 border-indigo-100 pl-6 text-base">
                    "{s.reason}"
                  </p>
                  <div className="bg-indigo-50/50 p-8 rounded-[2rem] text-slate-900 relative">
                    <Sparkles size={20} className="absolute top-4 right-4 text-indigo-200" />
                    <p className="font-black text-base md:text-lg leading-relaxed">{s.action}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Keyword Matrix */}
        <motion.div 
          variants={itemVariants} 
          className="bg-white rounded-[4rem] p-12 md:p-20 text-slate-900 relative overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.02)] border border-slate-100 group/matrix"
        >
          {/* Enhanced Matrix Background - Soft Colors (Static to prevent GPU crashes) */}
          <div 
            className="absolute -top-64 -right-64 w-[600px] h-[600px] bg-indigo-50/50 rounded-full blur-3xl pointer-events-none" 
          />
          
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-20 gap-8">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm">
                  <FileText size={32} className="text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-3xl font-black tracking-tight">{t.keywords}</h4>
                  <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">Detailed ATS keyword optimization scan</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="px-5 py-2 bg-emerald-50 border border-emerald-100 rounded-full text-emerald-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  ATS Friendly
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
              <div className="space-y-10 group/matched">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-8 bg-emerald-400 rounded-full" />
                  <p className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">{t.matchedKeywords}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {Array.isArray(result.keyword_match?.matched) && result.keyword_match.matched.slice(0, 30).map((k, i) => (
                    <div 
                      key={k} 
                      className="px-5 py-3 bg-slate-50 text-emerald-600 font-bold rounded-2xl border border-slate-100 transition-all cursor-default flex items-center gap-2 group/key hover:scale-110 hover:bg-white hover:border-emerald-300 hover:shadow-xl"
                    >
                      <CheckCircle2 size={12} className="opacity-40 group-hover/key:opacity-100 transition-opacity" />
                      {k}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-10 group/missing">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-8 bg-slate-300 rounded-full" />
                  <p className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">{t.missingKeywords}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {Array.isArray(result.keyword_match?.missing) && result.keyword_match.missing.slice(0, 30).map((k, i) => (
                    <div 
                      key={k} 
                      className="px-5 py-3 bg-slate-50 text-slate-400 font-bold rounded-2xl border border-slate-100 transition-all cursor-default flex items-center gap-2 group/key hover:scale-110 hover:bg-white hover:border-slate-300 hover:shadow-xl"
                    >
                      <AlertCircle size={12} className="opacity-20 group-hover/key:opacity-100 transition-opacity" />
                      {k}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function InsightBlock({ title, icon, items, borderColor, bgColor = "bg-white", itemIcon }: any) {
  return (
    <div className={`${bgColor} backdrop-blur-md border ${borderColor} rounded-[3rem] p-10 overflow-hidden h-full shadow-lg transition-all hover:shadow-2xl hover:-translate-y-1 group/block`}>
      <h5 className="text-sm font-black flex items-center gap-3 mb-8 text-slate-900 uppercase tracking-[0.2em] group-hover/block:translate-x-1 transition-transform">
        <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-50">{icon}</div>
        {title}
      </h5>
      <ul className="space-y-4">
        {Array.isArray(items) && items.slice(0, 15).map((item: string, i: number) => (
          <li 
            key={i} 
            className="flex gap-4 text-sm text-slate-600 font-bold leading-relaxed items-start group/item"
          >
            <div className="transition-transform group-hover/item:scale-125">
              {itemIcon || <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 mt-2.5 shadow-md flex" />}
            </div>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

