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
let inFlight = false;

/** Called by UnsavedChangesPrompt to show requests. Returns an unsubscribe function. */
export function setUnsavedPresenter(fn: ((req: UnsavedRequest) => void) | null): () => void {
  presenter = fn;
  return () => { if (presenter === fn) presenter = null; };
}

/**
 * Resolves true when it's fine to go ahead: nothing was unsaved, or the user saved or discarded
 * it. Resolves false when the user chose to keep editing. `scope` 'all' checks every drawer.
 */
export function confirmUnsaved(scope: UnsavedScope | 'all'): Promise<boolean> {
  const scopes = scope === 'all' ? [...allScopes] : [scope];
  const pending = scopes.flatMap((s) => s.pending());
  if (pending.length === 0) return Promise.resolve(true);
  // One prompt at a time; a second attempt (e.g. Escape pressed again) is simply ignored.
  if (inFlight) return Promise.resolve(false);
  if (!presenter) {
    return Promise.resolve(window.confirm('You have unsaved changes. Discard them?'));
  }
  inFlight = true;
  const show = presenter;
  return new Promise((resolve) => {
    show({
      pending,
      resolve: (proceed) => {
        inFlight = false;
        resolve(proceed);
      },
    });
  });
}

/** Runs `action` once any unsaved edits in `scope` are saved or discarded. */
export function guardUnsaved(scope: UnsavedScope | 'all', action: () => void): void {
  void confirmUnsaved(scope).then((proceed) => { if (proceed) action(); });
}
