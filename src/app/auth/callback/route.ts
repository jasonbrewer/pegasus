import { NextResponse } from "next/server";

/**
 * Legacy landing point for emailed auth links.
 *
 * It used to call exchangeCodeForSession() right here, on the GET. That is the
 * bug this file no longer has: the token is single-use, and a GET is exactly
 * what Gmail's scanners, corporate mail gateways, link unfurlers and browser
 * prefetch all issue before a human ever clicks. Whichever of them got there
 * first burned the token, and the person clicking their own reset link was
 * told it had expired.
 *
 * Nothing is consumed here now. Everything is forwarded, query intact, to
 * /auth/confirm — which shows a button and only exchanges the token when that
 * button is POSTed. Kept as a route because links already sitting in inboxes
 * point at this path.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const forwarded = new URLSearchParams(searchParams);
  return NextResponse.redirect(`${origin}/auth/confirm?${forwarded.toString()}`);
}
