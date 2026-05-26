export const NON_OTHER_SOCIAL_TYPES = ['linkedin', 'x', 'instagram', 'facebook'] as const;
export type NonOtherSocialType = (typeof NON_OTHER_SOCIAL_TYPES)[number];

export const SOCIAL_TYPES = [...NON_OTHER_SOCIAL_TYPES, 'other'] as const;
export type SocialType = (typeof SOCIAL_TYPES)[number];

export const SOCIAL_META: Record<SocialType, { label: string; placeholder: string }> = {
  linkedin:  { label: 'LinkedIn',    placeholder: 'https://linkedin.com/in/…' },
  x:         { label: 'X / Twitter', placeholder: 'https://x.com/…' },
  instagram: { label: 'Instagram',   placeholder: 'https://instagram.com/…' },
  facebook:  { label: 'Facebook',    placeholder: 'https://facebook.com/…' },
  other:     { label: 'Other social', placeholder: 'https://…' },
};

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
