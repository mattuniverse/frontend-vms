import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('vms_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('vms_token')
      localStorage.removeItem('vms_user')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────
export const login = (email, password) => {
  const form = new URLSearchParams()
  form.append('username', email)
  form.append('password', password)
  return api.post('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}
export const logout = () => api.post('/auth/logout')

// ── Visitors ──────────────────────────────────────────────────────
export const getVisitors     = (params) => api.get('/visitors', { params })
export const createVisitor   = (data)   => api.post('/visitors', data)
export const toggleBlockVisitor = (id)  => api.patch(`/visitors/${id}/block`)

// ── Visit Requests ────────────────────────────────────────────────
export const getVisitRequests  = (params)       => api.get('/visit-requests', { params })
export const createVisitRequest = (data)        => api.post('/visit-requests', data)
export const approveRequest    = (id, data)     => api.patch(`/visit-requests/${id}/approve`, data)
export const checkInVisitor    = (id, data)     => api.patch(`/visit-requests/${id}/check-in`, data)
export const checkOutVisitor   = (id)           => api.patch(`/visit-requests/${id}/check-out`)
export const lookupByQR        = (qrRef)        => api.get(`/visit-requests/by-qr/${qrRef}`)

// ── Audit & Analytics ─────────────────────────────────────────────
export const getAuditLog        = (params) => api.get('/audit-log', { params })
export const getAnalyticsSummary = ()      => api.get('/analytics/summary')

export default api
