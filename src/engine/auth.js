// Pure auth-gating helpers — no React, no Supabase (engine rules).
//
// isAllowedEmail is the client half of the @ualberta.ca restriction;
// the server half is the `lower(email) like '%@ualberta.ca'` predicate
// in link_user_on_first_login (0013_consent_and_domain.sql). The two
// MUST stay semantically identical: a bare suffix match on
// '@ualberta.ca', which rejects subdomain lookalikes
// ('x@gmx.ualberta.ca') and suffix lookalikes ('x@notualberta.ca')
// alike. If one side ever changes, change the other in the same
// commit.

export const ALLOWED_EMAIL_DOMAIN = 'ualberta.ca'

export function isAllowedEmail(email) {
  if (typeof email !== 'string') return false
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
}
