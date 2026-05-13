'use client';
// components/ui/ColorPicker.tsx
// Opens upward to avoid clipping inside modals.
// Converts between CSS hex and Windows COLORREF integer.

import { useState, useRef, useEffect } from 'react';
import { colorRefToHex, hexToColorRef } from '@/lib/types';

interface Props {
  value:    number;   // COLORREF integer
  onChange: (val: number) => void;
  label?:   string;
}

const PRESET_COLORS = [
  '#ff0000', '#ff6600', '#ff9900', '#ffcc00', '#ffff00',
  '#99ff00', '#00cc00', '#00ff99', '#00ffff', '#0099ff',
  '#0000ff', '#6600ff', '#cc00ff', '#ff00cc', '#ff0099',
  '#ffffff', '#cccccc', '#999999', '#666666', '#333333',
  '#000000', '#663300', '#996633', '#cc9966', '#ffcc99',
  '#ffcccc', '#ccffcc', '#ccccff', '#ffffcc', '#ccffff',
];

export default function ColorPicker({ value, onChange, label }: Props) {
  const [open, setOpen]   = useState(false);
  const [hex, setHex]     = useState(colorRefToHex(value));
  const containerRef      = useRef<HTMLDivElement>(null);

  useEffect(() => { setHex(colorRefToHex(value)); }, [value]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function selectColor(cssHex: string) {
    setHex(cssHex);
    onChange(hexToColorRef(cssHex));
    setOpen(false);
  }

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setHex(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      onChange(hexToColorRef(val));
    }
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      {label && <p className="label mb-1">{label}</p>}

      {/* Color swatch button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2.5 py-1.5 border border-[var(--border)]
                   rounded-md bg-white hover:border-[var(--border-strong)]
                   transition-colors shadow-sm"
        title="Pick a color"
      >
        <span className="w-5 h-5 rounded border border-black/10"
              style={{ background: colorRefToHex(value) }} />
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          {colorRefToHex(value).toUpperCase()}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {/* Dropdown — opens UPWARD to avoid clipping inside modals */}
      {open && (
        <div className="absolute left-0 bottom-full mb-1 z-[100] bg-white
                        border border-[var(--border)] rounded-xl shadow-xl p-3 w-56 animate-fade-in">
          {/* Presets grid */}
          <div className="grid grid-cols-6 gap-1 mb-3">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => selectColor(c)}
                className="w-7 h-7 rounded border-2 transition-transform hover:scale-110"
                style={{
                  background:  c,
                  borderColor: c === hex ? 'var(--brand-600)' : 'transparent',
                  outline:     c === '#ffffff' ? '1px solid #e2e8f0' : undefined,
                }}
                title={c}
              />
            ))}
          </div>

          {/* Native color input + hex field */}
          <div className="border-t border-[var(--border)] pt-2.5 flex items-center gap-2">
            <input
              type="color"
              value={hex}
              onChange={e => selectColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 p-0"
              title="Custom color"
            />
            <input
              type="text"
              value={hex}
              onChange={handleHexInput}
              className="input input-sm flex-1 font-mono text-xs uppercase"
              maxLength={7}
              placeholder="#000000"
            />
          </div>
        </div>
      )}
    </div>
  );
}
