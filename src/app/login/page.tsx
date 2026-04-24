'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt, Lock } from 'lucide-react'

export default function LoginPage() {
  const [code, setCode] = useState(['', '', '', ''])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newCode = [...code]
    newCode[index] = value.slice(-1)
    setCode(newCode)
    setError(false)

    if (value && index < 3) {
      inputs.current[index + 1]?.focus()
    }

    if (newCode.every(d => d !== '') && (value !== '' || index === 3)) {
      submit(newCode.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  const submit = async (password: string) => {
    setLoading(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push('/dashboard')
      router.refresh()
    } else {
      setError(true)
      setCode(['', '', '', ''])
      setLoading(false)
      setTimeout(() => inputs.current[0]?.focus(), 50)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        {/* Logo */}
        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Receipt className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Babycrafts</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">BTW Administratie</p>

        {/* PIN */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-gray-400" />
          <p className="text-sm font-medium text-gray-600">Voer je code in</p>
        </div>

        <div className="flex justify-center gap-3 mt-4 mb-6">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={loading}
              className={`w-14 h-14 text-center text-2xl font-bold border-2 rounded-xl outline-none transition-all
                ${error
                  ? 'border-red-400 bg-red-50 text-red-500 animate-pulse'
                  : digit
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-900 focus:border-blue-400'
                }
                disabled:opacity-50`}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-500 mb-4">Onjuiste code, probeer opnieuw</p>
        )}

        {loading && (
          <p className="text-sm text-blue-500">Inloggen...</p>
        )}
      </div>
    </div>
  )
}
