import { useState } from 'react'
import { login, register, verifyToken } from '@/services/auth.service'
import { useAuthStore } from '@/store/authStore'
import { SOFTWARE_ROLES } from '@/types'
import { tx } from '@/i18n'

interface AuthError {
  message: string
}

export function useAuthActions() {
  const setToken = useAuthStore((s) => s.setToken)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const [loading, setLoading] = useState(false)

  const signIn = async (email: string, password: string): Promise<void> => {
    setLoading(true)
    try {
      const token = await login({ email, password })
      await setToken(token)
      // After the token is persisted, ANY failure (role denied OR a network/server
      // hiccup during verify) must clear it again so a failed sign-in never leaves
      // a usable session behind.
      try {
        const user = await verifyToken()
        if (!SOFTWARE_ROLES.includes(user.role)) {
          throw { message: tx('auth.protected.roleDenied') } as AuthError
        }
        setUser(user)
      } catch (err) {
        await logout()
        throw err
      }
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (name: string, email: string, password: string): Promise<void> => {
    setLoading(true)
    try {
      const res = await register({ name, email, password })
      await setToken(res.token)
      if (!SOFTWARE_ROLES.includes(res.user.role)) {
        await logout()
        throw {
          message: tx('auth.protected.roleDenied'),
        } as AuthError
      }
      setUser(res.user)
    } finally {
      setLoading(false)
    }
  }

  return { signIn, signUp, loading }
}
