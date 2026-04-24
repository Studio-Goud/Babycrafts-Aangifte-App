'use client'

import { useEffect, useState } from 'react'
import { Transaction, BTW_CATEGORIES } from '@/lib/types'
import { formatEuro, getCurrentKwartaal, kwartaalLabel } from '@/lib/utils'
import { ChevronDown, Plus, X, Trash2, CheckSquare, Search } from 'lucide-react'

function getAvailableKwartalen() {
  const now = new Date()
  const year = now.getFullYear()
  const quarters = []
  for (let y = year; y >= year - 2; y--) {
    for (let q = 4; q >= 1; q--) {
      if (y === year && q > Math.ceil((now.getMonth() + 1) / 3)) continue
      quarters.push(`${y}-Q${q}`)
    }
  }
  return quarters
}

interface ManualBookingForm {
  datum: string
  leverancier: string
  beschrijving: string
  categorie: string
  bedrag_incl_btw: string
  btw_percentage: '0' | '9' | '21'
  type: 'inkomend' | 'uitgaand'
}

const DEFAULT_FORM: ManualBookingForm = {
  datum: new Date().toISOString().split('T')[0],
  leverancier: '',
  beschrijving: '',
  categorie: '',
  bedrag_incl_btw: '',
  btw_percentage: '21',
  type: 'uitgaand',
}

