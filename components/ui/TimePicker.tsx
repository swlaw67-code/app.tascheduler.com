'use client';
// components/ui/TimePicker.tsx
// Matches the time entry pattern from CTimeSelectDlg / masked time inputs

interface Props {
  hour:       number;
  minute:     number;
  onHour:     (h: number) => void;
  onMinute:   (m: number) => void;
  military?:  boolean;
  minuteStep?: number;  // 1, 15, or 30
  className?: string;
}

export default function TimePicker({
  hour, minute, onHour, onMinute,
  military = false, minuteStep = 15, className = ''
}: Props) {
  const hours   = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from(
    { length: Math.floor(60 / minuteStep) },
    (_, i) => i * minuteStep
  );

  function hourLabel(h: number): string {
    if (military) return String(h).padStart(2, '0');
    const h12 = h % 12 || 12;
    return `${h12}${h < 12 ? ' am' : ' pm'}`;
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        className="select input-sm w-24 text-xs"
        value={hour}
        onChange={e => onHour(+e.target.value)}
      >
        {hours.map(h => (
          <option key={h} value={h}>{hourLabel(h)}</option>
        ))}
      </select>
      <span className="text-[var(--text-muted)] text-xs">:</span>
      <select
        className="select input-sm w-16 text-xs"
        value={minute}
        onChange={e => onMinute(+e.target.value)}
      >
        {minutes.map(m => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
    </div>
  );
}
