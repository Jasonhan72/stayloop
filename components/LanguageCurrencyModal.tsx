'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n, LANGUAGES, CURRENCIES, type Lang, type Currency } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  initialTab?: 'language' | 'currency'
}

export default function LanguageCurrencyModal({ open, onClose, initialTab = 'language' }: Props) {
  const { lang, setLang, currency, setCurrency } = useI18n()
  const zh = lang === 'zh'
  const [tab, setTab] = useState<'language' | 'currency'>(initialTab)
  const [selectedLang, setSelectedLang] = useState<Lang>(lang)
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(currency)

  useEffect(() => {
    if (open) {
      setTab(initialTab)
      setSelectedLang(lang)
      setSelectedCurrency(currency)
    }
  }, [open, initialTab, lang, currency])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handler)
    }
  }, [open, onClose])

  const handleSave = useCallback(() => {
    setLang(selectedLang)
    setCurrency(selectedCurrency)
    onClose()
  }, [selectedLang, selectedCurrency, setLang, setCurrency, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Centering wrapper */}
      <div className="flex min-h-full items-center justify-center px-4 py-6">
      {/* Modal */}
      <div className="relative w-full max-w-[568px] max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(0,0,0,0.28)] flex flex-col">
        {/* Header — fixed */}
        <div className="flex items-center justify-between border-b border-[#EBEBEB] px-6 py-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[#F7F7F7]"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h2 className="text-[16px] font-semibold text-[#222]">
            {zh ? '语言和货币' : 'Language and currency'}
          </h2>
          <div className="w-8" />
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-[#EBEBEB] px-6 flex-shrink-0">
          <button
            onClick={() => setTab('language')}
            className="relative px-1 pb-3 pt-4 text-[14px] font-semibold transition"
            style={{ color: tab === 'language' ? '#222' : '#717171' }}
          >
            {zh ? '语言和地区' : 'Language and region'}
            {tab === 'language' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#222]" />
            )}
          </button>
          <button
            onClick={() => setTab('currency')}
            className="relative ml-6 px-1 pb-3 pt-4 text-[14px] font-semibold transition"
            style={{ color: tab === 'currency' ? '#222' : '#717171' }}
          >
            {zh ? '货币' : 'Currency'}
            {tab === 'currency' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#222]" />
            )}
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {tab === 'language' ? (
            <div>
              <h3 className="mb-1 text-[14px] font-semibold text-[#222]">
                {zh ? '建议使用的语言和地区' : 'Suggested languages and regions'}
              </h3>
              <p className="mb-5 text-[13px] text-[#717171]">
                {zh ? 'Stayloop 目前支持以下语言' : 'Stayloop currently supports the following languages'}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setSelectedLang(l.code)}
                    className="rounded-xl border-2 px-4 py-3 text-left transition hover:bg-[#F7F7F7]"
                    style={{
                      borderColor: selectedLang === l.code ? '#222' : '#EBEBEB',
                      background: selectedLang === l.code ? '#F7F7F7' : 'white',
                    }}
                  >
                    <div className="text-[14px] font-medium text-[#222]">{l.labelLocal}</div>
                    <div className="mt-0.5 text-[12px] text-[#717171]">{l.label}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="mb-1 text-[14px] font-semibold text-[#222]">
                {zh ? '选择货币' : 'Choose a currency'}
              </h3>
              <p className="mb-5 text-[13px] text-[#717171]">
                {zh
                  ? '价格将以所选货币显示（实际支付货币以房源所在地为准）'
                  : 'Prices will be shown in the selected currency (payment currency is based on listing location)'}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setSelectedCurrency(c.code)}
                    className="rounded-xl border-2 px-4 py-3 text-left transition hover:bg-[#F7F7F7]"
                    style={{
                      borderColor: selectedCurrency === c.code ? '#222' : '#EBEBEB',
                      background: selectedCurrency === c.code ? '#F7F7F7' : 'white',
                    }}
                  >
                    <div className="text-[14px] font-medium text-[#222]">
                      {c.symbol} – {c.code}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[#717171]">
                      {zh ? c.labelZh : c.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — fixed */}
        <div className="flex items-center justify-between border-t border-[#EBEBEB] px-6 py-4 flex-shrink-0">
          <button
            onClick={() => {
              setSelectedLang(lang)
              setSelectedCurrency(currency)
            }}
            className="text-[14px] font-semibold text-[#222] underline transition hover:text-[#000]"
          >
            {zh ? '重置' : 'Reset'}
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-[#222] px-6 py-[10px] text-[14px] font-semibold text-white transition hover:bg-[#000]"
          >
            {zh ? '保存' : 'Save'}
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
