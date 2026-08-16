export default function PipelineOutput({ text, isError }) {
  if (!text) return null;
  return (
    <pre className={`mt-3 p-2 rounded text-[14px] font-mono max-h-24 overflow-y-auto bg-[#0a0a0a] border border-[#1c1c1c] whitespace-pre-wrap break-all ${isError ? 'text-[#f87171]' : 'text-[#888]'}`}>
      {text}
    </pre>
  );
}
