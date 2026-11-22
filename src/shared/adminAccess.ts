export const DEFAULT_ADMIN_EMAILS = [
  'felipeallouch@gmail.com',
  'naimrahmouni1998@gmail.com',
] as const;

export function isDefaultAdminEmail(email?: string | null): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  return (DEFAULT_ADMIN_EMAILS as readonly string[]).includes(normalized);
}
