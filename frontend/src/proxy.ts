import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends visitors without a session straight to /login. This is only a UX shortcut:
 * the API checks every request itself.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("forkan_session")) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/users/:path*",
    "/students/:path*",
    "/teachers/:path*",
    "/imports/:path*",
    "/classes/:path*",
    "/attendance/:path*",
    "/hifz/:path*",
    "/mushaf/:path*",
    "/fees/:path*",
    "/payments/:path*",
    "/memberships/:path*",
    "/news-admin/:path*",
    "/settings/:path*",
    "/change-password",
  ],
};
