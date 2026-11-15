import { describe, it, expect } from 'vitest'
import { adminGate, adminMenuItems, canSeeAuditLog, isAdminRole } from './admin-access'

describe('isAdminRole', () => {
  it('accepts ADMIN and OWNER only', () => {
    expect(isAdminRole('ADMIN')).toBe(true)
    expect(isAdminRole('OWNER')).toBe(true)
    expect(isAdminRole('USER')).toBe(false)
    expect(isAdminRole(undefined)).toBe(false)
    expect(isAdminRole('admin')).toBe(false)
  })
})

describe('canSeeAuditLog', () => {
  it('is OWNER only', () => {
    expect(canSeeAuditLog('OWNER')).toBe(true)
    expect(canSeeAuditLog('ADMIN')).toBe(false)
    expect(canSeeAuditLog('USER')).toBe(false)
    expect(canSeeAuditLog(undefined)).toBe(false)
  })
})

describe('adminGate', () => {
  it('sends signed-out visitors to sign in', () => {
    expect(adminGate(null)).toBe('sign-in')
    expect(adminGate({ id: null })).toBe('sign-in')
    expect(adminGate({ role: 'ADMIN' })).toBe('sign-in')
  })

  it('sends non-admins home', () => {
    expect(adminGate({ id: 'u1', role: 'USER' })).toBe('home')
    expect(adminGate({ id: 'u1' })).toBe('home')
    expect(adminGate({ id: 'u1', role: 'SUPERUSER' })).toBe('home')
  })

  it('lets admins and owners in', () => {
    expect(adminGate({ id: 'u1', role: 'ADMIN' })).toBe('allow')
    expect(adminGate({ id: 'u1', role: 'OWNER' })).toBe('allow')
  })
})

describe('adminMenuItems', () => {
  it('gives admins only Users', () => {
    expect(adminMenuItems('ADMIN').map((i) => i.key)).toEqual(['users'])
  })

  it('gives owners Users and Audit log', () => {
    const items = adminMenuItems('OWNER')
    expect(items.map((i) => i.key)).toEqual(['users', 'audit-log'])
    expect(items.map((i) => i.href)).toEqual(['/admin/users', '/admin/audit-log'])
  })

  it('gives plain users nothing', () => {
    expect(adminMenuItems('USER')).toEqual([])
  })
})
