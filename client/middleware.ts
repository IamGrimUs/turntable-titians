import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session?.user

  const isAuthRoute = nextUrl.pathname.startsWith('/auth')
  const isOnboarding = nextUrl.pathname === '/onboarding'
  const isProtected =
    nextUrl.pathname === '/profile' ||
    nextUrl.pathname.startsWith('/battles/create')

  if (isAuthRoute || isOnboarding) return NextResponse.next()

  if (!isLoggedIn && isProtected) {
    const signInUrl = new URL('/auth/signin', nextUrl)
    signInUrl.searchParams.set('callbackUrl', nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Intentional: any logged-in user without a username is forced through onboarding
  // before accessing any page. This is mandatory per the product spec — username
  // must be set before the app is usable.
  if (isLoggedIn && !session.user.username) {
    return NextResponse.redirect(new URL('/onboarding', nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
