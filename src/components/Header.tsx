import React from "react";
import { Search, History, LayoutDashboard } from "lucide-react";
import { Language, translations } from "../translations";

interface HeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  viewHistory: () => void;
  isHistoryActive: boolean;
}

export default function Header({ language, onLanguageChange, viewHistory, isHistoryActive }: HeaderProps) {
  const t = translations[language];

  React.useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const opacity = Math.max(0, 1 - currentScrollY / 150);
      const translate = - (currentScrollY / 2);
      
      const header = document.getElementById("main-header");
      if (header) {
        header.style.opacity = opacity.toString();
        header.style.transform = `translateY(${translate}px)`;
        header.style.pointerEvents = opacity < 0.1 ? 'none' : 'auto';
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header id="main-header" className="fixed top-0 left-0 right-0 z-50 px-4 py-3 md:py-6 transition-all duration-300">
      <div className="max-w-6xl mx-auto flex justify-between items-center bg-white/70 backdrop-blur-xl border border-white/40 shadow-sm p-3 md:p-4 rounded-[1.5rem] md:rounded-[2rem]">
        <div className="flex items-center gap-3 pl-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/10 cursor-pointer" onClick={() => window.location.reload()}>
            <Search className="text-white" size={20} strokeWidth={3} />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-black text-slate-900 tracking-tight leading-none text-lg">More offer</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 text-center">
              {language === 'zh' ? '职业透视' : 'Career Lens'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pr-2">
          <button 
            onClick={viewHistory}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all ${isHistoryActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600 bg-slate-50'}`}
          >
            {isHistoryActive ? <LayoutDashboard size={18} /> : <History size={18} />}
            <span className="hidden md:inline">
              {isHistoryActive 
                ? (language === 'zh' ? '返回分析' : 'Dashboard') 
                : (language === 'zh' ? '历史记录' : 'History')}
            </span>
          </button>

          <div className="flex bg-slate-100/50 p-1 rounded-xl border border-slate-200/50">
            <button 
              onClick={() => onLanguageChange("en")}
              className={`flex items-center justify-center w-12 py-2 rounded-lg transition-all text-sm font-black ${language === 'en' ? 'bg-white shadow-sm text-indigo-600 border border-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
            >
              EN
            </button>
            <button 
              onClick={() => onLanguageChange("zh")}
              className={`flex items-center justify-center w-12 py-2 rounded-lg transition-all text-sm font-black ${language === 'zh' ? 'bg-white shadow-sm text-indigo-600 border border-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
            >
              CN
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
