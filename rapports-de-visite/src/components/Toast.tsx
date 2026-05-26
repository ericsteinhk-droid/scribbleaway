import type { ToastMessage } from '../types';

interface Props {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export default function Toast({ toasts, onRemove }: Props) {
  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-xs">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onRemove(t.id)}
          className={`flex items-start gap-2 rounded-lg px-4 py-3 shadow-lg text-sm text-left w-full ${
            t.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <span className="text-white/70 text-xs mt-0.5">✕</span>
        </button>
      ))}
    </div>
  );
}
