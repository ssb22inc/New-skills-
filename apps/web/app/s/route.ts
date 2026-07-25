/**
 * P36a — the installed client's launch point (`start_url`). Tapping the
 * home-screen icon lands here; the client remembers whose day it is and
 * goes straight there. If it does not know yet (a fresh browser, or the
 * icon tapped before the first visit), it says so in one plain sentence
 * instead of showing an empty app — the seller's chat still has their
 * link, and chat is always the door that works (Constitution §1).
 */
export function GET(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0B1A26">
<title>Sycamore</title>
<link rel="manifest" href="/manifest.webmanifest">
<style>
body{margin:0;background:#0B1A26;color:#F7F3EC;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:24px}
p{font-size:16px;line-height:1.5}
</style>
</head>
<body><main>
<p id="msg">Opening your day…</p>
</main>
<script>
(function(){
  var home=null;
  try{ home=localStorage.getItem('sycamore-home'); }catch(_){}
  if(home){ location.replace(home); return; }
  document.getElementById('msg').textContent=
    'Open the link we sent you in chat once, and this icon will bring you straight back here.';
})();
</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
