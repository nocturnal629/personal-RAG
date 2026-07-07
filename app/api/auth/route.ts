import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const sitePassword = process.env.SITE_PASSWORD

  if (!sitePassword || password !== sitePassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set('site-auth', sitePassword, {
    httpOnly: true,
    sameSite: 'lax',
    // Don't set secure in dev so it works over http://localhost
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  return NextResponse.json({ ok: true })
}
