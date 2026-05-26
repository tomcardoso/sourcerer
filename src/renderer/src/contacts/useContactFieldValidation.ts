import { useState, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import {
  isValidEmail,
  isValidUrl,
  hasDisallowedPhoneChars,
  normalizePhoneForComparison,
  findDuplicates,
} from './contactValidation';

export function useContactFieldValidation({
  excludeId,
  mounted,
  emails,
  phones,
  urlValues,
}: {
  excludeId?: string;
  mounted: MutableRefObject<boolean>;
  emails: Array<{ email: string; label: string }>;
  phones: Array<{ phone: string; label: string }>;
  urlValues: string[];
}) {
  const [emailCollisions, setEmailCollisions] = useState<Record<string, string>>({});
  const [phoneCollisions, setPhoneCollisions] = useState<Record<string, string>>({});
  const [emailFormatWarnings, setEmailFormatWarnings] = useState<Record<string, true>>({});
  const [phoneFormatWarnings, setPhoneFormatWarnings] = useState<Record<string, true>>({});
  const [urlFormatWarnings, setUrlFormatWarnings] = useState<Record<string, true>>({});

  const emailDuplicates = useMemo(
    () => findDuplicates(emails.map((e) => e.email.trim().toLowerCase())),
    [emails],
  );

  const phoneDuplicates = useMemo(
    () => findDuplicates(phones.map((p) => normalizePhoneForComparison(p.phone))),
    [phones],
  );

  const urlDuplicates = useMemo(
    () => findDuplicates(urlValues.map((u) => u.trim())),
    [urlValues],
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
    const result = await window.sourcerer.checkCollision({
      emails: [value],
      phones: [],
      ...(excludeId ? { excludeId } : {}),
    });
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
      window.sourcerer.checkCollision({
        emails: [],
        phones: [value],
        ...(excludeId ? { excludeId } : {}),
      }),
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

  function clearEmailWarnings(prev: string) {
    setEmailFormatWarnings((w) => { if (!w[prev]) return w; const u = { ...w }; delete u[prev]; return u; });
    setEmailCollisions((c) => { if (!c[prev]) return c; const u = { ...c }; delete u[prev]; return u; });
  }

  function clearPhoneWarnings(prev: string) {
    setPhoneFormatWarnings((w) => { if (!w[prev]) return w; const u = { ...w }; delete u[prev]; return u; });
    setPhoneCollisions((c) => { if (!c[prev]) return c; const u = { ...c }; delete u[prev]; return u; });
  }

  function updatePhoneFormatWarning(newVal: string) {
    setPhoneFormatWarnings((w) => {
      const bad = hasDisallowedPhoneChars(newVal);
      if (bad === !!w[newVal]) return w;
      const u = { ...w };
      if (bad) u[newVal] = true; else delete u[newVal];
      return u;
    });
  }

  function clearUrlWarning(prev: string) {
    setUrlFormatWarnings((w) => { if (!w[prev]) return w; const u = { ...w }; delete u[prev]; return u; });
  }

  function updateUrlFormatWarning(val: string) {
    setUrlFormatWarnings((prev) => {
      const next = { ...prev };
      if (!isValidUrl(val)) next[val] = true; else delete next[val];
      return next;
    });
  }

  function resetAll() {
    setEmailCollisions({});
    setPhoneCollisions({});
    setEmailFormatWarnings({});
    setPhoneFormatWarnings({});
    setUrlFormatWarnings({});
  }

  return {
    emailCollisions,
    phoneCollisions,
    emailFormatWarnings,
    phoneFormatWarnings,
    urlFormatWarnings,
    emailDuplicates,
    phoneDuplicates,
    urlDuplicates,
    checkEmailBlur,
    checkPhoneBlur,
    clearEmailWarnings,
    clearPhoneWarnings,
    updatePhoneFormatWarning,
    clearUrlWarning,
    updateUrlFormatWarning,
    resetAll,
  };
}
