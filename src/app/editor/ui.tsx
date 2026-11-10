'use client';

import { RotateCcw } from 'lucide-react';
import {
  forwardRef, useState, type ButtonHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { isHexColor, parseColor, toHex } from '@/core/render/color';
import { useLayout } from './layoutTier';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'default', size = 'md', className, ...rest },
  ref,
) {
  // compact tier (phones): every text button becomes a 44 px touch target
  const compact = useLayout().tier === 'compact';
  return (
    <button
      ref={ref}
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        compact ? 'h-11 px-3.5 text-[14px]' : size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
        variant === 'default' && 'border border-ink-700 bg-ink-800 text-fg hover:border-ink-600 hover:bg-ink-750',
        variant === 'primary' && 'bg-accent text-accent-ink hover:bg-accent-strong',
        variant === 'ghost' && 'text-fg-muted hover:bg-ink-750 hover:text-fg',
        variant === 'danger' && 'bg-danger/90 text-white hover:bg-danger',
        className,
      )}
      {...rest}
    />
  );
});

type IconBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: 'xs' | 'sm' | 'md' | 'lg' };

const ICON_SIZE = { xs: 'h-5 w-5', sm: 'h-6 w-6', md: 'h-7 w-7', lg: 'h-11 w-11' } as const;
// compact tier: secondary icon buttons grow to 32 / 40 px; 'lg' (44 px) is for primary touch controls
const ICON_SIZE_COMPACT = { xs: 'h-8 w-8', sm: 'h-10 w-10', md: 'h-10 w-10', lg: 'h-11 w-11' } as const;

/** Icon-only button; `label` becomes the tooltip and the accessible name. */
export function IconButton({ label, active, size = 'md', className, children, ...rest }: IconBtnProps) {
  const compact = useLayout().tier === 'compact';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors',
        'disabled:pointer-events-none disabled:opacity-30',
        (compact ? ICON_SIZE_COMPACT : ICON_SIZE)[size],
        active ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:bg-ink-750 hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value, options, onChange, label, size = 'md',
}: {
  value: T;
  /** `ariaLabel` names an option whose label is only an icon. */
  options: { value: T; label: ReactNode; title?: string; ariaLabel?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const compact = useLayout().tier === 'compact';
  const big = size === 'lg' || compact;
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-ink-700 bg-ink-850 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.ariaLabel}
          title={o.title ?? o.ariaLabel}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center justify-center gap-1 rounded-[5px] font-medium transition-colors',
            big ? 'h-10 min-w-11 px-3 text-[14px]' : size === 'sm' ? 'h-6 min-w-6 px-1.5 text-[11.5px]' : 'h-7 min-w-7 px-2.5 text-[12px]',
            o.value === value ? 'bg-ink-700 text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const inputBase =
  'h-7 w-full min-w-0 rounded-md border border-ink-700 bg-ink-850 px-2 text-[12.5px] text-fg placeholder:text-fg-dim ' +
  'hover:border-ink-600 focus:border-accent focus:outline-none focus-visible:outline-none disabled:opacity-50';

export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: ReactNode; wide?: boolean }) {
  return (
    <div role="group" aria-label={label} className={cx('flex min-w-0 flex-col gap-1', wide && 'col-span-2')}>
      <span className="text-[11.5px] text-fg-dim">{label}</span>
      {children}
      {hint && <div className="text-[11px] leading-snug text-fg-dim">{hint}</div>}
    </div>
  );
}

export function TextInput({
  value, onChange, placeholder, mono, ariaLabel, onCommit, maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  ariaLabel?: string;
  onCommit?: () => void;
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      className={cx(inputBase, mono && 'font-mono text-[12px]')}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      spellCheck={false}
      className={cx(inputBase, 'h-auto min-h-16 resize-y py-1.5 leading-relaxed', className)}
      {...rest}
    />
  );
});

export function NumberInput({
  value, onChange, min, max, step = 1, ariaLabel, suffix, disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  suffix?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : String(value);
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (s: string) => {
    const n = Number(s);
    if (s.trim() !== '' && Number.isFinite(n)) onChange(clampV(step < 1 ? n : Math.round(n)));
  };
  return (
    <div className="relative">
      <input
        type="number"
        // on-screen keyboard: digits (+ decimal point) for non-negative fields; the default number keyboard, which
        // has a minus key on iOS, for fields that accept negative values
        inputMode={min !== undefined && min >= 0 ? (step < 1 ? 'decimal' : 'numeric') : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cx(inputBase, 'font-mono text-[12px] tabular-nums', suffix && 'pr-7')}
        value={shown}
        min={min}
        max={max}
        step={step}
        onFocus={() => {
          setDraft(String(value));
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) * step;
            const next = clampV(+(value + d).toFixed(3));
            setDraft(String(next));
            onChange(next);
          } else if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-fg-dim">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string>({
  value, onChange, options, ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={cx(inputBase, 'cursor-pointer pr-6')}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2 text-[12.5px] text-fg-muted hover:text-fg"
    >
      <span className={cx('relative h-4 w-7 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-ink-600')}>
        {/* left-0: a <button> centres its content (text-align: center), which moved the knob's static position to the middle of the track */}
        <span
          className={cx(
            'absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
      {label}
    </button>
  );
}

/** Colour picker + hex field. `value === null` means "skin default" (shown with `fallback`). */
export function ColorInput({
  value, onChange, fallback, allowNull = true, ariaLabel,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  fallback?: string;
  allowNull?: boolean;
  ariaLabel: string;
}) {
  const shown = value ?? fallback ?? '#000000';
  const [draft, setDraft] = useState<string | null>(null);
  const rgb = parseColor(shown);
  const hex6 = toHex({ ...rgb, a: 1 }, false);
  const alphaSuffix = value && value.length === 9 ? value.slice(7) : '';
  return (
    <div className="flex items-center gap-1.5">
      <label className="checker relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-ink-600" title="選擇顏色">
        <span className="absolute inset-0" style={{ background: shown }} />
        {value === null && <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[8px] leading-3 text-white">預設</span>}
        <input
          type="color"
          aria-label={ariaLabel}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={hex6}
          onChange={(e) => onChange(e.target.value + alphaSuffix)}
        />
      </label>
      <input
        type="text"
        aria-label={`${ariaLabel}（十六進位）`}
        className={cx(inputBase, 'font-mono text-[12px] uppercase')}
        placeholder={value === null ? `預設 ${(fallback ?? '').toUpperCase()}` : '#RRGGBB'}
        value={draft ?? value ?? ''}
        spellCheck={false}
        onFocus={() => setDraft(value ?? '')}
        onChange={(e) => {
          let v = e.target.value.trim();
          if (v && !v.startsWith('#')) v = `#${v}`;
          setDraft(v);
          if (isHexColor(v) && (v.length === 7 || v.length === 9)) onChange(v.toLowerCase());
        }}
        onBlur={() => {
          if (draft === '' && allowNull) onChange(null);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {allowNull && value !== null && (
        <IconButton label="還原為主題預設色" size="sm" onClick={() => onChange(null)}>
          <RotateCcw size={13} />
        </IconButton>
      )}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11.5px] font-semibold tracking-wide text-fg-muted">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-ink-600 bg-ink-800 px-1 font-mono text-[10.5px] text-fg-muted">{children}</kbd>
  );
}
