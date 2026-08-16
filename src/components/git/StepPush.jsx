import ActionBtn from './ActionBtn.jsx';
import PipelineOutput from './PipelineOutput.jsx';

export default function StepPush({ branch, running, output, error, isError, onPush }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-[#888]">
        Отправить изменения в&nbsp;
        <span className="text-[#a78bfa]">origin/{branch}</span>
      </p>
      <code className="text-[13px] font-mono text-[#555]">git push -u origin {branch}</code>
      <ActionBtn onClick={onPush} disabled={running} primary>
        {running ? 'Pushing…' : 'Push'}
      </ActionBtn>
      <PipelineOutput text={error || output} isError={isError} />
    </div>
  );
}
