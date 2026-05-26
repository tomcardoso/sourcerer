export default function Toggle({ checked, onChange, label, hint, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`sv-toggle-row${hint ? ' sv-toggle-row--has-hint' : ''}`}>
      <button
        type="button"
        className={`sv-toggle${checked ? ' sv-toggle--on' : ''}${disabled ? ' sv-toggle--disabled' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        aria-pressed={checked}
        disabled={disabled}
      >
        <span className="sv-toggle-knob" />
        <span className="sv-toggle-label">{checked ? 'ON' : 'OFF'}</span>
      </button>
      <div>
        <div className="sv-toggle-text">{label}</div>
        {hint && <div className="sv-hint sv-hint--inline">{hint}</div>}
      </div>
    </div>
  );
}
