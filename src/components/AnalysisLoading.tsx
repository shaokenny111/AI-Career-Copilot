import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Brain, Cpu, Database, Binary, Zap } from "lucide-react";
import { Language, translations } from "../translations";

export default function AnalysisLoading({ language }: { language: Language }) {
  const t = translations[language];
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % t.loadingTexts.length);
    }, 2500);
    
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [t.loadingTexts.length]);

  const icons = [
    <Brain className="text-indigo-600" size={40} />,
    <Cpu className="text-indigo-500" size={40} />,
    <Database className="text-indigo-400" size={40} />,
    <Binary className="text-indigo-300" size={40} />,
    <Zap className="text-indigo-600" size={40} />
  ];

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="relative w-64 h-64 mb-16">
        {/* Animated Background Rings */}
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.1, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 border-2 border-dashed border-indigo-100 rounded-full"
        />
        <motion.div
          animate={{ rotate: -360, scale: [1, 0.9, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute inset-6 border-2 border-dashed border-indigo-200/50 rounded-full"
        />
        
        {/* Core Pulsing Breathing Light (Static bounds to prevent GPU crash) */}
        <div 
          className="absolute inset-16 bg-indigo-600/10 rounded-[3rem] blur-[50px] z-0" 
        />
        
        {/* Central Icon Container */}
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ scale: 0.2, opacity: 0, rotate: -90 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.5, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
              className="bg-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(79,70,229,0.15)] border border-slate-100 z-10"
            >
              {icons[currentStep % icons.length]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Orbiting Elements */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ rotate: 360 }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0"
          >
            <div 
              className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.4)]"
              style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '-4px',
                opacity: (i + 1) / 8
              }} 
            />
          </motion.div>
        ))}
      </div>

      <div className="text-center space-y-8 max-w-md">
        <div className="space-y-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-10 flex items-center justify-center"
            >
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                {t.loadingTexts[currentStep]}
              </h3>
            </motion.div>
          </AnimatePresence>
          <div className="flex gap-2 justify-center">
            {t.loadingTexts.map((_, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={{ 
                  width: currentStep === i ? 24 : 8,
                  backgroundColor: currentStep === i ? "#4F46E5" : "#E2E8F0"
                }}
                className="h-1.5 rounded-full"
              />
            ))}
          </div>
        </div>
        
        <div className="flex flex-col items-center gap-4">
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest animate-pulse">
            {language === 'zh' ? '深度分析执行中' : 'AI Analysis in Progress'}
          </p>
          <div className="px-6 py-2 bg-slate-50 border border-slate-100 rounded-full text-xs font-bold text-slate-500 flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
              {language === 'zh' ? '预计' : 'Expected'}: ~10s
            </span>
            <div className="w-px h-3 bg-slate-200" />
            <span className="text-indigo-600">
              {language === 'zh' ? '已用时' : 'Elapsed'}: {elapsed}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

