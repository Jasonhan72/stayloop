'use client'
// /roommates — Group application (V3 section 19)
import { useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

interface Member {
  initials: string
  name: string
  email?: string
  score: number
  share: number
  sharePct: number
  lead?: boolean
  verified?: boolean
  awaiting?: boolean
  invited?: boolean
}

const DEFAULT_MEMBERS: Member[] = [
  { initials: 'WC', name: 'Wei Chen', score: 872, share: 940, sharePct: 40, lead: true, verified: true },
  { initials: 'MP', name: 'Maya Patel', score: 824, share: 823, sharePct: 35, verified: true },
  { initials: 'JK', name: 'James Kim', score: 798, share: 587, sharePct: 25, awaiting: true },
]

export default function RoommatesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [members, setMembers] = useState<Member[]>(DEFAULT_MEMBERS)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newShare, setNewShare] = useState(25)

  const totalRent = 2350
  const totalScore = Math.round((members.reduce((sum, m) => sum + m.score * (m.sharePct / 100), 0)))

  const handleAddMember = () => {
    if (!newEmail || !newName) return
    const initials = newName
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join('')

    const newMember: Member = {
      initials,
      name: newName,
      email: newEmail,
      score: 750,
      share: Math.round(totalRent * (newShare / 100)),
      sharePct: newShare,
      invited: true,
    }

    setMembers([...members, newMember])
    setNewEmail('')
    setNewName('')
    setNewShare(25)
    setShowAddModal(false)
  }
  return (
    <PageShell role="tenant">
      <Phone time="14:48">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: v3.textMuted }}>‹</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isZh ? '合租' : 'Roommates'}</span>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              fontSize: 20,
              color: v3.brandStrong,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              width: 32,
              height: 32,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            +
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {isZh ? '合租申请' : 'Group application'}
          </h1>
          <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 16 }}>
            {isZh ? 'Hudson #1208 · 3 人组合' : 'Hudson #1208 · 3 members'}
          </div>

          {/* Group score card */}
          <div
            style={{
              background: 'linear-gradient(180deg, #0F2A23 0%, #0A1916 100%)',
              color: '#fff',
              borderRadius: 16,
              padding: 18,
              marginBottom: 16,
              cursor: 'help',
            }}
            title={isZh ? '加权平均：每人评分乘以其租金占比后相加' : 'Weighted by rent share: each member score × share %'}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
              {isZh ? '合并评分 · GROUP SCORE' : 'GROUP SCORE'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em', background: 'linear-gradient(180deg, #fff, #34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>
                {totalScore}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{isZh ? '加权 (按租金占比)' : 'blended (rent-weighted)'}</span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>
              {isZh
                ? `合计月入 $${members.reduce((sum, m) => sum + (m.share * 100) / (m.sharePct || 1), 0).toFixed(0)} · 房租覆盖率 ${(members.reduce((sum, m) => sum + (m.share * 100) / (m.sharePct || 1), 0) / totalRent).toFixed(2)}×`
                : `Combined income $${members.reduce((sum, m) => sum + (m.share * 100) / (m.sharePct || 1), 0).toFixed(0)}/mo · ${(members.reduce((sum, m) => sum + (m.share * 100) / (m.sharePct || 1), 0) / totalRent).toFixed(2)}× rent ($${totalRent})`}
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {isZh ? '成员 · MEMBERS' : 'MEMBERS · 成员'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => (
              <div key={m.initials + m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12 }}>
                <span style={{ width: 36, height: 36, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{m.initials}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</span>
                    {m.lead && <span style={{ fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '1px 6px', borderRadius: 4 }}>LEAD</span>}
                  </div>
                  <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                    {isZh ? `评分 ${m.score} · 月付 $${m.share} (${m.sharePct}%)` : `Score ${m.score} · Pays $${m.share} (${m.sharePct}%)`}
                  </div>
                </div>
                {m.verified ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: v3.success, background: v3.successSoft, padding: '4px 10px', borderRadius: 999 }}>✓ {isZh ? '已验证' : 'Verified'}</span>
                ) : m.awaiting ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: v3.warning, background: v3.warningSoft, padding: '4px 10px', borderRadius: 999 }}>⏳ {isZh ? '等待中' : 'Awaiting'}</span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: v3.info, background: v3.infoSoft, padding: '4px 10px', borderRadius: 999 }}>✉ {isZh ? '已邀请' : 'Invited'}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, padding: 14, background: v3.brandSoft, border: `1px solid ${v3.brandSoft}`, borderLeft: `3px solid ${v3.brand}`, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary, marginBottom: 4 }}>
              ✓ {isZh ? '连带责任' : 'Joint & several liability'}
            </div>
            <div style={{ fontSize: 12, color: v3.textSecondary, lineHeight: 1.5 }}>
              {isZh
                ? '每位室友对全部租金承担连带责任。Stayloop 内部分账，房东只看见单笔到账。'
                : 'Each roommate is fully liable for the whole rent. Stayloop holds rent split internally — landlord sees one payment.'}
            </div>
          </div>

          {/* Apply as group button */}
          <button
            style={{
              width: '100%',
              marginTop: 20,
              background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: 14,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isZh ? '向房东提交合租申请' : 'Submit group application'}
          </button>
        </div>

        {/* Add member modal */}
        {showAddModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'flex-end',
              zIndex: 100,
            }}
            onClick={() => setShowAddModal(false)}
          >
            <div
              style={{
                background: v3.surfaceCard,
                width: '100%',
                borderRadius: '18px 18px 0 0',
                padding: '24px 16px 32px',
                maxHeight: '80vh',
                overflow: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                {isZh ? '添加合租人' : 'Add roommate'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Email input */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: v3.textMuted }}>
                    {isZh ? '邮箱' : 'Email'}
                  </label>
                  <input
                    type="email"
                    placeholder="roommate@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      border: `1px solid ${v3.border}`,
                      borderRadius: 10,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      color: v3.textPrimary,
                      WebkitTextFillColor: v3.textPrimary,
                    }}
                  />
                </div>

                {/* Name input */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: v3.textMuted }}>
                    {isZh ? '名字' : 'Name'}
                  </label>
                  <input
                    type="text"
                    placeholder={isZh ? '例如：Alex Wong' : 'E.g., Alex Wong'}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      border: `1px solid ${v3.border}`,
                      borderRadius: 10,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      color: v3.textPrimary,
                      WebkitTextFillColor: v3.textPrimary,
                    }}
                  />
                </div>

                {/* Share slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: v3.textMuted }}>
                      {isZh ? '租金占比' : 'Rent share'}
                    </label>
                    <span style={{ fontSize: 14, fontWeight: 700, color: v3.brand }}>{newShare}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    value={newShare}
                    onChange={(e) => setNewShare(parseInt(e.target.value, 10))}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                  <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 6 }}>
                    {isZh ? `月付 $${Math.round(totalRent * (newShare / 100))}` : `Pays $${Math.round(totalRent * (newShare / 100))}/mo`}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button
                  onClick={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    background: v3.surface,
                    color: v3.textPrimary,
                    border: `1px solid ${v3.border}`,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={handleAddMember}
                  disabled={!newEmail || !newName}
                  style={{
                    flex: 1,
                    background: newEmail && newName ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' : v3.divider,
                    color: newEmail && newName ? '#fff' : v3.textMuted,
                    border: 'none',
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: newEmail && newName ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isZh ? '发送邀请' : 'Send invite'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Phone>
    </PageShell>
  )
}
