'use client';
// components/ui/Modal.tsx
// Backdrop click does NOT close the modal — user must use Cancel/X button.
// This prevents accidental data loss when clicking outside the dialog.

import { useEffect } from 'react';

interface ModalProps {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
  size?:    'sm' | 'md' | 'lg' | 'xl';
  footer?:  React.ReactNode;
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export default function Modal({ title, onClose, children, size = 'md', footer }: ModalProps) {
  // Escape key still closes (mirrors desktop Escape behavior)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    // Backdrop — clicking it does nothing (no onClose handler)
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${SIZES[size]} animate-slide-up
                       flex flex-col max-h-[90vh]`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4
                        border-b border-[var(--border)] shrink-0">
          <h2 className="section-title">{title}</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]
                       transition-colors p-0.5 rounded"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-4 border-t border-[var(--border)] shrink-0 flex gap-3 justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
