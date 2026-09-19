import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // P36b — the earned-install offer. State lives on the SELLER record
  // because only sellers are ever offered an install: buyers have no
  // column here and therefore no code path (asymmetric clients).
  //
  //   none     — never offered (the default for every seller, forever,
  //              unless an earned trigger fires)
  //   offered  — an offer is outstanding
  //   declined — the seller said no; a second offer is allowed ONCE more
  //   installed— the seller installed; no further offers, ever
  //
  // `install_offers_sent` is the hard cap (max 2, ever) and is enforced
  // in code AND by the check constraint below, so no future caller can
  // nag a seller past two.
  await sql`
    alter table sellers
      add column install_prompt_state text not null default 'none',
      add column install_offers_sent integer not null default 0,
      add column installed_at timestamptz
  `.execute(db);
  await sql`
    alter table sellers
      add constraint sellers_install_prompt_state_check
        check (install_prompt_state in ('none', 'offered', 'declined', 'installed'))
  `.execute(db);
  await sql`
    alter table sellers
      add constraint sellers_install_offer_cap check (install_offers_sent between 0 and 2)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table sellers
      drop constraint sellers_install_offer_cap,
      drop constraint sellers_install_prompt_state_check
  `.execute(db);
  await sql`
    alter table sellers
      drop column install_prompt_state,
      drop column install_offers_sent,
      drop column installed_at
  `.execute(db);
}
