import { useWorkflow } from "../../context";

interface Props {
  id: string;
  isInput?: boolean;
  onToggleInput?: (value: boolean) => void;
}

export function NodeToolbar({ id, isInput, onToggleInput }: Props) {
  const { deleteNode } = useWorkflow();

  return (
    <div class="node-toolbar">
      {onToggleInput && (
        <button
          class={`node-toolbar__btn ${isInput ? "node-toolbar__btn--active" : ""}`}
          onClick={() => onToggleInput(!isInput)}
          data-tooltip={isInput ? "This node's value can be overridden via API" : "Mark as API input — allows overriding this value when calling the workflow via API"}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          <span>Input</span>
        </button>
      )}
      <button
        class="node-toolbar__btn node-toolbar__btn--danger"
        onClick={() => deleteNode(id)}
        data-tooltip="Delete node"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}
