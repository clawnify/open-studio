import { useWorkflow } from "../context";

export function ErrorBanner() {
  const { error, clearError } = useWorkflow();
  if (!error) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-b border-red-200 text-red-600 text-xs shrink-0">
      <span>{error}</span>
      <button onClick={clearError} className="bg-transparent border-none text-red-400 text-lg cursor-pointer px-1">&times;</button>
    </div>
  );
}
