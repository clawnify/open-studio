import { Play, LogIn, Trash2 } from "lucide-react";
import { useWorkflow } from "../../context";

interface Props {
  id: string;
  isInput?: boolean;
  onToggleInput?: (value: boolean) => void;
  /** Show a "Run" button that re-executes only this node (using upstream nodes' last outputs). */
  canRerun?: boolean;
}

export function NodeToolbar({ id, isInput, onToggleInput, canRerun }: Props) {
  const { deleteNode, runNode, executing } = useWorkflow();

  return (
    <div className="node-toolbar">
      {canRerun && (
        <button
          className="node-toolbar__btn"
          onClick={() => runNode(id)}
          disabled={executing}
          data-tooltip="Run only this node (reuses upstream outputs)"
        >
          <Play size={10} strokeWidth={2.5} />
          <span>Run</span>
        </button>
      )}
      {onToggleInput && (
        <button
          className={`node-toolbar__btn ${isInput ? "node-toolbar__btn--active" : ""}`}
          onClick={() => onToggleInput(!isInput)}
          data-tooltip={isInput ? "This node's value can be overridden via API" : "Mark as API input — allows overriding this value when calling the workflow via API"}
        >
          <LogIn size={10} strokeWidth={2.5} />
          <span>Input</span>
        </button>
      )}
      <button
        className="node-toolbar__btn node-toolbar__btn--danger"
        onClick={() => deleteNode(id)}
        data-tooltip="Delete node"
      >
        <Trash2 size={10} strokeWidth={2.5} />
      </button>
    </div>
  );
}
