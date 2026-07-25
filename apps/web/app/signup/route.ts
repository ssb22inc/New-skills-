import { academyService, createDb, databaseUrl } from '@sycamore/core';

export const dynamic = 'force-dynamic';

const db = createDb(process.env.DATABASE_URL ?? databaseUrl());
const MARKET = process.env.SYCAMORE_MARKET ?? 'jm';

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function page(body: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign up — Sycamore Academy</title>
<style>
body{margin:0;background:#F7F3EC;color:#0B1A26;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:24px}
h1{font-size:24px}
label{display:block;margin:14px 0 4px;font-weight:600}
input[type=text],input[type=tel],input[type=email]{width:100%;box-sizing:border-box;border:1px solid #B9C6CF;border-radius:12px;padding:12px;font-size:16px}
.consent{display:flex;gap:8px;align-items:flex-start;margin:16px 0;font-weight:400}
button{background:#F4A24C;border:none;border-radius:12px;padding:14px 20px;font-weight:700;font-size:16px;margin-top:8px}
.muted{color:#4A5A66;font-size:13px}
.error{color:#B3261E;font-weight:600}
</style>
</head>
<body><main>${body}</main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/** The sign-up form: name, phone, email — consent is a choice, not a default. */
export function GET(): Response {
  return page(`
<h1>Start learning</h1>
<form method="post">
<label for="name">Your name</label>
<input id="name" name="name" type="text" required autocomplete="name">
<label for="phone">Phone (WhatsApp number)</label>
<input id="phone" name="phone" type="tel" placeholder="+18765551234" required autocomplete="tel">
<label for="email">Email</label>
<input id="email" name="email" type="email" required autocomplete="email">
<label for="course">What are you studying?</label>
<input id="course" name="course" type="text" value="new skills" required>
<label class="consent"><input type="checkbox" name="marketingOptIn" value="yes">
Yes — send me occasional offers and product news. (Optional. Reply STOP any time.)</label>
<button type="submit">Sign up</button>
<p class="muted">We'll send one friendly study reminder a day — reply STOP to pause everything.</p>
</form>`);
}

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const outcome = await academyService(db, MARKET).trySignUp({
    name: String(form.get('name') ?? ''),
    phone: String(form.get('phone') ?? ''),
    email: String(form.get('email') ?? ''),
    course: String(form.get('course') ?? 'new skills'),
    marketingOptIn: form.get('marketingOptIn') === 'yes',
  });
  if (!outcome.ok) {
    return page(
      `<h1>Almost</h1><p class="error">${esc(outcome.problems.join('; '))}</p>` +
        `<p><a href="/signup">Back to the form</a></p>`,
    );
  }
  return page(`
<h1>You're in! 🎉</h1>
<p>We'll nudge you once a day to keep your <strong>${esc(outcome.result.enrollment.course)}</strong> streak going.</p>
<p class="muted">Reply STOP to any message to pause. Your details stay with us — never sold, never shared without a signed agreement.</p>`);
}
