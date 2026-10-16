/* Migration 018: paid content is not readable with the public key, exam
   items are not readable from any student client, and attempts are created
   only by the server. These read the SQL itself, and replay every
   migration's create/drop policy statements in order, so a later migration
   that quietly reopens a table fails here. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase/migrations");
const FILE = "018_paid_content_rls.sql";
const sql = readFileSync(join(DIR, FILE), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

/* Final policy set after applying every migration in order. */
function finalPolicies() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const policies = new Map(); // "table|name" -> body
  const re = /(drop policy if exists|create policy)\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)([\s\S]*?);/gi;
  for (const f of files) {
    const text = readFileSync(join(DIR, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const m of text.matchAll(re)) {
      const key = `${m[3]}|${m[2]}`;
      if (/^drop/i.test(m[1])) policies.delete(key);
      else policies.set(key, m[4].replace(/\s+/g, " ").trim());
    }
  }
  return policies;
}

const onTable = (policies, table) => [...policies].filter(([k]) => k.startsWith(`${table}|`)).map(([k, body]) => ({ name: k.split("|")[1], body }));
const isReviewerGate = (body) => /exists \(select 1 from reviewers r where r\.user_id = auth\.uid\(\)\)/.test(body);

describe("migration 018 — entitlement function", () => {
  it("is SECURITY DEFINER with a pinned, empty search_path and schema-qualified names", () => {
    expect(code).toMatch(/create or replace function public\.has_active_entitlement\(\)\s+returns boolean/);
    const fn = code.slice(code.indexOf("function public.has_active_entitlement"), code.indexOf("$$;") + 3);
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/set search_path = ''/);
    expect(fn).toMatch(/from public\.subscriptions s/);
    expect(fn).toMatch(/s\.user_id = auth\.uid\(\)/);
    expect(fn).toMatch(/s\.expires_at > now\(\)/);
    // free pass included: no plan filter, same rule as computeEntitlement()
    expect(fn).not.toMatch(/plan/);
  });

  it("is not executable by anon", () => {
    expect(code).toMatch(/revoke all on function public\.has_active_entitlement\(\) from public, anon;/);
    expect(code).toMatch(/grant execute on function public\.has_active_entitlement\(\) to authenticated/);
  });

  it("says it must be applied by hand", () => {
    expect(sql).toMatch(/Apply by hand/);
    expect(sql).toMatch(/SQL editor/);
  });
});

describe("after every migration, content read policies", () => {
  const policies = finalPolicies();

  for (const table of ["questions", "flashcards", "case_studies"]) {
    it(`${table}: no select policy is open to anon or to every signed-in user`, () => {
      const selects = onTable(policies, table).filter((p) => /for select/.test(p.body));
      expect(selects.length).toBeGreaterThan(0);
      for (const p of selects) {
        if (isReviewerGate(p.body)) continue; // the review console (reviewers table only)
        expect(p.body, p.name).toMatch(/to authenticated/);
        expect(p.body, p.name).toMatch(/public\.has_active_entitlement\(\)/);
        expect(p.body, p.name).toMatch(/approved = true/);
        expect(p.body, p.name).toMatch(/rejected_at is null/);
      }
    });
  }

  it("the old open policies are gone", () => {
    expect(policies.has("questions|questions_read_approved")).toBe(false);
    expect(policies.has("flashcards|flashcards_read_approved")).toBe(false);
    expect(policies.has("case_studies|cases_read_approved")).toBe(false);
  });

  for (const table of ["questions", "case_studies"]) {
    it(`${table}: exam-form rows match no student policy`, () => {
      for (const p of onTable(policies, table).filter((x) => /for select/.test(x.body))) {
        if (isReviewerGate(p.body)) continue;
        expect(p.body, p.name).toMatch(/exam_form is null/);
      }
    });
  }

  it("reviewers keep the console's read and update access", () => {
    for (const k of ["questions|questions_reviewer_read", "questions|questions_reviewer_update",
      "flashcards|flashcards_reviewer_read", "case_studies|cases_reviewer_read"]) {
      expect(policies.has(k), k).toBe(true);
      expect(isReviewerGate(policies.get(k))).toBe(true);
    }
  });

  it("exam_attempts: students read their own, nobody inserts, updates or deletes from a client", () => {
    const att = onTable(policies, "exam_attempts");
    expect(att.map((p) => p.name)).toEqual(["read own attempts"]);
    expect(att[0].body).toMatch(/for select using \(auth\.uid\(\) = user_id\)/);
  });
});

describe("migration 018 — exam_attempts columns for server grading", () => {
  for (const col of ["id uuid not null default gen_random_uuid()", "items jsonb", "submitted_at timestamptz", "correct int", "total int", "result jsonb"]) {
    it(`adds ${col.split(" ")[0]}`, () => {
      expect(code).toContain(`add column if not exists ${col}`);
    });
  }
  it("makes the attempt id unique", () => {
    expect(code).toMatch(/create unique index if not exists exam_attempts_id_key on public\.exam_attempts \(id\)/);
  });
});
