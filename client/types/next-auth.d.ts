import { DefaultSession } from 'next-auth'
import type { Role } from '@/lib/admin-access'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username?: string | null
      role?: Role
    } & DefaultSession['user']
  }

  interface User {
    username?: string | null
  }
}

declare module '@auth/core/adapters' {
  interface AdapterUser {
    username?: string | null
  }
}
