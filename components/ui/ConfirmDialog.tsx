'use client';
// components/ui/ConfirmDialog.tsx

interface ConfirmDialogProps {
  title:     string;
  message:   string;
  onConfirm: () => void;
  onCancel:  () => void;
  danger?:   boolean;
  confirmLabel?: string;
}

export default function ConfirmDialog({
  title, message, onConfirm, onCancel, danger = false, confirmLabel = 'Confirm'
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm animate-slide-up p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0
                          ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke={danger ? '#dc2626' : '#d97706'} strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] text-sm">{title}</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className={`btn btn-sm text-white border-0 shadow-sm
                        ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
