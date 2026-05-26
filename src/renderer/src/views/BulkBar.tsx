import { useEffect, useState } from 'react';
import type { StatusOption, PriorityOption } from '@shared/types';
import Button from '../shell/Button';

interface Props {
  checkedCount: number;
  statusOptions: StatusOption[];
  priorityOptions: PriorityOption[];
  onClearSelection: () => void;
  onRemove: () => Promise<void>;
  onDelete: () => Promise<void>;
  onSetStatus: (status: string | null) => Promise<void>;
  onSetPriority: (priority: string | null) => Promise<void>;
}

export default function BulkBar({
  checkedCount,
  statusOptions,
  priorityOptions,
  onClearSelection,
  onRemove,
  onDelete,
  onSetStatus,
  onSetPriority,
}: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);

  useEffect(() => {
    setConfirmRemove(false);
    setConfirmDelete(false);
  }, [checkedCount]);

  async function handleRemove() {
    setBulkWorking(true);
    try { await onRemove(); } finally { setBulkWorking(false); setConfirmRemove(false); }
  }

  async function handleDelete() {
    setBulkWorking(true);
    try { await onDelete(); } finally { setBulkWorking(false); setConfirmDelete(false); }
  }

  async function handleSetStatus(status: string | null) {
    setBulkWorking(true);
    try { await onSetStatus(status); } finally { setBulkWorking(false); }
  }

  async function handleSetPriority(priority: string | null) {
    setBulkWorking(true);
    try { await onSetPriority(priority); } finally { setBulkWorking(false); }
  }

  return (
    <div className="bulk-bar">
      <div className="bulk-bar-element">
        <span className="bulk-bar-count">{checkedCount} selected</span>
        <button
          className="bulk-bar-clear"
          onClick={onClearSelection}
          title="Clear selection"
        >
          ×
        </button>
      </div>
      {confirmRemove ? (
        <div className="bulk-bar-element">
          <span className="bulk-delete-confirm-text">
            Remove {checkedCount} contact{checkedCount !== 1 ? 's' : ''} from this project?
          </span>
          <Button
            variant="danger"
            size="sm"
            onClick={handleRemove}
            disabled={bulkWorking}
          >
            {bulkWorking ? 'Removing…' : 'Confirm remove'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmRemove(false)}
            disabled={bulkWorking}
          >
            Cancel
          </Button>
        </div>
      ) : confirmDelete ? (
        <div className="bulk-bar-element">
          <span className="bulk-delete-confirm-text">
            Permanently delete {checkedCount} contact{checkedCount !== 1 ? 's' : ''}?
          </span>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            disabled={bulkWorking}
          >
            {bulkWorking ? 'Deleting…' : 'Confirm delete'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmDelete(false)}
            disabled={bulkWorking}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <>
          {statusOptions.length > 0 && (
            <div className="bulk-bar-element">
              <label className="bulk-bar-label">Status</label>
              <select
                className="bulk-bar-select"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__clear__') { handleSetStatus(null); return; }
                  const opt = statusOptions.find((o) => o.id === v);
                  if (opt) handleSetStatus(opt.label);
                }}
                disabled={bulkWorking}
              >
                <option value="" disabled>Set status</option>
                {statusOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
                <option value="__clear__">— clear —</option>
              </select>
            </div>
          )}
          {priorityOptions.length > 0 && (
            <div className="bulk-bar-element">
              <label className="bulk-bar-label">Priority</label>
              <select
                className="bulk-bar-select"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__clear__') { handleSetPriority(null); return; }
                  const opt = priorityOptions.find((o) => o.id === v);
                  if (opt) handleSetPriority(opt.label);
                }}
                disabled={bulkWorking}
              >
                <option value="" disabled>Set priority</option>
                {priorityOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
                <option value="__clear__">— clear —</option>
              </select>
            </div>
          )}
          <div className="bulk-bar-element bulk-bar-element--right bulk-actions-wrap">
            <button
              className="bulk-actions-trigger"
              onClick={() => setShowBulkActions((v) => !v)}
              disabled={bulkWorking}
            >
              Remove from…
            </button>
            {showBulkActions && (
              <div className="bulk-actions-menu">
                <button
                  className="bulk-actions-item bulk-actions-item--danger"
                  onClick={() => { setShowBulkActions(false); setConfirmRemove(true); }}
                >
                  Project
                </button>
                <button
                  className="bulk-actions-item bulk-actions-item--danger"
                  onClick={() => { setShowBulkActions(false); setConfirmDelete(true); }}
                >
                  Sourcerer
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
