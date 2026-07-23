import api from './apiClient'
import { getClientId } from './config'
import type { LoginResponse, RegisterResponse, User, VerifyTokenResponse } from '@/types'

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export async function login(input: LoginInput): Promise<string> {
  const { data } = await api.post<LoginResponse>('/users/login', {
    email: input.email,
    password: input.password,
    client: getClientId(),
  })
  return data.token
}

export async function register(input: RegisterInput): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/users/register', {
    email: input.email,
    username: input.name,
    password: input.password,
    client: getClientId(),
  })
  return data
}

/** Validate the current token and return the fresh user record. Used at startup + heartbeat. */
export async function verifyToken(opts?: { silent?: boolean }): Promise<User> {
  const { data } = await api.get<VerifyTokenResponse>('/verify-token', { silent: opts?.silent })
  return data.user
}

export async function checkEmail(email: string): Promise<void> {
  await api.post('/users/check-email', { email })
}

export async function sendOtp(email: string): Promise<void> {
  await api.post('/users/send-otp', { email })
}

export async function verifyOtp(email: string, otp: string): Promise<string | undefined> {
  const { data } = await api.post<{ message: string; token?: string }>('/users/verifyotp', {
    email,
    otp,
  })
  return data.token
}

export async function changePassword(email: string, password: string): Promise<void> {
  await api.post('/users/change-password', { email, password })
}
