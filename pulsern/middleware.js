/* Retired comparison pages answer 410 Gone.
   The owner took the /compare/ pages down on purpose (2026-11-28). A 410
   tells search engines the pages were removed and should leave the index;
   a redirect to an unrelated page is read as a soft 404. To relaunch a page
   later, publish it at the same URL and narrow the matcher. */
import { RETIRED_BODY } from "./ops/retired-page.mjs";

export const config = { matcher: ["/compare", "/compare/:path*"] };

export default function middleware() {
  return new Response(RETIRED_BODY, {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "public, max-age=3600",
    },
  });
}
