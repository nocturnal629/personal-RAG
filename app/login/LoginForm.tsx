'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push(searchParams.get('from') ?? '/chat')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 p-8 border border-border rounded-xl bg-card shadow-sm"
    >
      <h1 className="text-xl font-semibold text-center">Personal RAG</h1>
      <p className="text-sm text-muted-foreground text-center">
        Enter your site password to continue
      </p>
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
        autoFocus
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Sign in
      </button>
    </form>
  )
}
