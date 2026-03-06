import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const USER_AUTH_PUBLIC_PATHS = new Set([
  '/user/login',
  '/user/register',
  '/user/forgot-password',
  '/login', // 管理员登录页
]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 检查是否访问admin路径
  if (pathname.startsWith('/admin')) {
    // 检查session cookie
    const session = request.cookies.get('admin_session');
    
    if (!session || session.value !== 'authenticated') {
      // 未登录，重定向到登录页
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // 前台公开页面（不需要登录）
  if (USER_AUTH_PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // 前台页面：必须有用户会话 cookie
  const userSession = request.cookies.get('user_session');
  if (!userSession?.value) {
    const loginUrl = new URL('/user/login', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};
