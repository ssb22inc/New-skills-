/* Phone normalization for SMS. US-first (the NCLEX audience): accepts the
   usual human formats and returns E.164, or null when the input can't be a
   valid US number. Numbers already in +<country> form pass through with
   basic length sanity so international students aren't locked out. */
export function normalizePhone(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/[^\d]/g, "");
    if (digits.length < 8 || digits.length > 15) return null; // E.164 bounds
    return "+" + digits;
  }
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length === 10 && digits[0] !== "0" && digits[0] !== "1") return "+1" + digits;
  if (digits.length === 11 && digits[0] === "1" && digits[1] !== "0" && digits[1] !== "1") return "+" + digits;
  return null;
}
