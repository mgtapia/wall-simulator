'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reemplazo del confirm() del navegador, con el estilo del hub.
 *
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   if (await confirm({ title: '¿Regenerar?', message: 'Pisa las que ya están.', confirmLabel: 'Regenerar' })) { ... }
 *   ...
 *   return (<>{dialog} ...</>);
 *
 * Opciones: title, message, confirmLabel ('Aceptar'), cancelLabel ('Cancelar'), danger (botón rojo).
 */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-md border border-line bg-panel p-5 shadow-2xl">
        {title && <h2 className="mb-2 font-sans text-base font-semibold text-white">{title}</h2>}
        {message && <p className="font-mono text-[11px] leading-relaxed text-sub">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-line px-3 py-1.5 font-mono text-[11px] text-sub transition-colors hover:text-white"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${danger ? 'border-error/50 bg-error/15 text-error hover:bg-error/25' : 'border-primary/50 bg-primary/15 text-glow hover:bg-primary/25'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useConfirm() {
  const [state, setState] = useState(null); // { opts, resolve }

  const confirm = useCallback((opts = {}) => new Promise((resolve) => setState({ opts, resolve })), []);

  const close = useCallback((result) => {
    setState((s) => { s?.resolve(result); return null; });
  }, []);

  const dialog = (
    <ConfirmDialog
      open={!!state}
      {...(state?.opts || {})}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return { confirm, dialog };
}
