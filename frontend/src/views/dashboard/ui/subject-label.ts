import type { SubjectType } from '@/shared/config';

// Consultations currently render as self-subject only; family linkage is not
// surfaced on the dashboard yet, so the subject type is intentionally ignored.
export function subjectTypeLabel(_t: SubjectType): string {
  return '본인';
}
