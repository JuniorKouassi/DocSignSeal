/* Shared between server (validation) and client (toolbar) -- no 'server-only'
   guard, this is just data. Keep in sync with the field_type enum in
   lib/db/schema.ts. */
export const FIELD_TYPES = [
  'signature', 'initials', 'fullname', 'date', 'text', 'number', 'checkbox', 'dropdown', 'attachment',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  signature: 'Signature',
  initials: 'Initials',
  fullname: 'Full name',
  date: 'Date',
  text: 'Text',
  number: 'Number',
  checkbox: 'Checkbox',
  dropdown: 'Dropdown',
  attachment: 'Attachment',
};

/* Sensible default box size (percent of page) when a field is first placed,
   before the sender resizes it. */
export const FIELD_TYPE_DEFAULT_SIZE: Record<FieldType, { w: number; h: number }> = {
  signature: { w: 22, h: 6 },
  initials: { w: 8, h: 5 },
  fullname: { w: 22, h: 4 },
  date: { w: 14, h: 4 },
  text: { w: 20, h: 4 },
  number: { w: 12, h: 4 },
  checkbox: { w: 4, h: 4 },
  dropdown: { w: 18, h: 4 },
  attachment: { w: 18, h: 5 },
};

export function isFieldType(value: unknown): value is FieldType {
  return typeof value === 'string' && (FIELD_TYPES as readonly string[]).includes(value);
}
