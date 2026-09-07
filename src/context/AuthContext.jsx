import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { isAllowedEmail, ALLOWED_EMAIL_DOMAIN } from '../engine/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = not yet resolved
  const [profile, setProfile] = useState(null)
  const [linkStatus, setLinkStatus] = useState(null) // null|'linked'|'already_linked'|'no_match'|'unlinked_recorded'|'wrong_domain'|'consent_required'
  const [loading, setLoading] = useState(true)

  // Consent lives for the duration of this signed-in session only —
  // it's what the user clicked on the consent screen, passed through
  // to link_user_on_first_login (0013), which stamps
  // profiles.consent_at server-side at profile creation. Returning
  // users (profile already exists) never need it.
  const consentRef = useRef(false)

  const attemptLink = useCallback(async (ccidOverride) => {
    const { data, error } = await supabase.rpc('link_user_on_first_login', {
      p_ccid_override: ccidOverride ?? null,
      p_consent: consentRef.current,
    })
    if (error) throw error
    setLinkStatus(data.status)
    setProfile(data.profile)
    return data
  }, [])

  const resolveSession = useCallback(async (nextSession) => {
    setSession(nextSession)

    if (!nextSession) {
      setProfile(null)
      setLinkStatus(null)
      consentRef.current = false
      setLoading(false)
      return
    }

    const email = nextSession.user.email ?? ''
    if (!isAllowedEmail(email)) {
      setLinkStatus('wrong_domain')
      setProfile(null)
      setLoading(false)
      return
    }

    try {
      // Consent gate (0013): a session with NO profile yet must see
      // the consent screen BEFORE the linking RPC ever runs — the
      // server enforces the same rule, this check just keeps the RPC
      // from being called at all pre-consent. Returning users (a
      // profiles row exists) skip straight to linking/sweeping.
      if (!consentRef.current) {
        const { data: existing, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', nextSession.user.id)
          .maybeSingle()
        if (error) throw error
        if (!existing) {
          setLinkStatus('consent_required')
          setProfile(null)
          return
        }
      }
      await attemptLink()
    } finally {
      setLoading(false)
    }
  }, [attemptLink])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      resolveSession(initialSession)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true)
      resolveSession(nextSession)
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }, [])

  const signInWithMagicLink = useCallback(async (email) => {
    if (!isAllowedEmail(email)) {
      throw new Error(`Please use your @${ALLOWED_EMAIL_DOMAIN} email address.`)
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // "I agree — join the league": remember consent for this session and
  // run the normal linking flow (which may still land on the CCID
  // retry prompt — that path stays inside the consent already given).
  const agreeToConsent = useCallback(async () => {
    consentRef.current = true
    return attemptLink()
  }, [attemptLink])

  // "No thanks": clean sign-out. Nothing was created — the linking RPC
  // was never called without consent, and the server refuses to write
  // anything for an unconsented caller anyway.
  const declineConsent = useCallback(async () => {
    consentRef.current = false
    await supabase.auth.signOut()
  }, [])

  const retryWithCcid = useCallback(async (ccid) => {
    return attemptLink(ccid)
  }, [attemptLink])

  const value = {
    session,
    profile,
    linkStatus,
    loading,
    signInWithGoogle,
    signInWithMagicLink,
    signOut,
    retryWithCcid,
    agreeToConsent,
    declineConsent,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
