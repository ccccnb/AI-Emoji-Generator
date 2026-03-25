export function getDevAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const devUserId = window.localStorage.getItem('dev_user_id')
  return devUserId ? { 'x-dev-user-id': devUserId } : {}
}
