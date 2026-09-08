import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

type Props = {
  name: string;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
  compact?: boolean;
  onSave: (name: string) => void;
};

export default function InstanceRenameField({
  name,
  disabled,
  pending,
  className = "",
  compact,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  useEffect(() => {
    setValue(name);
  }, [name]);

  const commit = () => {
    const next = value.trim().replace(/\s+/g, " ");
    setEditing(false);
    if (!next || next === name) {
      setValue(name);
      return;
    }
    onSave(next);
  };

  if (editing && !disabled) {
    return (
      <input
        aria-label="Novo nome da instância"
        value={value}
        autoFocus
        maxLength={80}
        disabled={pending}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
        }}
        className={
          compact
            ? `h-6 w-[9.5rem] rounded-md border px-1.5 text-[11px] font-bold outline-none ${className}`
            : `h-8 w-full rounded-lg border px-2 text-sm font-semibold outline-none ${className}`
        }
        style={{ background: "#141414", borderColor: "#25D36655", color: "#fff" }}
      />
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className}`}>
      <span className="truncate">{name}</span>
      {!disabled && (
        <button
          type="button"
          aria-label={`Renomear ${name}`}
          title="Renomear"
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="inline-flex items-center justify-center rounded p-0.5 opacity-70 hover:opacity-100"
          style={{ color: "#888" }}
        >
          <Pencil className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </button>
      )}
    </span>
  );
}
