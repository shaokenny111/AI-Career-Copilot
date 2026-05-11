import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Loader2, Sparkles, X, PlusCircle, Clipboard } from "lucide-react";
import { Language, translations } from "../translations";
import { extractTextFromFile } from "../lib/gemini";

import mammoth from "mammoth";

interface InputBoxProps {
  type: 'jd' | 'resume';
  value: string;
  setValue: (v: string) => void;
  label: string;
  placeholder: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isZh: boolean;
  isUploading: 'jd' | 'resume' | null;
  setIsDragging: (v: 'jd' | 'resume' | null) => void;
  isDragging: 'jd' | 'resume' | null;
  onDrop: (e: React.DragEvent, type: 'jd' | 'resume') => void;
  handlePaste: (type: 'jd' | 'resume') => void;
  handleFile: (file: File, type: 'jd' | 'resume') => void;
  uploadError: string | null;
}

const InputBox = ({ 
  type, 
  value, 
  setValue, 
  label, 
  placeholder, 
  fileInputRef,
  isZh,
  isUploading,
  setIsDragging,
  isDragging,
  onDrop,
  handlePaste,
  handleFile,
  uploadError
}: InputBoxProps) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between px-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
        {label}
      </label>
      <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-50 px-2 py-1 rounded-md">{value.length}/8000</span>
    </div>
    
    <div 
      onDragOver={(e) => { e.preventDefault(); setIsDragging(type); }}
      onDragLeave={() => setIsDragging(null)}
      onDrop={(e) => onDrop(e, type)}
      className={`relative h-72 md:h-96 transition-all duration-300 rounded-[2.5rem] p-1 flex flex-col ${
        isDragging === type ? 'bg-indigo-50 border-2 border-indigo-400 border-dashed' : 'bg-white shadow-xl shadow-slate-200/50 border-2 border-slate-100'
      }`}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        data-type={type}
        className="w-full flex-grow p-6 pb-24 text-sm bg-transparent outline-none resize-none font-medium text-slate-700 leading-relaxed placeholder:text-slate-200 z-10"
      />
      
      {/* Upload Error Toast Overlay */}
      {uploadError && isUploading === null && type === (uploadError.includes('jd') ? 'jd' : (uploadError.includes('resume') ? 'resume' : type)) && (
        <div className="absolute top-4 left-4 right-4 bg-rose-50 border border-rose-100 p-3 rounded-2xl z-40 animate-in fade-in slide-in-from-top-2 duration-300 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
            <X size={14} />
          </div>
          <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider line-clamp-2">{uploadError.split(':::')[1] || uploadError}</p>
        </div>
      )}

      {/* Floating Action Island - Optimized for Mobile */}
      <div className="absolute bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 flex items-center justify-end gap-2 z-30">
        {value && (
          <button 
            type="button"
            onClick={() => setValue("")}
            className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl sm:rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer"
            title={isZh ? "清空" : "Clear"}
          >
            <X size={16} />
          </button>
        )}
        
        <div className="flex bg-white/90 backdrop-blur-md rounded-xl sm:rounded-2xl p-1 shadow-2xl border border-slate-200/50 items-center">
          <button 
            type="button"
            onClick={() => handlePaste(type)}
            className="flex items-center justify-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5 hover:bg-slate-50 rounded-lg sm:rounded-xl transition-all text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-slate-600 cursor-pointer"
          >
            <Clipboard size={14} className="text-indigo-500" />
            <span className="hidden sm:inline">{isZh ? '粘贴' : 'Paste'}</span>
          </button>
          
          <div className="w-[1px] h-4 bg-slate-200 self-center mx-1" />
          
          <label 
            htmlFor={`file-upload-${type}`}
            className={`flex items-center justify-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5 hover:bg-slate-50 rounded-lg sm:rounded-xl transition-all text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-slate-600 relative cursor-pointer ${isUploading === type ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {isUploading === type ? <Loader2 size={14} className="animate-spin text-indigo-500" /> : <Upload size={14} className="text-indigo-500" />}
            <span className="hidden sm:inline">{isUploading === type ? (isZh ? '正在解析' : 'Parsing') : (isZh ? '选择文件' : 'Select File')}</span>
          </label>
        </div>
      </div>

      <input 
        id={`file-upload-${type}`}
        type="file" 
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.docx,.doc,.txt,image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          console.log(`[UI] File selected for ${type}:`, file?.name);
          if (file) handleFile(file, type);
          e.target.value = '';
        }}
      />

      {!value && !isUploading && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center opacity-40 select-none">
          <PlusCircle size={56} className="text-slate-100 mb-4" />
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">{isZh ? '支持拖入 PDF / Word / 图片' : 'Drop PDF / Word / Image'}</p>
        </div>
      )}

      {/* AI Extraction Loading Overlay */}
      <AnimatePresence>
        {isUploading === type && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/95 backdrop-blur-md z-50 flex flex-col items-center justify-center rounded-[2.5rem]"
          >
            <div className="relative">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full"
              />
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 flex items-center justify-center text-indigo-600"
              >
                <Sparkles size={20} />
              </motion.div>
            </div>
            <motion.p 
              initial={{ y: 5, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-6 text-indigo-600 font-black text-sm uppercase tracking-widest"
            >
              {isZh ? 'AI 正在解析...' : 'AI Extracting...'}
            </motion.p>
            <p className="mt-2 text-slate-400 text-[10px] font-bold px-10 text-center max-w-[250px] uppercase tracking-wider">
              {isZh ? '正在利用视觉模型识别文件，请稍候' : 'Using visual AI to parse document, please hold'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
);

interface InputSectionProps {
  onAnalyze: (jd: string, resume: string) => void;
  language: Language;
  isAnalyzing: boolean;
}

export default function InputSection({ onAnalyze, language, isAnalyzing }: InputSectionProps) {
  const t = translations[language];
  const isZh = language === 'zh';
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");
  const [isUploading, setIsUploading] = useState<'jd' | 'resume' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<'jd' | 'resume' | null>(null);

  const jdFileInputRef = useRef<HTMLInputElement>(null);
  const resumeFileInputRef = useRef<HTMLInputElement>(null);

  // Global Paste Listener - Workaround for iFrame Permissions
  React.useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const targetType = activeEl?.getAttribute('data-type') as 'jd' | 'resume' | null;
      if (!targetType) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;

          setIsUploading(targetType);
          try {
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            });
            const text = await extractTextFromFile(base64, blob.type);
            if (text) {
              if (targetType === 'jd') setJd(prev => prev ? `${prev}\n${text}` : text);
              else setResume(prev => prev ? `${prev}\n${text}` : text);
            }
          } catch (err) {
            console.error("Paste image processing failed", err);
          } finally {
            setIsUploading(null);
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  const handleFile = async (file: File, type: 'jd' | 'resume') => {
    if (!file) return;
    console.log(`[UI] Starting frontend AI extraction for ${type}: ${file.name} (${file.size} bytes)`);
    setIsUploading(type);
    setUploadError(null);
    
    try {
      let text = "";

      // Handle Word Documents (.docx) locally with Mammoth
      if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
        console.log(`[UI] Mammoth extraction success. Text length: ${text.length}`);
      } else {
        // Use Gemini for PDF/Images/Text
        // 1. Read file as Base64 in browser
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // Remove the data:mimeType;base64, prefix
          };
          reader.onerror = (error) => reject(error);
        });

        // 2. Direct Call to Gemini API from browser
        text = await extractTextFromFile(base64, file.type || "application/pdf");
        console.log(`[UI] AI Text Extraction Success. Text length: ${text?.length}`);
      }
      
      if (text && text.trim().length > 0) {
        if (type === 'jd') setJd(text);
        else setResume(text);
      } else {
        throw new Error(isZh ? "未能从文件中提取出文字内容，请尝试复制粘贴或更换文件格式。" : "Failed to extract text from file. Please try copy-paste or another format.");
      }
    } catch (err: any) {
      console.error("[UI] Extraction Error:", err);
      const msg = isZh 
        ? `解析失败: ${err.message || '文件可能损坏或受保护'}` 
        : `Parsing failed: ${err.message || 'File might be corrupted or protected'}`;
      setUploadError(`${type}:::${msg}`);
      setTimeout(() => setUploadError(null), 5000);
    } finally {
      setIsUploading(null);
    }
  };

  const onDrop = (e: React.DragEvent, type: 'jd' | 'resume') => {
    e.preventDefault();
    setIsDragging(null);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, type);
  };

  const handlePaste = async (targetType: 'jd' | 'resume') => {
    try {
      // First try reading as items (for images/files)
      const items = await navigator.clipboard.read().catch(() => null);
      if (items) {
        for (const item of items) {
          if (item.types.some(type => type.startsWith('image/'))) {
            const blob = await item.getType(item.types.find(t => t.startsWith('image/'))!);
            setIsUploading(targetType);
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            });
            const text = await extractTextFromFile(base64, blob.type);
            if (text) {
              if (targetType === 'jd') setJd(prev => prev ? `${prev}\n${text}` : text);
              else setResume(prev => prev ? `${prev}\n${text}` : text);
            }
            setIsUploading(null);
            return;
          }
        }
      }
      
      // Try reading as text
      const text = await navigator.clipboard.readText();
      if (text) {
        if (targetType === 'jd') setJd(prev => prev ? `${prev}\n${text}` : text);
        else setResume(prev => prev ? `${prev}\n${text}` : text);
      }
    } catch (err: any) {
      console.error("Paste interaction failed", err);
      const isPermissionError = err.name === 'NotAllowedError' || err.message?.includes('denied') || err.message?.includes('blocked');
      
      if (isPermissionError) {
        const msg = isZh 
          ? "由于浏览器安全政策，『一键粘贴』按钮在预览窗口中被禁用。\n\n💡 请点击文本框，并直接使用键盘快捷键粘贴：\nWindows: Ctrl + V\nMac: Cmd + V" 
          : "The 'Paste' button is restricted by your browser in preview mode.\n\n💡 Please click the input area and use your keyboard: \nWindows: Ctrl + V\nMac: Cmd + V";
        alert(msg);
      } else {
        alert(isZh ? "粘贴失败，请尝试使用键盘快捷键手动粘贴。" : "Paste failed. Please use keyboard shortcuts manually.");
      }
    }
  };

  const isFormValid = jd.trim().length > 0 && resume.trim().length > 0;

  return (
    <div className="space-y-12 max-w-6xl mx-auto px-4 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <InputBox 
          type="jd" 
          value={jd} 
          setValue={setJd} 
          label={t.jdLabel} 
          placeholder={t.jdPlaceholder}
          fileInputRef={jdFileInputRef}
          isZh={isZh}
          isUploading={isUploading}
          setIsDragging={setIsDragging}
          isDragging={isDragging}
          onDrop={onDrop}
          handlePaste={handlePaste}
          handleFile={handleFile}
          uploadError={uploadError}
        />
        <InputBox 
          type="resume" 
          value={resume} 
          setValue={setResume} 
          label={t.resumeLabel} 
          placeholder={t.resumePlaceholder}
          fileInputRef={resumeFileInputRef}
          isZh={isZh}
          isUploading={isUploading}
          setIsDragging={setIsDragging}
          isDragging={isDragging}
          onDrop={onDrop}
          handlePaste={handlePaste}
          handleFile={handleFile}
          uploadError={uploadError}
        />
      </div>

      <div className="flex flex-col items-center gap-8 py-10">
        <motion.button
          whileHover={{ scale: 1.02, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAnalyze(jd, resume)}
          disabled={!isFormValid || !!isUploading || isAnalyzing}
          className={`group relative flex items-center justify-center gap-4 px-16 py-7 rounded-[2.5rem] font-black text-2xl transition-all duration-300 shadow-2xl active:scale-[0.98] disabled:opacity-50 disabled:-translate-y-0 ${
            isFormValid && !isAnalyzing
              ? "bg-slate-900 text-white hover:bg-indigo-600 hover:shadow-indigo-500/40" 
              : "bg-slate-100 text-slate-300 cursor-not-allowed"
          }`}
        >
          <div className={`absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-[2.5rem] transition-opacity duration-500 ${isFormValid && !isAnalyzing ? 'opacity-100 group-hover:opacity-0' : 'opacity-0'}`} />
          
          <span className="relative z-10 flex items-center gap-4">
            {isAnalyzing ? (
              <Loader2 className="animate-spin" size={28} />
            ) : (
              <Sparkles className="group-hover:rotate-12 transition-transform duration-500" size={28} />
            )}
            {isAnalyzing ? (isZh ? '正在深度研判' : 'Analyzing...') : t.startAnalysis}
          </span>
          
          {isFormValid && !isAnalyzing && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full animate-ping" />
          )}
        </motion.button>
      </div>
    </div>
  );
}
