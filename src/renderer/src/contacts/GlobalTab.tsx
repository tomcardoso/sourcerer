import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContactDetail as ContactDetailType, ContactAlertRss, Project, User } from '@shared/types';
import Button from '../shell/Button';
import GlobalLogSection from './GlobalLogSection';
import GlobalRemindersSection from './GlobalRemindersSection';
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
import ScreenshotPanel from './ScreenshotPanel';
import { linkifyText } from '../utils/linkify';
import './AddContactModal.css';
import './ContactDetail.css';

interface Props {
  contact: ContactDetailType;
  allProjects: Project[];
  onRefresh: () => void;
  onMembershipChanged: () => void;
  onDeleted: (id: string) => void;
  onEditingChange?: (editing: boolean) => void;
  user?: User | null;
}

const SOCIAL_TYPES = ['linkedin', 'x', 'instagram', 'facebook', 'other'] as const;
type SocialType = (typeof SOCIAL_TYPES)[number];

import { HANDLE_TYPES, HANDLE_META } from './handleMeta';
import type { HandleType } from './handleMeta';

const NON_OTHER_SOCIAL_TYPES = ['linkedin', 'x', 'instagram', 'facebook'] as const;
type NonOtherSocialType = (typeof NON_OTHER_SOCIAL_TYPES)[number];

const SOCIAL_META: Record<SocialType, { label: string; placeholder: string }> = {
  linkedin:  { label: 'LinkedIn',    placeholder: 'https://linkedin.com/in/…' },
  x:         { label: 'X / Twitter', placeholder: 'https://x.com/…' },
  instagram: { label: 'Instagram',   placeholder: 'https://instagram.com/…' },
  facebook:  { label: 'Facebook',    placeholder: 'https://facebook.com/…' },
  'other':  { label: 'Other social',    placeholder: 'https://…' },
};

const KNOWN_LINK_TYPES = new Set<string>([...SOCIAL_TYPES, 'website']);


