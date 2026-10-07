/* Turning GoTrue's replies into something a nursing student can act on.
   ------------------------------------------------------------------
   A real prospect signed up successfully and then saw, in red:

     "For security purposes, you can only request this after 48 seconds."

   Their account had been created and the email was already sent. Nothing had
   gone wrong. But the message is phrased as a refusal, coloured as an error,
   and says nothing about what just happened or what to do — so they stopped,
   mid-purchase, believing the signup had failed.

   Three rules come out of that:

     1. TONE FOLLOWS REALITY. A throttle is not a failure. Anything that means
        "this already worked, wait a moment" is a notice, not an error. Red is
        reserved for something the student must actually fix.
     2. ALWAYS SAY THE NEXT STEP. A message that only describes a state leaves
        the student to invent a plan, and the plan they invent is leaving.
     3. OFFER THE FASTER DOOR. Nearly every stuck state here — forgotten
        password, unconfirmed email, already registered — is solved instantly
        by the sign-in link. Naming it converts a dead end into one tap.

   Pure and synchronous so it can be tested without a browser or a network. */

/* GoTrue wording has changed across versions and will again, so match on the
   stable parts rather than whole sentences. */
const THROTTLE = /only request this after (\d+)\s*(second|minute)/i;
const ALREADY_REGISTERED = /already registered|already been registered|user already exists/i;
const BAD_CREDENTIALS = /invalid login credentials|invalid email or password/i;
const NOT_CONFIRMED = /email not confirmed|not confirmed/i;
const WEAK_PASSWORD = /password should be at least|password is too short/i;
const BAD_EMAIL = /unable to validate email|invalid format|email address.*invalid/i;
const RATE_LIMITED = /rate limit|too many requests/i;

/* `tone` drives colour: "notice" is the calm green line, "error" is red.
   `linkHint` tells the screen to point at the sign-in-link button, which is
   the fastest way out of most of these. */
export function explainAuthError(rawMessage, mode = "signin") {
  const msg = String(rawMessage ?? "");

  const throttled = THROTTLE.exec(msg);
  if (throttled) {
    const n = Number(throttled[1]);
    const unit = /minute/i.test(throttled[2]) ? (n === 1 ? "minute" : "minutes") : (n === 1 ? "second" : "seconds");
    return {
      tone: "notice",
      text: mode === "signup"
        ? `Your account is set up and we have emailed that address — check your inbox and spam. You can ask for another email in ${n} ${unit}.`
        : `We have already emailed that address — check your inbox and spam. You can ask for another in ${n} ${unit}.`,
      linkHint: false,
    };
  }

  if (ALREADY_REGISTERED.test(msg)) {
    return {
      tone: "notice",
      text: "That email already has an account. Sign in below, or use the sign-in link to get in without a password.",
      linkHint: true,
    };
  }

  /* The student has done nothing wrong and cannot fix this by retrying, so
     send them straight to the door that works. */
  if (NOT_CONFIRMED.test(msg)) {
    return {
      tone: "notice",
      text: "Your account exists but has not been confirmed yet. Use the sign-in link below to go straight in — no confirmation needed.",
      linkHint: true,
    };
  }

  if (BAD_CREDENTIALS.test(msg)) {
    return {
      tone: "error",
      text: "That email and password do not match. Try again, or use the sign-in link below to get in without a password.",
      linkHint: true,
    };
  }

  if (WEAK_PASSWORD.test(msg)) {
    return { tone: "error", text: "Pick a password with at least 6 characters.", linkHint: false };
  }

  if (BAD_EMAIL.test(msg)) {
    return { tone: "error", text: "That email address does not look right — check it for a typo.", linkHint: false };
  }

  if (RATE_LIMITED.test(msg)) {
    return {
      tone: "notice",
      text: "Too many attempts just now. Wait a minute and try again — nothing is wrong with your account.",
      linkHint: true,
    };
  }

  /* Unrecognised: show what the server said rather than inventing a friendly
     lie, but still name a next step. A message we do not understand is the one
     most likely to need reporting. */
  return {
    tone: "error",
    text: msg || "Something went wrong. Try again, or use the sign-in link below.",
    linkHint: true,
  };
}
