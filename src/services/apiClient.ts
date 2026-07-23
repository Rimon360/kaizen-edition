import axios, {
  type AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { buildSecurityHeaders } from '@/utils/hmac'
import { getToken } from '@/store/authStore'
import { getApiSecret, getHmacSecret, getApiBaseUrl } from './config'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Skip the global loading indicator (e.g. the 60s heartbeat). */
    silent?: boolean
  }
}

const instance: AxiosInstance = axios.create()

function hasHeader(headers: AxiosHeaders | Record<string, unknown>, name: string): boolean {
  if (!headers) return false
  const h = headers as AxiosHeaders
  if (typeof h.has === 'function') return h.has(name) || h.has(name.toLowerCase())
  const rec = headers as Record<string, unknown>
  return Boolean(rec[name] ?? rec[name.toLowerCase()])
}

instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  // Backend lives under `${baseUrl}/api/...`; services pass `/users/login` etc.
  config.baseURL = `${getApiBaseUrl()}/api`
  config.headers = config.headers ?? ({} as AxiosHeaders)

  // 1. Determine the exact bytes we sign and ensure they match what is sent.
  let bodyStr = ''
  if (config.data instanceof FormData) {
    bodyStr = ''
    if (typeof (config.headers as AxiosHeaders).delete === 'function') {
      ;(config.headers as AxiosHeaders).delete('Content-Type')
    }
  } else if (typeof config.data === 'string') {
    bodyStr = config.data
    if (!hasHeader(config.headers, 'Content-Type')) {
      config.headers.set('Content-Type', 'application/json')
    }
  } else if (config.data != null && typeof config.data === 'object') {
    bodyStr = JSON.stringify(config.data)
    config.data = bodyStr
    if (!hasHeader(config.headers, 'Content-Type')) {
      config.headers.set('Content-Type', 'application/json')
    }
  }

  // 2. Sign and attach the four security headers (secrets resolved at call time).
  const sec = await buildSecurityHeaders(getApiSecret(), getHmacSecret(), bodyStr)
  config.headers.set('x-api-secret', sec['x-api-secret'])
  config.headers.set('x-timestamp', sec['x-timestamp'])
  config.headers.set('x-nonce', sec['x-nonce'])
  config.headers.set('x-signature', sec['x-signature'])

  // 3. Authorization — read synchronously from the in-memory auth store.
  if (!hasHeader(config.headers, 'Authorization')) {
    const token = getToken()
    if (token) config.headers.set('Authorization', 'Bearer ' + token)
  }

  return config
})

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Surface the backend's (often Spanish) message so UI catch blocks show the real reason.
    const serverMsg = error?.response?.data?.message
    if (serverMsg) error.message = serverMsg
    return Promise.reject(error)
  },
)

export default instance
