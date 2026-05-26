import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '../hooks/useMutation';
import type { ContactDetail as ContactDetailType, ContactAlertRss, User } from '@shared/types';
import Button from '../shell/Button';
import DynamicList, { useDragReorder } from './DynamicList';
import {
  isValidEmail,
  isValidUrl,
  isGoogleAlertUrl,
  hasDisallowedPhoneChars,
  normalizePhoneForComparison,
  sanitizeOtherLabel,
  OTHER_LABEL_MAX,
  findDuplicates,
} from './contactValidation';
import { CalendarPicker } from '../views/CalendarPicker';
import RssAlertPanel from './RssAlertPanel';
import { HANDLE_TYPES, HANDLE_META } from './handleMeta';
import type { HandleType } from './handleMeta';
import { SOCIAL_TYPES, NON_OTHER_SOCIAL_TYPES, SOCIAL_META, localToday } from './contactConstants';
import type { NonOtherSocialType } from './contactConstants';
import './AddContactModal.css';
import './ContactDetail.css';

export { SOCIAL_TYPES, SOCIAL_META } from './contactConstants';
export type { SocialType } from './contactConstants';

export const KNOWN_LINK_TYPES = new Set<string>([...SOCIAL_TYPES, 'website']);

interface Props {
  contact: ContactDetailType;
  user?: User | null;
  alertRssList: ContactAlertRss[];
  newRssUrl: string;
  onNewRssUrlChange: (url: string) => void;
  onAddRss: () => Promise<void>;
  onRemoveRss: (id: string) => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ContactEditForm({
  contact,
  user,
  alertRssList,
  newRssUrl,
  onNewRssUrlChange,
  onAddRss,
  onRemoveRss,
  onSaved,
  onCancel,
}: Props) {
  const formRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [editName, setEditName] = useState(contact.name);
  const [editOrg, setEditOrg] = useState(contact.organization ?? '');
  const [editTitle, setEditTitle] = useState(contact.title ?? '');
  const [editDob, setEditDob] = useState(contact.dob ?? '');
  const [editNotes, setEditNotes] = useState(contact.notes ?? '');
  const [editHandles, setEditHandles] = useState(() =>
    contact.handles.map((h) => ({ type: h.type, handle: h.handle })),
  );
  const [editEmails, setEditEmails] = useState(() =>
    contact.emails.map((e) => ({ email: e.email, label: e.label ?? '' })),
  );
  const [editPhones, setEditPhones] = useState(() =>
    contact.phones.map((p) => ({ phone: p.phone, label: p.label ?? '' })),
  );
  const [editSocials, setEditSocials] = useState<Record<NonOtherSocialType, string[]>>(() => {
    return Object.fromEntries(
      NON_OTHER_SOCIAL_TYPES.map((type) => [
        type,
        contact.links.filter((l) => l.type === type).map((l) => l.url),
      ]),
    ) as Record<NonOtherSocialType, string[]>;
  });
  const [editOtherSocials, setEditOtherSocials] = useState(() =>
    contact.links.filter((l) => l.type === 'other').map((l) => ({ url: l.url, label: l.label ?? '' })),
  );
  const [editWebsites, setEditWebsites] = useState(() =>
    contact.links.filter((l) => l.type === 'website').map((l) => l.url),
  );

  const { getDragProps: emailDragProps, handleProps: emailHandleProps } = useDragReorder(editEmails, setEditEmails);
  const { getDragProps: phoneDragProps, handleProps: phoneHandleProps } = useDragReorder(editPhones, setEditPhones);
  const { getDragProps: otherSocialDragProps, handleProps: otherSocialHandleProps } = useDragReorder(editOtherSocials, setEditOtherSocials);

  const [emailCollisions, setEmailCollisions] = useState<Record<string, string>>({});
  const [phoneCollisions, setPhoneCollisions] = useState<Record<string, string>>({});
  const [emailFormatWarnings, setEmailFormatWarnings] = useState<Record<string, true>>({});
  const [phoneFormatWarnings, setPhoneFormatWarnings] = useState<Record<string, true>>({});
  const [urlFormatWarnings, setUrlFormatWarnings] = useState<Record<string, true>>({});

  const emailDuplicates = useMemo(
    () => findDuplicates(editEmails.map((e) => e.email.trim().toLowerCase())),
    [editEmails],
  );

  const phoneDuplicates = useMemo(
    () => findDuplicates(editPhones.map((p) => normalizePhoneForComparison(p.phone))),
    [editPhones],
  );

  const urlDuplicates = useMemo(
    () => findDuplicates([
      ...editWebsites,
      ...NON_OTHER_SOCIAL_TYPES.flatMap((t) => editSocials[t]),
      ...editOtherSocials.map((e) => e.url),
    ].map((u) => u.trim())),
    [editWebsites, editSocials, editOtherSocials],
  );

  async function checkEmailBlur(value: string) {
    if (!value) return;
    const valid = isValidEmail(value);
    setEmailFormatWarnings((prev) => {
      const next = { ...prev };
      if (!valid) next[value] = true; else delete next[value];
      return next;
    });
    if (!valid) return;
    const result = await window.sourcerer.checkCollision({ emails: [value], phones: [], excludeId: contact.id });
    if (!mounted.current) return;
    setEmailCollisions((prev) => {
      const next = { ...prev };
      if (result.email[value]) next[value] = result.email[value]; else delete next[value];
      return next;
    });
  }

  async function checkPhoneBlur(value: string) {
    if (!value) return;
    const [isValid, collision] = await Promise.all([
      window.sourcerer.validatePhone(value),
      window.sourcerer.checkCollision({ emails: [], phones: [value], excludeId: contact.id }),
    ]);
    if (!mounted.current) return;
    setPhoneFormatWarnings((prev) => {
      const next = { ...prev };
      if (!isValid) next[value] = true; else delete next[value];
      return next;
    });
    setPhoneCollisions((prev) => {
      const next = { ...prev };
      if (collision.phone[value]) next[value] = collision.phone[value]; else delete next[value];
      return next;
    });
  }

  function setSocial(type: NonOtherSocialType, values: string[]) {
    setEditSocials((prev) => ({ ...prev, [type]: values }));
  }

  const { execute: doSave, isPending: saving } = useMutation(async () => {
    const links = [
      ...NON_OTHER_SOCIAL_TYPES.flatMap((type) =>
        editSocials[type].filter((u) => u.trim()).map((url) => ({ type, url })),
      ),
      ...editOtherSocials
        .filter((e) => e.url.trim())
        .map((e) => {
          const label = sanitizeOtherLabel(e.label);
          return { type: 'other' as const, url: e.url, ...(label ? { label } : {}) };
        }),
      ...editWebsites.filter((u) => u.trim()).map((url) => ({ type: 'website' as const, url })),
    ];
    await window.sourcerer.updateContact({
      id: contact.id,
      name: editName,
      organization: editOrg,
      title: editTitle,
      dob: editDob || undefined,
      notes: editNotes,
      emails: editEmails.filter((e) => e.email.trim()).map((e) => ({ email: e.email, label: e.label.trim() || undefined })),
      phones: editPhones.filter((p) => p.phone?.trim()).map((p) => ({ phone: p.phone, label: p.label.trim() || undefined })),
      links,
      handles: editHandles.filter((h) => h.handle.trim() && h.type.trim()),
    });
    const pendingRss = newRssUrl.trim();
    if (pendingRss && isGoogleAlertUrl(pendingRss) && !alertRssList.some((f) => f.rss_url === pendingRss)) {
      await window.sourcerer.addAlertRss(contact.id, pendingRss);
    }
    onSaved();
  });

  function handleSave() {
    if (!editName.trim()) return;
    if (emailDuplicates.size > 0 || phoneDuplicates.size > 0 || urlDuplicates.size > 0) {
      formRef.current?.querySelector<HTMLElement>('.ac-collision-warn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    doSave();
  }

  return (
    <div className="detail-body" ref={formRef}>
      <div className="form-field">
        <label className="form-label">Name <span className="form-required">*</span></label>
        <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
      </div>

      <div className="form-field">
        <label className="form-label">Organization</label>
        <input className="form-input" value={editOrg} onChange={(e) => setEditOrg(e.target.value)} />
      </div>

      <div className="form-field">
        <label className="form-label">Title / Role</label>
        <input className="form-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="e.g. Senior Editor" />
      </div>

      <div className="form-field">
        <label className="form-label">Date of birth</label>
        <CalendarPicker
          label="Select date"
          value={editDob}
          onChange={setEditDob}
          showYear
          maxDate={localToday()}
        />
      </div>

      <div className="form-field">
        <label className="form-label">Email</label>
        {editEmails.map((entry, i) => (
          <div
            key={i}
            {...emailDragProps(i)}
          >
            <div className="ac-phone-row">
              <span className="ac-drag-handle" {...emailHandleProps}>⠿</span>
              <input
                className="form-input"
                value={entry.email}
                placeholder="email@example.com"
                disabled={saving}
                onChange={(e) => {
                  const prev = entry.email.trim();
                  const next = [...editEmails];
                  next[i] = { ...next[i], email: e.target.value };
                  setEditEmails(next);
                  if (prev) {
                    setEmailFormatWarnings((w) => {
                      if (!w[prev]) return w;
                      const updated = { ...w };
                      delete updated[prev];
                      return updated;
                    });
                    setEmailCollisions((c) => {
                      if (!c[prev]) return c;
                      const updated = { ...c };
                      delete updated[prev];
                      return updated;
                    });
                  }
                }}
                onBlur={() => checkEmailBlur(entry.email.trim())}
              />
              <input
                className="form-input"
                value={entry.label}
                placeholder="label"
                disabled={saving}
                onChange={(e) => {
                  const next = [...editEmails];
                  next[i] = { ...next[i], label: e.target.value };
                  setEditEmails(next);
                }}
              />
              <button
                className="ac-remove"
                type="button"
                onClick={() => setEditEmails(editEmails.filter((_, j) => j !== i))}
              ></button>
            </div>
            {entry.email.trim() && emailFormatWarnings[entry.email.trim()] && (
              <div className="ac-collision-warn">
                ⚠ Invalid email address
              </div>
            )}
            {entry.email.trim() && !emailFormatWarnings[entry.email.trim()] && emailDuplicates.has(entry.email.trim().toLowerCase()) && (
              <div className="ac-collision-warn">⚠ Already added</div>
            )}
            {entry.email.trim() && !emailFormatWarnings[entry.email.trim()] && !emailDuplicates.has(entry.email.trim().toLowerCase()) && emailCollisions[entry.email.trim()] && (
              <div className="ac-collision-warn">
                Already on: <span>{emailCollisions[entry.email.trim()]}</span>
              </div>
            )}
          </div>
        ))}
        <div>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setEditEmails([...editEmails, { email: '', label: '' }])}
          >
            + Add
          </Button>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Phone</label>
        {editPhones.map((entry, i) => (
          <div
            key={i}
            {...phoneDragProps(i)}
          >
            <div className="ac-phone-row">
              <span className="ac-drag-handle" {...phoneHandleProps}>⠿</span>
              <input
                className="form-input"
                value={entry.phone}
                placeholder="+1 555 000 0000"
                disabled={saving}
                onChange={(e) => {
                  const prev = entry.phone.trim();
                  const next = [...editPhones];
                  next[i] = { ...next[i], phone: e.target.value };
                  setEditPhones(next);
                  const newVal = e.target.value.trim();
                  if (prev && prev !== newVal) {
                    setPhoneFormatWarnings((w) => { if (!w[prev]) return w; const u = { ...w }; delete u[prev]; return u; });
                    setPhoneCollisions((c) => { if (!c[prev]) return c; const u = { ...c }; delete u[prev]; return u; });
                  }
                  if (newVal) {
                    setPhoneFormatWarnings((w) => {
                      const bad = hasDisallowedPhoneChars(newVal);
                      if (bad === !!w[newVal]) return w;
                      const u = { ...w };
                      if (bad) u[newVal] = true; else delete u[newVal];
                      return u;
                    });
                  }
                }}
                onBlur={() => checkPhoneBlur(entry.phone.trim())}
              />
              <input
                className="form-input"
                value={entry.label}
                placeholder="label"
                disabled={saving}
                onChange={(e) => {
                  const next = [...editPhones];
                  next[i] = { ...next[i], label: e.target.value };
                  setEditPhones(next);
                }}
              />
              <button
                className="ac-remove"
                type="button"
                onClick={() => setEditPhones(editPhones.filter((_, j) => j !== i))}
              ></button>
            </div>
            {entry.phone.trim() && phoneFormatWarnings[entry.phone.trim()] && (
              <div className="ac-collision-warn">
                {hasDisallowedPhoneChars(entry.phone.trim())
                  ? '⚠ Phone contains invalid characters'
                  : '⚠ Invalid phone number'}
              </div>
            )}
            {entry.phone.trim() && !phoneFormatWarnings[entry.phone.trim()] && phoneDuplicates.has(normalizePhoneForComparison(entry.phone)) && (
              <div className="ac-collision-warn">⚠ Already added</div>
            )}
            {entry.phone.trim() && !phoneFormatWarnings[entry.phone.trim()] && !phoneDuplicates.has(normalizePhoneForComparison(entry.phone)) && phoneCollisions[entry.phone.trim()] && (
              <div className="ac-collision-warn">
                Already on: <span>{phoneCollisions[entry.phone.trim()]}</span>
              </div>
            )}
          </div>
        ))}
        <div>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setEditPhones([...editPhones, { phone: '', label: '' }])}
          >
            + Add
          </Button>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Messaging</label>
        {editHandles.map((entry, i) => (
          <div key={i} className="ac-phone-row">
            <select
              className="form-input ac-handle-type"
              value={HANDLE_TYPES.includes(entry.type as HandleType) ? entry.type : 'other'}
              onChange={(e) => {
                const next = [...editHandles];
                next[i] = { ...next[i], type: e.target.value as HandleType };
                setEditHandles(next);
              }}
            >
              {HANDLE_TYPES.map((t) => (
                <option key={t} value={t}>{HANDLE_META[t].label}</option>
              ))}
            </select>
            <input
              className="form-input"
              value={entry.handle}
              placeholder={HANDLE_META[(HANDLE_TYPES.includes(entry.type as HandleType) ? entry.type : 'other') as HandleType].placeholder}
              onChange={(e) => {
                const next = [...editHandles];
                next[i] = { ...next[i], handle: e.target.value };
                setEditHandles(next);
              }}
            />
            <button
              className="ac-remove"
              type="button"
              onClick={() => setEditHandles(editHandles.filter((_, j) => j !== i))}
            ></button>
          </div>
        ))}
        <div>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setEditHandles([...editHandles, { type: 'signal', handle: '' }])}
          >
            + Add
          </Button>
        </div>
      </div>

      {NON_OTHER_SOCIAL_TYPES.map((type) => (
        <div key={type} className="form-field">
          <label className="form-label">{SOCIAL_META[type].label}</label>
          <DynamicList
            enableDragReorder
            values={editSocials[type]}
            placeholder={SOCIAL_META[type].placeholder}
            onChange={(vals) => setSocial(type, vals)}
            onChangeItem={(oldVal) => {
              if (!oldVal) return;
              setUrlFormatWarnings((w) => { if (!w[oldVal]) return w; const u = { ...w }; delete u[oldVal]; return u; });
            }}
            onBlurItem={(val) => {
              if (!val) return;
              setUrlFormatWarnings((prev) => {
                const next = { ...prev };
                if (!isValidUrl(val)) next[val] = true; else delete next[val];
                return next;
              });
            }}
            warnings={Object.fromEntries(
              editSocials[type]
                .map((v) => v.trim())
                .filter(Boolean)
                .flatMap((v) => {
                  if (urlFormatWarnings[v]) return [[v, '⚠ Invalid URL']];
                  if (urlDuplicates.has(v)) return [[v, '⚠ Already added']];
                  return [];
                })
            )}
          />
        </div>
      ))}

      <div className="form-field">
        <label className="form-label">Other social</label>
        {editOtherSocials.map((entry, i) => (
          <div
            key={i}
            {...otherSocialDragProps(i)}
          >
            <div className="ac-other-social-row">
              <span className="ac-drag-handle" {...otherSocialHandleProps}>⠿</span>
              <input
                className="form-input"
                value={entry.label}
                placeholder="Platform (e.g. TikTok)"
                maxLength={OTHER_LABEL_MAX}
                onChange={(e) => {
                  const next = [...editOtherSocials];
                  next[i] = { ...next[i], label: e.target.value };
                  setEditOtherSocials(next);
                }}
                onBlur={(e) => {
                  const next = [...editOtherSocials];
                  next[i] = { ...next[i], label: sanitizeOtherLabel(e.target.value) };
                  setEditOtherSocials(next);
                }}
              />
              <input
                className="form-input"
                value={entry.url}
                placeholder="https://…"
                onChange={(e) => {
                  const prev = entry.url.trim();
                  const next = [...editOtherSocials];
                  next[i] = { ...next[i], url: e.target.value };
                  setEditOtherSocials(next);
                  if (prev) {
                    setUrlFormatWarnings((w) => { if (!w[prev]) return w; const u = { ...w }; delete u[prev]; return u; });
                  }
                }}
                onBlur={() => {
                  const val = entry.url.trim();
                  if (!val) return;
                  setUrlFormatWarnings((prev) => {
                    const next = { ...prev };
                    if (!isValidUrl(val)) next[val] = true; else delete next[val];
                    return next;
                  });
                }}
              />
              <button
                className="ac-remove"
                type="button"
                onClick={() => setEditOtherSocials(editOtherSocials.filter((_, j) => j !== i))}
              ></button>
            </div>
            {entry.url.trim() && urlFormatWarnings[entry.url.trim()] && (
              <div className="ac-collision-warn">⚠ Invalid URL</div>
            )}
            {entry.url.trim() && !urlFormatWarnings[entry.url.trim()] && urlDuplicates.has(entry.url.trim()) && (
              <div className="ac-collision-warn">⚠ Already added</div>
            )}
          </div>
        ))}
        <div>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setEditOtherSocials([...editOtherSocials, { url: '', label: '' }])}
          >
            + Add
          </Button>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Website</label>
        <DynamicList
          enableDragReorder
          values={editWebsites}
          placeholder="https://example.com"
          onChange={setEditWebsites}
          onChangeItem={(oldVal) => {
            if (!oldVal) return;
            setUrlFormatWarnings((w) => { if (!w[oldVal]) return w; const u = { ...w }; delete u[oldVal]; return u; });
          }}
          onBlurItem={(val) => {
            if (!val) return;
            setUrlFormatWarnings((prev) => {
              const next = { ...prev };
              if (!isValidUrl(val)) next[val] = true; else delete next[val];
              return next;
            });
          }}
          warnings={Object.fromEntries(
            editWebsites
              .map((v) => v.trim())
              .filter(Boolean)
              .flatMap((v) => {
                if (urlFormatWarnings[v]) return [[v, '⚠ Invalid URL']];
                if (urlDuplicates.has(v)) return [[v, '⚠ Already added']];
                return [];
              })
          )}
        />
        {user?.wayback_enabled !== 0 && user?.wayback_keys_configured !== 0 && (
          <p className="form-field-hint">Wayback Machine archiving is enabled.</p>
        )}
      </div>

      <div className="form-field">
        <label className="form-label">Notes</label>
        <textarea
          className="form-textarea"
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          rows={4}
        />
      </div>

      <RssAlertPanel
        editing
        alertRssList={alertRssList}
        newRssUrl={newRssUrl}
        onNewRssUrlChange={onNewRssUrlChange}
        onAddRss={onAddRss}
        onRemoveRss={onRemoveRss}
      />

      <div className="detail-edit-actions-bottom">
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !editName.trim() || Object.keys(emailFormatWarnings).length > 0 || Object.keys(phoneFormatWarnings).length > 0 || Object.keys(urlFormatWarnings).length > 0 || (!!newRssUrl.trim() && !isGoogleAlertUrl(newRssUrl.trim())) || (!!newRssUrl.trim() && alertRssList.some((f) => f.rss_url === newRssUrl.trim()))}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
