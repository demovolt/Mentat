import { useState, useEffect, useRef } from 'react';

const sanitize = (s) => s.replace(/\//g, '-').replace(/[^a-zA-Z0-9._-]/g, '_');

export default function NewWorktreeModal({ onCreate, onClose }) {
  const [branch, setBranch] = useState('');
  const [worktreeName, setWorktreeName] = useState('');
  const [customName, setCustomName] = useState('');
  const worktreeNameTouched = useRef(false);
  const customNameTouched = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBranchChange = (val) => {
    setBranch(val);
    const safe = sanitize(val.trim());
    if (!worktreeNameTouched.current) {
      setWorktreeName(safe);
      if (!customNameTouched.current) setCustomName(safe);
    } else if (!customNameTouched.current) {
      setCustomName(safe);
    }
  };

  const handleWorktreeNameChange = (val) => {
    worktreeNameTouched.current = true;
    setWorktreeName(val);
    if (!customNameTouched.current) setCustomName(val);
  };

  const handleCustomNameChange = (val) => {
    customNameTouched.current = true;
    setCustomName(val);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!branch.trim()) return;
    onCreate({
      branch: branch.trim(),
      worktreeName: worktreeName.trim() || undefined,
      customName: customName.trim() || undefined,
    });
  };

  const inputClass = "w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[14px] text-white placeholder-[#444] focus:outline-none focus:border-[#7c3aed] transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-80 bg-[#161616] border border-[#2a2a2a] rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[14px] font-semibold text-white mb-4">New Worktree</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[12px] text-[#666] mb-1">Branch name</label>
            <input
              ref={inputRef}
              type="text"
              value={branch}
              onChange={(e) => handleBranchChange(e.target.value)}
              placeholder="feature/my-feature"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[12px] text-[#666] mb-1">Worktree folder name</label>
            <input
              type="text"
              value={worktreeName}
              onChange={(e) => handleWorktreeNameChange(e.target.value)}
              placeholder="feature-my-feature"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[12px] text-[#666] mb-1">Mentat name</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => handleCustomNameChange(e.target.value)}
              placeholder="feature-my-feature"
              className={inputClass}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[#2a2a2a] text-[#666] hover:text-white hover:border-[#444] text-[14px] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!branch.trim()}
              className="flex-1 py-2 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[14px] font-medium transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
