import { useState } from 'react';

export default function DropMenuItem({ onClick, danger, children, submenu }) {
  const [subOpen, setSubOpen] = useState(false);

  if (submenu) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <button
          onClick={(e) => e.stopPropagation()}
          className="w-full text-left px-3 py-1 text-[12px] text-[#aaa] hover:bg-[#222] hover:text-[#ccc] transition-colors flex items-center justify-between"
        >
          {children}
          <span className="text-[#555] ml-2">›</span>
        </button>
        {subOpen && (
          <div className="absolute left-full top-0 ml-1 w-36 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl py-1">
            {submenu}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1 text-[12px] transition-colors ${
        danger ? 'text-[#f87171] hover:bg-[#2a1414]' : 'text-[#aaa] hover:bg-[#222] hover:text-[#ccc]'
      }`}
    >
      {children}
    </button>
  );
}
