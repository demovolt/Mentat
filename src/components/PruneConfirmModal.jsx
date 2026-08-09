import { useEffect } from 'react';

export default function PruneConfirmModal({ worktrees, onConfirm, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-96 bg-[#161616] border border-[#2a2a2a] rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[13px] font-semibold text-white mb-1">Удалить воркфри смёрженных веток</h2>
        <p className="text-[11px] text-[#555] mb-4">Эти ветки удалены на удалённом репозитории</p>

        <ul className="space-y-1 mb-5 max-h-48 overflow-y-auto">
          {worktrees.map((wt) => {
            const branch = wt.branch ? wt.branch.replace('refs/heads/', '') : wt.path;
            return (
              <li key={wt.path} className="flex items-center gap-2 text-[12px] text-[#ccc] bg-[#1a1a1a] rounded-lg px-3 py-1.5">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-[#444] shrink-0">
                  <circle cx="5" cy="3" r="1.5" />
                  <circle cx="5" cy="13" r="1.5" />
                  <circle cx="11" cy="5" r="1.5" />
                  <line x1="5" y1="4.5" x2="5" y2="11.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M5 4.5 Q5 8 11 6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
                <span className="truncate">{branch}</span>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-[#2a2a2a] text-[#666] hover:text-white hover:border-[#444] text-[13px] transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-[#7f1d1d] hover:bg-[#991b1b] text-[#fca5a5] text-[13px] font-medium transition-colors"
          >
            Удалить ({worktrees.length})
          </button>
        </div>
      </div>
    </div>
  );
}
