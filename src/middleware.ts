import { NextRequest, NextResponse } from "next/server";

// This app has no built-in authentication (see README "Security model") and
// was designed to run on localhost only. Deploying it publicly requires a
// gate in front of every route, so unset credentials means every request is
// blocked rather than silently left open.
export function middleware(request: NextRequest) {
  // Deliberately unauthenticated: this route serves one HMAC-signed,
  // short-lived asset URL at a time (see signed-url.ts) so external
  // services (e.g. Higgsfield) can fetch a specific image over HTTP
  // without Basic Auth credentials. The signature + expiry check inside
  // the route itself is what gates access, not this bypass.
  if (request.nextUrl.pathname.startsWith("/api/public/asset/")) {
    return NextResponse.next();
  }

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !pass) {
    return new NextResponse("Access locked: BASIC_AUTH_USER / BASIC_AUTH_PASSWORD not configured.", {
      status: 503,
    });
  }

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separatorIndex);
    const suppliedPass = decoded.slice(separatorIndex + 1);
    if (suppliedUser === user && suppliedPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="VerticalFlash"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
