import { useState, useCallback } from 'react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import {
  login as apiLogin,
  logout as apiLogout,
  webauthnLoginOptions,
  webauthnLoginVerify,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
} from '../services/api'

export function useAuth() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vms_user')) } catch { return null }
  })

  // Step 1: email + password. Returns a status object the UI branches on —
  // it does NOT log the user in by itself.
  //   { status: 'registration_required', preAuthToken }
  //     -> account has no enrolled device yet; show the "enable biometrics" screen
  //   { status: 'biometric_required', preAuthToken }
  //     -> device already enrolled; caller should immediately call
  //        verifyBiometric() to trigger the Face ID/fingerprint prompt
  const signInWithPassword = useCallback(async (email, password) => {
    const res = await apiLogin(email, password)
    const { pre_auth_token, registration_required } = res.data
    return {
      status: registration_required ? 'registration_required' : 'biometric_required',
      preAuthToken: pre_auth_token,
    }
  }, [])

  // Step 2a: first-time enrollment. Triggers the native Face ID/fingerprint
  // prompt via the browser's WebAuthn API, then stores the resulting public
  // key on the backend. Does not log the user in — call verifyBiometric
  // right after, or simply prompt them to sign in again.
  const enrollBiometric = useCallback(async (preAuthToken, nickname) => {
    const { data } = await webauthnRegisterOptions(preAuthToken)
    const attResp = await startRegistration({ optionsJSON: JSON.parse(data.options) })
    await webauthnRegisterVerify(preAuthToken, attResp, nickname)
  }, [])

  // Step 2b: biometric confirmation on an already-enrolled device. This is
  // what finally issues a real session token.
  const verifyBiometric = useCallback(async (preAuthToken) => {
    const { data: optionsRes } = await webauthnLoginOptions(preAuthToken)
    const authResp = await startAuthentication({ optionsJSON: JSON.parse(optionsRes.options) })
    const { data } = await webauthnLoginVerify(preAuthToken, authResp)
    localStorage.setItem('vms_token', data.access_token)
    localStorage.setItem('vms_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const signOut = useCallback(async () => {
    try { await apiLogout() } catch {}
    localStorage.removeItem('vms_token')
    localStorage.removeItem('vms_user')
    setUser(null)
  }, [])

  return { user, signInWithPassword, enrollBiometric, verifyBiometric, signOut }
}
