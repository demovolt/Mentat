export default function ActionBtn({ onClick, disabled, primary, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-1.5 rounded-lg text-[14px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white'
          : 'border border-[#2a2a2a] text-[#888] hover:text-[#ccc] hover:border-[#444]'
      }`}
    >
      {children}
    </button>
  );
}
