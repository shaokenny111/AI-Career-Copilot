import { motion } from "motion/react";
import { Trash2, ChevronRight, History, ArrowLeft, Calendar, BarChart2 } from "lucide-react";
import { AnalysisResult } from "../types";
import { Language } from "../translations";

interface HistoryDashboardProps {
  history: AnalysisResult[];
  onView: (item: AnalysisResult) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onBack: () => void;
  language: Language;
}

export default function HistoryDashboard({ 
  history, 
  onView, 
  onDelete, 
  onClearAll, 
  onBack,
  language 
}: HistoryDashboardProps) {
  const isZh = language === 'zh';

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors mb-2 text-sm font-medium"
          >
            <ArrowLeft size={16} />
            {isZh ? '返回分析' : 'Back to Analysis'}
          </button>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <History size={20} />
            </div>
            {isZh ? '分析历史' : 'Analysis History'}
          </h2>
        </div>

        {history.length > 0 && (
          <button 
            onClick={onClearAll}
            className="px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-rose-100"
          >
            {isZh ? '清空全部记录' : 'Clear All History'}
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] py-24 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <History size={40} className="text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            {isZh ? '暂无历史记录' : 'No History Yet'}
          </h3>
          <p className="text-slate-500 max-w-xs mx-auto">
            {isZh ? '开始您的第一次简历分析，记录将出现在这里。' : 'Start your first resume analysis and records will appear here.'}
          </p>
          <button 
            onClick={onBack}
            className="mt-8 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
          >
            {isZh ? '立即分析' : 'Analyze Now'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {history?.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-600/5 transition-all flex flex-col md:flex-row md:items-center gap-6"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black transition-transform group-hover:scale-110 ${
                  item.score >= 85 ? 'bg-emerald-50 text-emerald-600' :
                  item.score >= 60 ? 'bg-amber-50 text-amber-600' :
                  'bg-rose-50 text-rose-600'
                }`}>
                  <span className="text-2xl">{item.score}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-60">SCORE</span>
                </div>
                
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest">
                      <Calendar size={12} />
                      {new Date(item.timestamp).toLocaleDateString(isZh ? 'zh-CN' : 'en-US')}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      item.confidence === 'High' ? 'bg-emerald-100 text-emerald-700' :
                      item.confidence === 'Medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {item.confidence} Match
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 line-clamp-1 break-words">
                    {item.summary}
                  </h4>
                  <p className="text-sm text-slate-400 line-clamp-1 opacity-70 break-words mt-1">
                    JD Preview: {item.jd}...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end md:self-center">
                <button 
                  onClick={() => onDelete(item.id)}
                  className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                  title={isZh ? '删除' : 'Delete'}
                >
                  <Trash2 size={18} />
                </button>
                <button 
                  onClick={() => onView(item)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-slate-900 font-bold rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                >
                  {isZh ? '查看详情' : 'View Details'}
                  <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
