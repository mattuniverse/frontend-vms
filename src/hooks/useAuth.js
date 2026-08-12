import { useState, useCallback } from 'react'
import { login as apiLogin, logout as apiLogout } from '../services/api'

export function useAuth() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vms_user')) } catch { return null }
  })

  const signIn = useCallback(async (email, password) => {
    const res = await apiLogin(email, password)
    localStorage.setItem('vms_token', res.data.access_token)
    localStorage.setItem('vms_user', JSON.stringify(res.data.user))
    setUser(res.data.user)
    return res.data.user
  }, [])

  const signOut = useCallback(async () => {
    try { await apiLogout() } catch {}
    localStorage.removeItem('vms_token')
    localStorage.removeItem('vms_user')
    setUser(null)
  }, [])

  return { user, signIn, signOut }
}
