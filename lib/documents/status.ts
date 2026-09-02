/* Status colour, never blue (brand), always paired with a word --
   HANDOFF.md non-negotiable #7. */
export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  in_progress: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
  voided: 'Voided',
  expired: 'Expired',
};

export const STATUS_GROUP: Record<string, 'draft' | 'waiting' | 'signed' | 'declined'> = {
  draft: 'draft',
  sent: 'waiting',
  in_progress: 'waiting',
  completed: 'signed',
  declined: 'declined',
  voided: 'draft',
  expired: 'draft',
};
