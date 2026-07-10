import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Simple single-user password gate. Set SITE_PASSWORD in .env.local.
// If the env var is not set, the app is open (useful for local dev).
//
// Auth flow: visit /login → enter password → cookie is set → access granted.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const password = process.env.SITE_PASSWORD

  // No password configured → completely open
  if (!password) return NextResponse.next()

  // Always allow: Next.js internals, static assets, and public routes
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/login'
  ) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get('site-auth')?.value

  if (cookie === password) {
    return NextResponse.next()
  }

  // API calls get a 401 instead of a redirect
  if (pathname.startsWith('/api/')) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
