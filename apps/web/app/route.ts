/**
 * The bare origin.
 *
 * Sycamore has no homepage by design — Constitution §1 is "one door", and
 * that door is chat. Buyers arrive on a seller's trust page from a link;
 * sellers arrive on their own day from a link we sent them. Nobody is
 * ever meant to type the domain in and browse.
 *
 * But a deployed origin must answer SOMETHING, and the one thing that
 * belongs at the root is the installed client's launch point: tapping
 * the home-screen icon lands on `/s/`, which sends a seller to whichever
 * business the client was installed for.
 */
export function GET(req: Request): Response {
  const url = new URL(req.url);
  return Response.redirect(new URL('/s/', url.origin), 307);
}
