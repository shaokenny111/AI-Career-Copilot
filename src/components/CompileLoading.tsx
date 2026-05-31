// ============================================================================
// CompileLoading —— 编译/分析过程的加载动画（纯展示）
// ----------------------------------------------------------------------------
// 从 V1.0 AnalysisLoading 抽出的纯视觉版本：保留旋转环、轨道粒子、核心光晕、
// 中心图标轮播；剥掉 translations 依赖与 V1.0 旧逻辑（step 文案、计时器）。
// 仅接收一个可选 message 文案 prop，供 Phase 5/6 编译管线直接复用。
// ============================================================================

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Cpu, Database, Binary, Zap } from "lucide-react";

interface CompileLoadingProps {
  /** 主提示文案（如"正在编译投递版…"）。不传则用默认值。 */
  message?: string;
  /** 副提示文案（小字）。不传则用默认值。 */
  subMessage?: string;
}

const ICONS = [
  <Brain className="text-indigo-600" size={40} />,
  <Cpu className="text-indigo-500" size={40} />,
  <Database className="text-indigo-400" size={40} />,
  <Binary className="text-indigo-300" size={40} />,
  <Zap className="text-indigo-600" size={40} />,
];

export default function CompileLoading({
  message = "AI 正在处理…",
  subMessage = "请稍候",
}: CompileLoadingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % ICONS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="relative mb-16 h-64 w-64">
        {/* 旋转虚线环 */}
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.1, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-100"
        />
        <motion.div
          animate={{ rotate: -360, scale: [1, 0.9, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute inset-6 rounded-full border-2 border-dashed border-indigo-200/50"
        />

        {/* 核心呼吸光晕（静态范围，避免 GPU 抖动） */}
        <div className="absolute inset-16 z-0 rounded-[3rem] bg-indigo-600/10 blur-[50px]" />

        {/* 中心图标轮播 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ scale: 0.2, opacity: 0, rotate: -90 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.5, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
              className="z-10 rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-[0_20px_50px_rgba(79,70,229,0.15)]"
            >
              {ICONS[currentStep % ICONS.length]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 轨道粒子 */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ rotate: 360 }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0"
          >
            <div
              className="h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.4)]"
              style={{
                position: "absolute",
                top: "50%",
                left: "-4px",
                opacity: (i + 1) / 8,
              }}
            />
          </motion.div>
        ))}
      </div>

      <div className="max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={message}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex h-10 items-center justify-center"
            >
              <h3 className="text-2xl font-black tracking-tight text-slate-900">
                {message}
              </h3>
            </motion.div>
          </AnimatePresence>

          {/* 进度点（纯装饰，跟随图标轮播） */}
          <div className="flex justify-center gap-2">
            {ICONS.map((_, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={{
                  width: currentStep === i ? 24 : 8,
                  backgroundColor: currentStep === i ? "#4F46E5" : "#E2E8F0",
                }}
                className="h-1.5 rounded-full"
              />
            ))}
          </div>
        </div>

        <p className="animate-pulse text-sm font-bold uppercase tracking-widest text-slate-400">
          {subMessage}
        </p>
      </div>
    </div>
  );
}
