'use client'
// Agent Client Folders — two-pane with client list and detail

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import AppHeader from '@/components/AppHeader'

interface Client {
  id: string
  email: string
  name: string
  role: 'tenant' | 'landlord'
}

export default function AgentClientsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [clients, setClients] = useState<Client[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientRole, setNewClientRole] = useState<'tenant' | 'landlord'>('landlord')

  useEffect(() => {
    if (!user) return
    loadClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function loadClients() {
    const { data } = await supabase
      .from('screening_cases')
      .select('*')
      .eq('source', 'agent_package')
      .eq('owner_id', user!.profileId)

    const uniqueClients = new Map<string, Client>()
    ;(data as any[])?.forEach((c) => {
      if (!uniqueClients.has(c.applicant_email)) {
        uniqueClients.set(c.applicant_email, {
          id: c.id,
          email: c.applicant_email,
          name: c.applicant_name,
          role: 'tenant',
        })
      }
    })
    setClients(Array.from(uniqueClients.values()))
    setLoading(false)
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  )
  const selected = selectedId ? clients.find((c) => c.id === selectedId) : null

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader title={isZh ? '客户文件夹' : 'Client Folders'} />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
        {/* Sidebar: Client list */}
        <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' }}>
          <input
            type="text"
            placeholder={isZh ? '搜索客户…' : 'Search clients…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              marginBottom: 12,
              border: `1px solid ${v3.border}`,
              borderRadius: 6,
              fontSize: 12,
              color: v3.textPrimary,
            }}
          />

          <div style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: v3.textMuted, fontSize: 12, paddingTop: 20 }}>
                {isZh ? '暂无客户' : 'No clients'}
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    marginBottom: 4,
                    border: `1px solid ${selectedId === c.id ? v3.brand : 'transparent'}`,
                    background: selectedId === c.id ? v3.brandSoft : 'transparent',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: selectedId === c.id ? 600 : 500,
                    color: v3.textPrimary,
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: v3.textMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.email}
                  </div>
                </button>
              ))
            )}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: v3.brandSoft,
              color: v3.brand,
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + {isZh ? '添加客户' : 'Add client'}
          </button>
        </div>

        {/* Detail pane */}
        <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 24 }}>
          {selected ? (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
                {selected.name}
              </h2>
              <div style={{ fontSize: 13, color: v3.textMuted, marginBottom: 20 }}>
                {selected.email}
              </div>
              <div style={{ fontSize: 12, color: v3.textSecondary, marginBottom: 20 }}>
                <strong>{isZh ? '角色：' : 'Role: '}</strong>
                {selected.role}
              </div>
              <textarea
                placeholder={isZh ? '笔记...' : 'Notes...'}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `1px solid ${v3.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  minHeight: 120,
                  color: v3.textPrimary,
                  boxSizing: 'border-box',
                }}
              />
            </>
          ) : (
            <div style={{ textAlign: 'center', color: v3.textMuted }}>
              {isZh ? '选择客户查看详情' : 'Select a client to view details'}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}>
          <div style={{
            background: v3.surfaceCard,
            borderRadius: 14,
            padding: 24,
            maxWidth: 400,
            width: '90%',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
              {isZh ? '添加客户' : 'Add client'}
            </h3>
            <input
              type="text"
              placeholder={isZh ? '姓名' : 'Name'}
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: 12,
                border: `1px solid ${v3.border}`,
                borderRadius: 8,
                fontSize: 14,
                color: v3.textPrimary,
                boxSizing: 'border-box',
              }}
            />
            <input
              type="email"
              placeholder={isZh ? '邮箱' : 'Email'}
              value={newClientEmail}
              onChange={(e) => setNewClientEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: 12,
                border: `1px solid ${v3.border}`,
                borderRadius: 8,
                fontSize: 14,
                color: v3.textPrimary,
                boxSizing: 'border-box',
              }}
            />
            <select
              value={newClientRole}
              onChange={(e) => setNewClientRole(e.target.value as 'tenant' | 'landlord')}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: 16,
                border: `1px solid ${v3.border}`,
                borderRadius: 8,
                fontSize: 14,
                color: v3.textPrimary,
                boxSizing: 'border-box',
              }}
            >
              <option value="tenant">{isZh ? '租客' : 'Tenant'}</option>
              <option value="landlord">{isZh ? '房东' : 'Landlord'}</option>
            </select>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '8px 16px',
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  color: v3.textPrimary,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setNewClientName('')
                  setNewClientEmail('')
                }}
                style={{
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '添加' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
