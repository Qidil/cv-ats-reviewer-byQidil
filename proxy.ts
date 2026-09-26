import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, LANGUAGES, isLanguage } from "@/lib/i18n/language";

/** ADR-008: paths without a language go to the one saved in the cookie, or to English. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LANGUAGES.some((language) => pathname === `/${language}` || pathname.startsWith(`/${language}/`))) {
    return NextResponse.next();
  }
  const saved = request.cookies.get(LANGUAGE_COOKIE)?.value;
  const url = request.nextUrl.clone();
  url.pathname = `/${isLanguage(saved) ? saved : DEFAULT_LANGUAGE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // API routes, build output, and files such as /icon.svg never get a language prefix.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
