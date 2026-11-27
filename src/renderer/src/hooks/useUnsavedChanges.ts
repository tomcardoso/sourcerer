import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';

/**
 * Guards against losing edits that haven't been saved yet.
 *
 * A form or field that holds unsaved text calls `useUnsavedChanges()` with a label and a save
 * function while it's dirty (and `null` once it isn't). Anything that would throw that text away
 * (switching tabs or projects in the contact drawer, closing it, opening another contact,
 * navigating elsewhere) runs through `guardUnsaved()` first, which asks the user to save, discard
 * or keep editing (see `UnsavedChangesPrompt`).
 *
 * Edits are grouped into scopes, one per contact drawer, so that a drawer only asks about its own
 * edits: the search drawer can open over a view's drawer, and the two don't discard each other's.
 */

export interface PendingEdit {
  /** What would be lost, in a few words, e.g. "New log entry". */
  label: string;
  /** Saves the edit; resolves to false if it couldn't be saved (invalid or failed). */
  save: () => Promise<boolean>;
  /**
   * Save without asking, for fields that already save when you leave them (a project's theme).
   * Only listed in the prompt if that save fails.
   */
  saveWithoutAsking?: boolean;
}

export class UnsavedScope {
  private entries = new Map<string, () => PendingEdit | null>();

  register(id: string, get: () => PendingEdit | null): () => void {
    this.entries.set(id, get);
    return () => { this.entries.delete(id); };
  }

  pending(): PendingEdit[] {
    const out: PendingEdit[] = [];
    for (const get of this.entries.values()) {
      const p = get();
      if (p) out.push(p);
    }
    return out;
  }
}

const allScopes = new Set<UnsavedScope>();

const ScopeContext = createContext<UnsavedScope | null>(null);
export const UnsavedScopeProvider = ScopeContext.Provider;

/** The scope of the nearest contact drawer, if any. */
export function useCurrentUnsavedScope(): UnsavedScope | null {
  return useContext(ScopeContext);
}

/** Creates a scope that lives as long as the calling component. */
export function useUnsavedScope(): UnsavedScope {
  const [scope] = useState(() => new UnsavedScope());
  useEffect(() => {
    allScopes.add(scope);
    return () => { allScopes.delete(scope); };
  }, [scope]);
  return scope;
}

/** Registers an unsaved edit with the nearest scope. Pass null when there's nothing unsaved. */
export function useUnsavedChanges(pending: PendingEdit | null): void {
  const scope = useContext(ScopeContext);
  const id = useId();
  const ref = useRef(pending);
  ref.current = pending;
  useEffect(() => {
    if (!scope) return;
    return scope.register(id, () => ref.current);
  }, [scope, id]);
}

export interface UnsavedRequest {
  pending: PendingEdit[];
  resolve: (proceed: boolean) => void;
}

let presenter: ((req: UnsavedRequest) => void) | null = null;
// The request the prompt is showing, so a second one waits its turn and an unmounted prompt
// (e.g. the vault locked while it was open) can't leave every later guard refusing.
let current: UnsavedRequest | null = null;

/** Called by UnsavedChangesPrompt to show requests. Returns an unsubscribe function. */
export function setUnsavedPresenter(fn: ((req: UnsavedRequest) => void) | null): () => void {
  presenter = fn;
  return () => {
    if (presenter === fn) presenter = null;
    current?.resolve(false);
  };
}

/** Which drawers to check: one, every one, or every one but one. */
export type UnsavedTarget = UnsavedScope | 'all' | { except: UnsavedScope };

function scopesOf(target: UnsavedTarget): UnsavedScope[] {
  if (target === 'all') return [...allScopes];
  if (target instanceof UnsavedScope) return [target];
  return [...allScopes].filter((s) => s !== target.except);
}

/**
 * Resolves true when it's fine to go ahead: nothing was unsaved, or the user saved or discarded
 * it. Resolves false when the user chose to keep editing.
 */
export async function confirmUnsaved(target: UnsavedTarget): Promise<boolean> {
  // One prompt at a time; a second attempt (e.g. Escape pressed again) is simply ignored.
  if (current) return false;
  const all = scopesOf(target).flatMap((s) => s.pending());
  const pending: PendingEdit[] = [];
  for (const p of all) {
    if (!p.saveWithoutAsking) { pending.push(p); continue; }
    let ok: boolean;
    try { ok = await p.save(); } catch { ok = false; }
    if (!ok) pending.push({ ...p, saveWithoutAsking: false });
  }
  if (pending.length === 0) return true;
  if (current) return false;
  if (!presenter) return window.confirm('You have unsaved changes. Discard them?');
  const show = presenter;
  return new Promise((resolve) => {
    const req: UnsavedRequest = {
      pending,
      resolve: (proceed) => {
        if (current !== req) return;
        current = null;
        resolve(proceed);
      },
    };
    current = req;
    show(req);
  });
}

/** Runs `action` once any unsaved edits in `target` are saved or discarded. */
export function guardUnsaved(target: UnsavedTarget, action: () => void): void {
  void confirmUnsaved(target).then((proceed) => { if (proceed) action(); });
}
