import ActionBtn from './ActionBtn.jsx';
import PipelineOutput from './PipelineOutput.jsx';

export default function StepCommit({ commitMsg, commitRef, running, output, error, isError, onChange, onCommit }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-[#888]">Сообщение коммита:</p>
      <textarea
        ref={commitRef}
        value={commitMsg}
        onChange={(e) => onChange(e.target.value)}
        placeholder="feat: добавить новую функцию"
        rows={3}
        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[14px] text-white placeholder-[#444] focus:outline-none focus:border-[#7c3aed] resize-none font-mono"
      />
      <ActionBtn onClick={onCommit} disabled={running || !commitMsg.trim()} primary>
        {running ? 'Коммичу…' : 'Commit'}
      </ActionBtn>
      <PipelineOutput text={error || output} isError={isError} />
    </div>
  );
}