export default function GlobalTab({ contact, allProjects, onRefresh, onMembershipChanged, onDeleted, onEditingChange, user }: Props) {
  const [editing, setEditing] = useState(false);

  function setEditingAndNotify(value: boolean) {
    setEditing(value);
    onEditingChange?.(value);
  }
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingToProject, setAddingToProject] = useState('');
  const [confirmRemoveProjectId, setConfirmRemoveProjectId] = useState<string | null>(null);
  const [alertRssList, setAlertRssList] = useState<ContactAlertRss[]>([]);
  const [waybackStatus, setWaybackStatus] = useState<Map<string, 'pending' | 'failed'>>(new Map());
  const formRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    return window.sourcerer.onWaybackStatus(({ contactId, url, status }) => {
      if (contactId !== contact.id) return;
      setWaybackStatus((prev) => {
        const next = new Map(prev);
        if (status === 'pending') {
          next.set(url, 'pending');
        } else {
          next.set(url, 'failed');
        }
        return next;
      });
    });
  }, [contact.id]);

  // Clear pending status when contact reloads with a wayback_url
  useEffect(() => {
    const archivedUrls = new Set(contact.links.filter((l) => l.wayback_url).map((l) => l.url));
    if (archivedUrls.size === 0) return;
    setWaybackStatus((prev) => {
      if ([...archivedUrls].every((u) => !prev.has(u))) return prev;
      const next = new Map(prev);
      for (const url of archivedUrls) next.delete(url);
      return next;
    });
  }, [contact.links]);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editOrg, setEditOrg] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editHandles, setEditHandles] = useState<Array<{ type: string; handle: string }>>([]);
  const [editEmails, setEditEmails] = useState<Array<{ email: string; label: string }>>([]);
  const [editPhones, setEditPhones] = useState<Array<{ phone: string; label: string }>>([]);
  const [editSocials, setEditSocials] = useState<Record<NonOtherSocialType, string[]>>({
    linkedin: [], x: [], instagram: [], facebook: [],
  });
  const [editOtherSocials, setEditOtherSocials] = useState<Array<{ url: string; label: string }>>([]);
  const { getDragProps: emailDragProps, handleProps: emailHandleProps } = useDragReorder(editEmails, setEditEmails);
  const { getDragProps: phoneDragProps, handleProps: phoneHandleProps } = useDragReorder(editPhones, setEditPhones);
  const { getDragProps: otherSocialDragProps, handleProps: otherSocialHandleProps } = useDragReorder(editOtherSocials, setEditOtherSocials);
  const [editWebsites, setEditWebsites] = useState<string[]>([]);
  const [newRssUrl, setNewRssUrl] = useState('');
  const [emailCollisions, setEmailCollisions] = useState<Record<string, string>>({});
  const [phoneCollisions, setPhoneCollisions] = useState<Record<string, string>>({});
  const [emailFormatWarnings, setEmailFormatWarnings] = useState<Record<string, true>>({});
  const [phoneFormatWarnings, setPhoneFormatWarnings] = useState<Record<string, true>>({});
  const [urlFormatWarnings, setUrlFormatWarnings] = useState<Record<string, true>>({});

  // Computed within-form duplicate sets — derived from state, no extra state needed.
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

  useEffect(() => {
    window.sourcerer.listAlertRss(contact.id).then(setAlertRssList);
  }, [contact.id]);


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

  function startEdit() {
    setEditName(contact.name);
    setEditOrg(contact.organization ?? '');
    setEditTitle(contact.title ?? '');
    setEditDob(contact.dob ?? '');
    setEditNotes(contact.notes ?? '');
    setEditHandles(contact.handles.map((h) => ({ type: h.type, handle: h.handle })));
    setEditEmails(contact.emails.map((e) => ({ email: e.email, label: e.label ?? '' })));
    setEditPhones(contact.phones.map((p) => ({ phone: p.phone, label: p.label ?? '' })));
    const socialsByType = Object.fromEntries(
      NON_OTHER_SOCIAL_TYPES.map((type) => [
        type,
        contact.links.filter((l) => l.type === type).map((l) => l.url),
      ]),
    ) as Record<NonOtherSocialType, string[]>;
    setEditSocials(socialsByType);
    setEditOtherSocials(
      contact.links.filter((l) => l.type === 'other').map((l) => ({ url: l.url, label: l.label ?? '' })),
    );
    setEditWebsites(contact.links.filter((l) => l.type === 'website').map((l) => l.url));
    setNewRssUrl('');
    setEmailCollisions({});
    setPhoneCollisions({});
    setEmailFormatWarnings({});
    setPhoneFormatWarnings({});
    setUrlFormatWarnings({});
    setEditingAndNotify(true);
  }

  async function handleSave() {
    if (!editName.trim()) return;
    if (emailDuplicates.size > 0 || phoneDuplicates.size > 0 || urlDuplicates.size > 0) {
      formRef.current?.querySelector<HTMLElement>('.ac-collision-warn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    try {
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
        phones: editPhones.map((p) => ({ phone: p.phone, label: p.label.trim() || undefined })),
        links,
        handles: editHandles.filter((h) => h.handle.trim() && h.type.trim()),
      });
      const pendingRss = newRssUrl.trim();
      if (pendingRss && isGoogleAlertUrl(pendingRss) && !alertRssList.some((f) => f.rss_url === pendingRss)) {
        await window.sourcerer.addAlertRss(contact.id, pendingRss);
      }
      onRefresh();
      setEditingAndNotify(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddToProject() {
    if (!addingToProject) return;
    try {
      await window.sourcerer.addToProject(contact.id, addingToProject);
      setAddingToProject('');
      onMembershipChanged();
    } catch { /* leave form open for retry */ }
  }

  async function handleRemoveFromProject(projectId: string) {
    try {
      await window.sourcerer.removeFromProject(contact.id, projectId);
      onMembershipChanged();
    } finally {
      setConfirmRemoveProjectId(null);
    }
  }

  async function handleDelete() {
    try {
      await window.sourcerer.deleteContact(contact.id);
      onDeleted(contact.id);
    } catch { /* stay open */ }
  }

  async function handleAddRss() {
    const url = newRssUrl.trim();
    if (!url || !isGoogleAlertUrl(url)) return;
    if (alertRssList.some((f) => f.rss_url === url)) return;
    try {
      await window.sourcerer.addAlertRss(contact.id, url);
      const updated = await window.sourcerer.listAlertRss(contact.id);
      setNewRssUrl('');
      setAlertRssList(updated);
    } catch { /* leave URL for retry */ }
  }

  async function handleRemoveRss(id: string) {
    try {
      await window.sourcerer.removeAlertRss(id);
      setAlertRssList((prev) => prev.filter((f) => f.id !== id));
    } catch { /* item stays in list */ }
  }


  // View mode: group links by type
  const socialLinks = Object.fromEntries(
    SOCIAL_TYPES.map((type) => [type, contact.links.filter((l) => l.type === type)]),
  ) as Record<SocialType, typeof contact.links>;
  const websiteLinks = contact.links.filter((l) => l.type === 'website');
  const otherLinks = contact.links.filter((l) => !KNOWN_LINK_TYPES.has(l.type));
  const contactProjectIds = new Set(contact.projects.map((p) => p.id));
  const availableProjects = allProjects.filter((p) => !contactProjectIds.has(p.id));

  if (editing) {
    return (
      <div className="detail-body" ref={formRef}>
        <div className="ac-field">
          <label className="ac-label">Name <span className="ac-required">*</span></label>
          <input className="ac-input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
        </div>

        <div className="ac-field">
          <label className="ac-label">Organization</label>
          <input className="ac-input" value={editOrg} onChange={(e) => setEditOrg(e.target.value)} />
        </div>

        <div className="ac-field">
          <label className="ac-label">Title / Role</label>
          <input className="ac-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="e.g. Senior Editor" />
        </div>

        <div className="ac-field">
          <label className="ac-label">Date of birth</label>
          <CalendarPicker
            label="Select date"
            value={editDob}
            onChange={setEditDob}
            showYear
            maxDate={localToday()}
          />
        </div>

        <div className="ac-field">
          <label className="ac-label">Email</label>
          {editEmails.map((entry, i) => (
            <div
              key={i}
              {...emailDragProps(i)}
            >
              <div className="ac-phone-row">
                <span className="ac-drag-handle" {...emailHandleProps}>⠿</span>
                <input
                  className="ac-input"
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
                  className="ac-input"
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

        <div className="ac-field">
          <label className="ac-label">Phone</label>
          {editPhones.map((entry, i) => (
            <div
              key={i}
              {...phoneDragProps(i)}
            >
              <div className="ac-phone-row">
                <span className="ac-drag-handle" {...phoneHandleProps}>⠿</span>
                <input
                  className="ac-input"
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
                  className="ac-input"
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

        <div className="ac-field">
          <label className="ac-label">Messaging</label>
          {editHandles.map((entry, i) => (
            <div key={i} className="ac-phone-row">
              <select
                className="ac-input ac-handle-type"
                value={HANDLE_TYPES.includes(entry.type as HandleType) ? entry.type : 'other'}
                onChange={(e) => {
                  const next = [...editHandles];
                  next[i] = { ...next[i], type: e.target.value };
                  setEditHandles(next);
                }}
              >
                {HANDLE_TYPES.map((t) => (
                  <option key={t} value={t}>{HANDLE_META[t].label}</option>
                ))}
              </select>
              <input
                className="ac-input"
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
          <div key={type} className="ac-field">
            <label className="ac-label">{SOCIAL_META[type].label}</label>
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

        <div className="ac-field">
          <label className="ac-label">Other social</label>
          {editOtherSocials.map((entry, i) => (
            <div
              key={i}
              {...otherSocialDragProps(i)}
            >
              <div className="ac-other-social-row">
                <span className="ac-drag-handle" {...otherSocialHandleProps}>⠿</span>
                <input
                  className="ac-input"
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
                  className="ac-input"
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

        <div className="ac-field">
          <label className="ac-label">Website</label>
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
            <p className="ac-field-hint">Wayback Machine archiving is enabled.</p>
          )}
        </div>

        <div className="ac-field">
          <label className="ac-label">Notes</label>
          <textarea
            className="ac-textarea"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={4}
          />
        </div>

        <RssAlertPanel
          editing
          alertRssList={alertRssList}
          newRssUrl={newRssUrl}
          onNewRssUrlChange={setNewRssUrl}
          onAddRss={handleAddRss}
          onRemoveRss={handleRemoveRss}
        />

        <div className="detail-edit-actions-bottom">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !editName.trim() || Object.keys(emailFormatWarnings).length > 0 || Object.keys(phoneFormatWarnings).length > 0 || Object.keys(urlFormatWarnings).length > 0 || (!!newRssUrl.trim() && !isGoogleAlertUrl(newRssUrl.trim())) || (!!newRssUrl.trim() && alertRssList.some((f) => f.rss_url === newRssUrl.trim()))}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditingAndNotify(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  function formatDob(dob: string): string {
    const d = new Date(`${dob}T12:00:00`);
    if (isNaN(d.getTime())) return dob;
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  }

  function localToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return (
    <div className="detail-body">

      {contact.dob && (
        <div className="detail-section">
          <div className="detail-section-label">Date of birth</div>
          <span className="detail-value">{formatDob(contact.dob)}</span>
        </div>
      )}

      {contact.emails.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Email</div>
          {contact.emails.map((e) => (
            <span key={e.id} className="detail-value">
              <a href={`mailto:${e.email}`} className="detail-link" onClick={(ev) => { ev.preventDefault(); window.open(`mailto:${e.email}`); }}>{e.email}</a>
              {e.label && <span className="detail-phone-label">· {e.label}</span>}
            </span>
          ))}
        </div>
      )}

      {contact.phones.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Phone</div>
          {contact.phones.map((p) => (
            <span key={p.id} className="detail-value">
              {p.phone}
              {p.label && <span className="detail-phone-label">· {p.label}</span>}
            </span>
          ))}
        </div>
      )}

      {contact.handles.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Messaging</div>
          {contact.handles.map((h) => (
            <span key={h.id} className="detail-value">
              {h.handle}
              <span className="detail-phone-label">· {HANDLE_META[(HANDLE_TYPES.includes(h.type as HandleType) ? h.type : 'other') as HandleType].label}</span>
            </span>
          ))}
        </div>
      )}

      {SOCIAL_TYPES.map((type) =>
        socialLinks[type].length > 0 ? (
          <div key={type} className="detail-section">
            <div className="detail-section-label">{SOCIAL_META[type].label}</div>
            {socialLinks[type].map((l) => (
              <a key={l.id} href={l.url} className="detail-link" onClick={(e) => { e.preventDefault(); window.open(l.url); }}>
                {type === 'other' && l.label ? l.label : l.url}
              </a>
            ))}
          </div>
        ) : null,
      )}

      {websiteLinks.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Website</div>
          {websiteLinks.map((l) => (
            <div key={l.id} className="detail-website-row">
              <a href={l.url} className="detail-link" onClick={(e) => { e.preventDefault(); window.open(l.url); }}>{l.url}</a>
              {l.wayback_url && (
                <a href={l.wayback_url} className="detail-wayback-link" onClick={(e) => { e.preventDefault(); window.open(l.wayback_url!); }} title="Wayback Machine snapshot">
                  archived ↗
                </a>
              )}
              {!l.wayback_url && user?.wayback_enabled !== 0 && user?.wayback_keys_configured !== 0 && waybackStatus.get(l.url) === 'pending' && (
                <span className="detail-wayback-pending">archiving…</span>
              )}
              {!l.wayback_url && user?.wayback_enabled !== 0 && user?.wayback_keys_configured !== 0 && waybackStatus.get(l.url) === 'failed' && (
                <span className="detail-wayback-failed" title="Wayback Machine could not archive this URL">archive failed</span>
              )}
            </div>
          ))}
        </div>
      )}

      {otherLinks.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Links</div>
          {otherLinks.map((l) => (
            <a key={l.id} href={l.url} className="detail-link">{l.label || l.url}</a>
          ))}
        </div>
      )}

      {contact.notes && (
        <div className="detail-section">
          <div className="detail-section-label">Notes</div>
          <p className="detail-notes">{linkifyText(contact.notes ?? '')}</p>
        </div>
      )}

      <RssAlertPanel
        editing={false}
        alertRssList={alertRssList}
        newRssUrl={newRssUrl}
        onNewRssUrlChange={setNewRssUrl}
        onAddRss={handleAddRss}
        onRemoveRss={handleRemoveRss}
      />

      <GlobalLogSection contact={contact} />

      <GlobalRemindersSection contact={contact} />

      <div className="detail-section">
        <div className="detail-section-label">Projects</div>
        {contact.projects.length === 0 ? (
          <p className="detail-empty-projects">Not added to any projects yet.</p>
        ) : (
          <ul className="detail-project-list">
            {contact.projects.map((p) => {
              const isDefault = contact.default_membership_id === p.membership_id;
              return (
                <li key={p.id} className="detail-project-item">
                  <span className="detail-project-name">{p.name}</span>
                  {p.status && <span className="detail-project-status">{p.status}</span>}
                  {confirmRemoveProjectId === p.id ? (
                    <span className="detail-project-remove-confirm">
                      <button
                        className="detail-project-remove-yes"
                        onClick={() => handleRemoveFromProject(p.id)}
                      >Remove</button>
                      <button
                        className="detail-project-remove-no"
                        onClick={() => setConfirmRemoveProjectId(null)}
                      >Cancel</button>
                    </span>
                  ) : (
                    <>
                      <button
                        className={`detail-project-default${isDefault ? ' detail-project-default--active' : ''}`}
                        title={isDefault ? 'Clear default project' : 'Set as default project'}
                        onClick={async () => {
                          await window.sourcerer.setContactDefaultProject(contact.id, isDefault ? null : p.membership_id);
                          onRefresh();
                        }}
                      >{isDefault ? '★' : '☆'}</button>
                      <button
                        className="detail-project-remove"
                        title="Remove from project"
                        onClick={() => setConfirmRemoveProjectId(p.id)}
                      >×</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {availableProjects.length > 0 && (
          <div className="detail-add-project">
            <select
              className="detail-project-select"
              value={addingToProject}
              onChange={(e) => setAddingToProject(e.target.value)}
            >
              <option value="">Add to project…</option>
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {addingToProject && (
              <Button variant="primary" size="sm" onClick={handleAddToProject}>Add</Button>
            )}
          </div>
        )}
      </div>

      <ScreenshotPanel contactId={contact.id} />

      <div className="detail-section detail-danger-zone">
        {confirmDelete ? (
          <div className="detail-confirm-delete">
            <p>Delete {contact.name}? This removes them from all projects and cannot be undone.</p>
            <div className="detail-confirm-actions">
              <Button variant="danger" size="sm" onClick={handleDelete}>Yes, delete</Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="detail-bottom-actions">
            <div className="detail-bottom-left">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.print()}
                title="Print contact sheet"
              >
                Print
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.sourcerer.exportVCardContact(contact.id)}
                title="Export as vCard (.vcf)"
              >
                ↓ vCard
              </Button>
              <Button variant="secondary" size="sm" onClick={startEdit}>Edit</Button>
            </div>
            <Button variant="danger-outline" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete contact
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
