export const HANDLE_TYPES = ['signal', 'whatsapp', 'telegram', 'other'] as const;
export type HandleType = (typeof HANDLE_TYPES)[number];

export const HANDLE_META: Record<HandleType, { label: string; placeholder: string }> = {
  signal:   { label: 'Signal',   placeholder: '+1 555 000 0000 or username' },
  whatsapp: { label: 'WhatsApp', placeholder: '+1 555 000 0000' },
  telegram: { label: 'Telegram', placeholder: '@username' },
  other:    { label: 'Other',    placeholder: 'handle or username' },
};
