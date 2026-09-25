import { memo, useMemo } from 'react';
import { getFunctionRegistry } from '../../engine/functions';
import { parseSignature } from '../../pivot/signatureParser';
import { getFunctionCallContext } from '../../utils/functionCallContext';
import { useI18n } from '../../i18n/useI18n';

interface FunctionHintProps {
  /** Current editor text (a formula starting with "="). */
  value: string;
  /** Caret position in `value`. */
  caret: number;
}

/**
 * Argument hint card shown while typing inside a function call: the signature with the argument
 * under the caret highlighted, plus the function's description. Renders nothing outside a known call.
 */
export const FunctionHint = memo(function FunctionHint({ value, caret }: FunctionHintProps) {
  const { t } = useI18n();
  const hint = useMemo(() => {
    const ctx = getFunctionCallContext(value, caret);
    if (!ctx) return null;
    const meta = getFunctionRegistry().get(ctx.name);
    if (!meta) return null;
    const { args } = parseSignature(meta.signature);
    // Past the last parameter, a trailing variadic parameter keeps absorbing arguments
    let active = ctx.argIndex;
    if (active >= args.length)
      active = args.length > 0 && args[args.length - 1].variadic ? args.length - 1 : -1;
    return { name: meta.name, description: meta.description, args, active };
  }, [value, caret]);

  if (!hint) return null;
  const activeArg = hint.active >= 0 ? hint.args[hint.active] : null;

  return (
    <div
      // Re-key per function so the card re-enters only when the function changes, not per keystroke
      key={hint.name}
      className="function-hint glass-surface rounded-xl animate-fade-in-scale"
      data-testid="function-hint"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="function-hint-signature">
        <span className="function-hint-name">{hint.name}</span>
        <span className="function-hint-punct">(</span>
        {hint.args.map((arg, i) => (
          <span key={i}>
            {i > 0 && <span className="function-hint-punct">, </span>}
            <span className="function-hint-arg" data-active={i === hint.active || undefined}>
              {arg.required ? arg.name : `[${arg.name}]`}
              {arg.variadic && <span className="function-hint-punct">, …</span>}
            </span>
          </span>
        ))}
        <span className="function-hint-punct">)</span>
      </div>
      {activeArg && (
        <div key={hint.active} className="function-hint-current">
          <span className="function-hint-chip">{activeArg.name}</span>
          {!activeArg.required && (
            <span className="function-hint-optional">{t('chrome.functionHint.optional')}</span>
          )}
        </div>
      )}
      <div className="function-hint-description">{hint.description}</div>
    </div>
  );
});
