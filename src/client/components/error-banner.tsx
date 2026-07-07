import { useWorkflow } from "../context";

export function ErrorBanner() {
  const { error, clearError } = useWorkflow();
  if (!error) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-danger-tint border-b border-border text-danger text-xs shrink-0">
      <span>{error}</span>
      <button onClick={clearError} className="bg-transparent border-none text-danger text-lg cursor-pointer px-1">&times;</button>
    </div>
  );
}