export default function TransactiesPage() {
  const [kwartaal, setKwartaal] = useState(getCurrentKwartaal())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'inkomend' | 'uitgaand'>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ManualBookingForm>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmWis, setConfirmWis] = useState(false)
  const [wisingKwartaal, setWisingKwartaal] = useState(false)

  const [search, setSearch] = useState('')

  // Bulk selection state
  const [toonAlle, setToonAlle] = useState(false)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategorie, setBulkCategorie] = useState('')
  const [bulkBtw, setBulkBtw] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ kwartaal, type: filter })
    const res = await fetch(`/api/data/transactions?${params}`)
    const json = await res.json()
    setTransactions(json.transactions || [])
    setSelectedIds(new Set())
    setLoading(false)
  }

  useEffect(() => { load() }, [kwartaal, filter])

  const kwartalen = getAvailableKwartalen()
  const totaalKosten = transactions.filter(t => t.type === 'inkomend').reduce((s, t) => s + t.bedrag_excl_btw, 0)
  const totaalOmzet = transactions.filter(t => t.type === 'uitgaand').reduce((s, t) => s + t.bedrag_excl_btw, 0)

  const btwPct = parseFloat(form.btw_percentage) / 100
  const bedragIncl = parseFloat(form.bedrag_incl_btw) || 0
  const bedragExcl = bedragIncl > 0 ? bedragIncl / (1 + btwPct) : 0
  const btwBedrag = bedragIncl - bedragExcl

  const q = search.trim().toLowerCase()
  const ingeboektCount = transactions.filter(t => t.categorie).length
  const filtered = transactions
    .filter(t => toonAlle || !t.categorie)
    .filter(t => !q || (
      (t.leverancier || '').toLowerCase().includes(q) ||
      (t.beschrijving || '').toLowerCase().includes(q) ||
      (t.categorie || '').toLowerCase().includes(q)
    ))

  const allVisible = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allVisible) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filtered.forEach(t => next.delete(t.id))
        return next
      })
    } else {
      setSelectedIds(prev => new Set([...prev, ...filtered.map(t => t.id)]))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleWisKwartaal = async () => {
    setWisingKwartaal(true)
    await fetch(`/api/data/transactions?kwartaal=${kwartaal}`, { method: 'DELETE' })
    setConfirmWis(false)
    setWisingKwartaal(false)
    await load()
  }

  const handleSave = async () => {
    if (!form.datum || !form.bedrag_incl_btw || !form.type) {
      setSaveError('Vul alle verplichte velden in.')
      return
    }
    setSaving(true)
    setSaveError('')
    const res = await fetch('/api/data/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datum: form.datum,
        leverancier: form.leverancier || undefined,
        beschrijving: form.beschrijving || undefined,
        categorie: form.categorie || undefined,
        bedrag_incl_btw: parseFloat(form.bedrag_incl_btw),
        btw_percentage: parseFloat(form.btw_percentage),
        type: form.type,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setSaveError(json.error || 'Opslaan mislukt')
    } else {
      setShowForm(false)
      setForm(DEFAULT_FORM)
      await load()
    }
    setSaving(false)
  }

  const handleBulkApply = async () => {
    if (!bulkCategorie && !bulkBtw) return
    setBulkApplying(true)
    const body: { ids: string[]; categorie?: string; btw_percentage?: number } = {
      ids: Array.from(selectedIds),
    }
    if (bulkCategorie) body.categorie = bulkCategorie
    if (bulkBtw) body.btw_percentage = parseInt(bulkBtw)
    await fetch('/api/data/transactions/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBulkCategorie('')
    setBulkBtw('')
    setBulkApplying(false)
    await load()
  }

  const handleBulkDelete = async () => {
    setBulkApplying(true)
    await fetch('/api/data/transactions/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    setConfirmBulkDelete(false)
    setBulkApplying(false)
    await load()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transacties</h1>
          <p className="text-gray-500 mt-1">Alle ingeboekte transacties</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Handmatig boeken
          </button>
          <div className="relative">
            <select
              value={kwartaal}
              onChange={e => setKwartaal(e.target.value)}
              className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-gray-700 cursor-pointer"
            >
              {kwartalen.map(kw => (
                <option key={kw} value={kw}>{kwartaalLabel(kw)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setConfirmWis(true)}
            disabled={transactions.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Wis alle transacties en documenten van dit kwartaal"
          >
            <Trash2 className="w-4 h-4" />
            Wis kwartaal
          </button>
        </div>
      </div>

      {/* Manual booking modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900">Handmatig boeken</h3>
              <button onClick={() => { setShowForm(false); setSaveError('') }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Type *</label>
                <div className="flex gap-2">
                  {(['uitgaand', 'inkomend'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.type === t
                          ? t === 'uitgaand' ? 'bg-green-50 border-green-400 text-green-700' : 'bg-red-50 border-red-400 text-red-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {t === 'uitgaand' ? 'Omzet (inkomend geld)' : 'Kosten (uitgaand geld)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Datum *</label>
                  <input
                    type="date"
                    value={form.datum}
                    onChange={e => setForm(f => ({ ...f, datum: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Leverancier</label>
                  <input
                    type="text"
                    value={form.leverancier}
                    onChange={e => setForm(f => ({ ...f, leverancier: e.target.value }))}
                    placeholder="Naam bedrijf"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Beschrijving</label>
                <input
                  type="text"
                  value={form.beschrijving}
                  onChange={e => setForm(f => ({ ...f, beschrijving: e.target.value }))}
                  placeholder="Omschrijving van de transactie"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Categorie</label>
                <select
                  value={form.categorie}
                  onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Kies categorie…</option>
                  {BTW_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Bedrag incl. BTW *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-sm text-gray-400">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.bedrag_incl_btw}
                      onChange={e => setForm(f => ({ ...f, bedrag_incl_btw: e.target.value }))}
                      placeholder="0,00"
                      className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">BTW tarief *</label>
                  <select
                    value={form.btw_percentage}
                    onChange={e => setForm(f => ({ ...f, btw_percentage: e.target.value as '0' | '9' | '21' }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="0">0% (vrijgesteld)</option>
                    <option value="9">9% (laag tarief)</option>
                    <option value="21">21% (hoog tarief)</option>
                  </select>
                </div>
              </div>

              {bedragIncl > 0 && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-600 flex gap-6">
                  <span>Excl. BTW: <strong>{formatEuro(bedragExcl)}</strong></span>
                  <span>BTW: <strong>{formatEuro(btwBedrag)}</strong></span>
                </div>
              )}

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowForm(false); setSaveError(''); setForm(DEFAULT_FORM) }}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wis kwartaal confirm modal */}
      {confirmWis && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Kwartaal wissen?</h3>
            <p className="text-sm text-gray-500 mb-1">
              Dit verwijdert alle <strong>{transactions.length} transacties</strong> en bijbehorende documenten van <strong>{kwartaalLabel(kwartaal)}</strong>.
            </p>
            <p className="text-xs text-red-500 mb-5">Dit kan niet ongedaan worden gemaakt.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmWis(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Annuleren
              </button>
              <button onClick={handleWisKwartaal} disabled={wisingKwartaal}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {wisingKwartaal ? 'Bezig...' : 'Alles wissen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirm modal */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Transacties verwijderen?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Verwijder <strong>{selectedIds.size} geselecteerde transacties</strong>. Dit kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBulkDelete(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Annuleren
              </button>
              <button onClick={handleBulkDelete} disabled={bulkApplying}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {bulkApplying ? 'Bezig...' : 'Verwijderen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium">Omzet excl. BTW</p>
          <p className="text-xl font-bold text-green-700 mt-1">{formatEuro(totaalOmzet)}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs text-red-600 font-medium">Kosten excl. BTW</p>
          <p className="text-xl font-bold text-red-700 mt-1">{formatEuro(totaalKosten)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-600 font-medium">Resultaat</p>
          <p className={`text-xl font-bold mt-1 ${totaalOmzet - totaalKosten >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatEuro(totaalOmzet - totaalKosten)}
          </p>
        </div>
      </div>

      {/* Filter + Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-2">
          {(['all', 'inkomend', 'uitgaand'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'Alle' : f === 'inkomend' ? 'Kosten' : 'Omzet'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setToonAlle(v => !v)}
          className={`px-3 py-1.5 text-xs rounded-full font-medium border transition-colors ${
            toonAlle
              ? 'bg-gray-700 text-white border-gray-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {toonAlle ? 'Verberg ingeboekt' : `Toon ingeboekt${ingeboektCount > 0 ? ` (${ingeboektCount})` : ''}`}
        </button>
        <div className="relative flex-1 max-w-sm ml-auto">
          <Search className="absolute left-3 top-2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op leverancier, beschrijving, categorie…"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {q && (
          <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} resultaat{filtered.length !== 1 ? 'en' : ''}</span>
        )}
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="sticky top-4 z-30 mb-3 bg-blue-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg flex-wrap">
          <span className="text-sm font-medium mr-1">
            <CheckSquare className="w-4 h-4 inline mr-1.5 opacity-80" />
            {selectedIds.size} geselecteerd
          </span>
          <div className="h-4 w-px bg-white/30" />
          <select
            value={bulkCategorie}
            onChange={e => setBulkCategorie(e.target.value)}
            className="bg-white/15 text-white text-xs rounded-lg px-2.5 py-1.5 border border-white/30 min-w-36"
          >
            <option value="">Categorie…</option>
            {BTW_CATEGORIES.map(c => <option key={c} value={c} className="text-gray-900">{c}</option>)}
          </select>
          <select
            value={bulkBtw}
            onChange={e => setBulkBtw(e.target.value)}
            className="bg-white/15 text-white text-xs rounded-lg px-2.5 py-1.5 border border-white/30"
          >
            <option value="">BTW tarief…</option>
            <option value="0" className="text-gray-900">0%</option>
            <option value="9" className="text-gray-900">9%</option>
            <option value="21" className="text-gray-900">21%</option>
          </select>
          <button
            onClick={handleBulkApply}
            disabled={bulkApplying || (!bulkCategorie && !bulkBtw)}
            className="bg-white text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bulkApplying ? 'Bezig...' : 'Toepassen'}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1.5 text-xs font-medium bg-red-500 hover:bg-red-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Verwijderen
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-white/70 hover:text-white ml-1"
            title="Selectie opheffen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-white rounded animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p>{q ? `Geen resultaten voor "${search}"` : toonAlle ? 'Geen transacties in dit kwartaal' : 'Alle transacties zijn ingeboekt 🎉'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allVisible}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Leverancier</th>
                <th className="px-4 py-3 font-medium">Beschrijving</th>
                <th className="px-4 py-3 font-medium">Categorie</th>
                <th className="px-4 py-3 font-medium text-right">Excl. BTW</th>
                <th className="px-4 py-3 font-medium text-right">BTW</th>
                <th className="px-4 py-3 font-medium text-right">Incl. BTW</th>
                <th className="px-4 py-3 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => {
                const selected = selectedIds.has(t.id)
                return (
                  <tr
                    key={t.id}
                    onClick={() => toggleOne(t.id)}
                    className={`cursor-pointer transition-colors ${selected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleOne(t.id)}
                        className="rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.datum}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-32 truncate">{t.leverancier || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-40 truncate">{t.beschrijving || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{t.categorie || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatEuro(t.bedrag_excl_btw)}</td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">{t.btw_percentage || 0}%</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatEuro(t.bedrag_incl_btw || 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        t.type === 'inkomend' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {t.type === 'inkomend' ? 'Kosten' : 'Omzet'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
