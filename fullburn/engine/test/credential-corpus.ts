/** AN INDEPENDENTLY AUTHORED CORPUS OF REALISTIC CREDENTIALS.
 *
 * Human ruling 2026-08-22: *"an independently authored corpus of realistic
 * credentials, written WITHOUT reference to SECRET_PATTERNS. Every entry must
 * flag. Red-proof: remove any one rule, corpus goes red. Never validate rules
 * against canaries built from the rules — that is what my last instruction got
 * wrong."*
 *
 * The ruling is about a specific failure. The previous round proved `.npmrc`,
 * `.netrc` and `.pgpass` were READ by planting a canary shaped like an
 * Anthropic key — a string the rules were already written to match. That
 * proved readability and was silently taken as proof of detection. Re-run with
 * the credentials those files actually hold, the scan reported clean.
 *
 * So this file is written from what the credential FORMATS look like in the
 * wild — npm's `_authToken`, PostgreSQL's `.pgpass` field order, Docker's
 * base64 `auth`, Apache's `htpasswd` hashes — and NOT from the regexes. It is
 * the acceptance bar for the ruleset, so the ruleset may not be its author.
 *
 * EVERY VALUE IS ASSEMBLED AT RUNTIME. The leak scan reads this file like any
 * other; a literal here would be a finding about the corpus rather than a test
 * of the rules. Assembly is a mechanical necessity, not a weakening — the
 * assembled string is byte-for-byte the shape of the real thing.
 *
 * The NEGATIVE half is not optional. A corpus where every entry flags is
 * satisfied by a rule that matches everything, so the placeholders that appear
 * in real `.env.example` files must stay clean. */

const rep = (s: string, n: number) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

export interface CorpusEntry {
  /** What a human would call it. */
  readonly what: string;
  /** The filename this credential lives in, since some rules are path-aware. */
  readonly path: string;
  /** File content exactly as the tool that owns the format writes it. */
  readonly text: string;
}

/** Credentials that MUST be detected. */
export const CREDENTIALS: readonly CorpusEntry[] = [
  {
    what: "npm automation token in a project .npmrc",
    path: ".npmrc",
    text: `//registry.npmjs.org/:_authToken=npm_${rep("A1b2C3d4E5f6G7h8", 36)}\n`,
  },
  {
    what: "npm token pointing at a private registry",
    path: "haven/.npmrc",
    text: `@acme:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=npm_${rep("Zx9Yw8Vu7Ts6", 36)}\n`,
  },
  {
    what: "plaintext password in a .netrc",
    path: ".netrc",
    text: "machine api.production.internal\n  login deploy-bot\n  password " + rep("Tr0ub4dor", 22) + "\n",
  },
  {
    what: "one-line .netrc, the form curl writes",
    path: "home/.netrc",
    text: `machine github.com login ssb22inc password ${rep("gH7x", 24)}\n`,
  },
  {
    what: "PostgreSQL .pgpass — password is the fifth colon-separated field",
    path: ".pgpass",
    text: `db.prod.internal:5432:haven:app_user:${rep("S3cretDbPass", 26)}\n`,
  },
  {
    what: "PGPASSWORD exported for a psql invocation",
    path: "scripts/restore.sh",
    text: `#!/bin/sh\nexport PGPASSWORD=${rep("R3st0reP", 24)}\npsql -h db.prod -U app haven < dump.sql\n`,
  },
  {
    what: "MYSQL_PWD in a compose env file",
    path: "deploy/.env.mysql",
    text: `MYSQL_USER=app\nMYSQL_PWD=${rep("mY5qlP4ss", 20)}\n`,
  },
  {
    // A PLAIN PASSWORD, not a `ghp_` token. The first draft of this entry used
    // a GitHub token, so the `github token` rule caught it and removing the
    // git-credentials rule changed nothing — the red-proof surfaced that the
    // entry was carried by a different rule than the one it was written for.
    // git's credential store holds whatever the host wanted, and for anything
    // that is not GitHub that is usually just a password.
    what: "git credential store — password embedded in the URL",
    path: ".git-credentials",
    text: `https://deploy-bot:${rep("W1nterIsHere", 20)}@git.internal.example\n`,
  },
  {
    // SPLIT IN TWO. Written as one file holding both halves, each AWS rule was
    // covered by the other and neither was individually load-bearing.
    what: "AWS access key id on its own",
    path: "deploy/serverless.yml",
    text: `provider:\n  environment:\n    AWS_ACCESS_KEY_ID: AKIA${rep("ABCDEFGH", 16)}\n`,
  },
  {
    what: "AWS secret access key on its own",
    path: ".aws/credentials",
    text: "[default]\naws_secret_access_key = " + rep("wJalrXUtnFEMI/K7MDENG+bPxRfiCY", 40) + "\n",
  },
  {
    what: "OpenAI project key",
    path: "server/ai.ts",
    text: `const openai = new OpenAI({ apiKey: "sk-${rep("T3BlbkFJx7Vn9pQ2sT4uW6yZaB", 48)}" });\n`,
  },
  {
    what: "Stripe webhook signing secret",
    path: "server/webhook.ts",
    text: `const endpointSecret = "whsec_${rep("1Ab2Cd3Ef4Gh5Ij6", 32)}";\n`,
  },
  {
    what: "Meta/Facebook long-lived access token",
    path: "ads/meta-client.ts",
    text: `const token = "EAA${rep("BwzLixnqZAZC8BA1x7Vn9pQ2sT4uW6yZ", 60)}";\n`,
  },
  {
    what: "Google OAuth access token",
    path: "ads/google-client.ts",
    text: `const accessToken = "ya29.${rep("a0AfH6SMBx7Vn9pQ2sT4uW6yZ-_", 60)}";\n`,
  },
  {
    what: "Authorization header with a bearer token, as curl writes it",
    path: "scripts/probe.sh",
    text: `curl -H "Authorization: Bearer ${rep("eyJhbGciOiJIUzI1NiJ9.x7Vn9pQ2", 40)}" https://api.internal/v1/health\n`,
  },
  {
    what: "Docker registry auth — base64 of user:password",
    path: ".docker/config.json",
    text: `{"auths":{"registry.internal:5000":{"auth":"${b64("deploy:" + rep("d0ckerP4ss", 18))}"}}}\n`,
  },
  {
    what: "Apache htpasswd, bcrypt",
    path: "nginx/.htpasswd",
    text: `metrics:$2y$05$${rep("KIXQPWlnHRUxPUuKqDCbue", 53)}\n`,
  },
  {
    what: "Apache htpasswd, MD5 (apr1) — still the default htpasswd emits",
    path: "haven/.htpasswd",
    text: `admin:$apr1$${rep("Ux7Qk1zR", 8)}$${rep("aBcDeFgHiJkLmNoPqRsTu", 22)}\n`,
  },
  // ── formats the ruleset already claimed, included so the corpus measures the
  // WHOLE ruleset rather than only this round's additions ──
  {
    what: "Anthropic API key",
    path: "src/client.ts",
    text: `const client = new Anthropic({ apiKey: "sk-ant-${rep("api03-Xy9Zw8", 40)}" });\n`,
  },
  {
    what: "Stripe live secret key",
    path: "server/pay.ts",
    text: `const stripe = require("stripe")("sk-live-${rep("51Hb9xQ2", 30)}");\n`,
  },
  {
    what: "GitHub personal access token",
    path: "ci/deploy.sh",
    text: `GH_TOKEN=ghp_${rep("16CharsOfToken", 36)}\n`,
  },
  {
    what: "Slack bot token",
    path: "alerts/config.yml",
    text: `slack_token: xoxb-${rep("2417", 12)}-${rep("5901", 12)}-${rep("aBcDeF", 24)}\n`,
  },
  {
    what: "Google API key",
    path: "web/maps.js",
    text: `const key = "AIza${rep("SyD3f4Gh1JkLmN0pQrStUvWxYz012345", 35)}";\n`,
  },
  {
    what: "RSA private key",
    path: "deploy/id_rsa",
    text:
      "-----BEGIN RSA PRIVATE KEY-----\n" +
      [0, 1, 2, 3].map(() => rep("MIIEowIBAAKCAQEAx7Vn9pQ2sT4uW6yZ", 64)).join("\n") +
      "\n-----END RSA PRIVATE KEY-----\n",
  },
];

/** Values that MUST NOT be detected. Without these, a rule matching everything
 * would satisfy the corpus. Every one of these appears in a real repository. */
export const PLACEHOLDERS: readonly CorpusEntry[] = [
  {
    what: "the placeholders shipped in haven/.env.local.example",
    path: "haven/.env.local.example",
    text:
      "OPENAI_API_KEY=your_openai_api_key\nSTRIPE_SECRET_KEY=your_stripe_secret_key\n" +
      "JWT_SECRET=your_jwt_secret_min_32_chars\nMETRICS_TOKEN=changeme-dev-token\n" +
      "STRIPE_BASIC_PRICE_ID=price_xxx\n",
  },
  {
    what: "env vars read rather than assigned",
    path: "server/config.ts",
    text:
      "const key = process.env.OPENAI_API_KEY;\nconst pw = process.env.PGPASSWORD ?? '';\n" +
      "export const auth = { token: process.env.NPM_TOKEN };\n",
  },
  {
    what: "an env-validation map whose values are DESCRIPTIONS",
    path: "haven/next.config.ts",
    text:
      "const required = {\n  STRIPE_SECRET_KEY: 'Stripe secret key — server-side only.',\n" +
      "  JWT_SECRET: 'JWT signing secret (min 32 chars). Generate: openssl rand -hex 32',\n};\n",
  },
  {
    what: "shell interpolation, not a literal",
    path: "ci/run.sh",
    text: 'export PGPASSWORD="${DB_PASSWORD}"\nMYSQL_PWD=$MYSQL_ROOT_PASSWORD\n',
  },
  {
    // RA-22 SURVIVED without this. Loosening the pgpass rule's guard to
    // `\\S{3,}` left the whole suite green, because no placeholder in the corpus
    // was pgpass-SHAPED — so the guard that keeps example files quiet had
    // nothing measuring it. Every rule with a placeholder guard needs a
    // placeholder that would trip if the guard were removed.
    what: "the .pgpass and .netrc examples a runbook ships",
    path: "docs/examples/.pgpass.example",
    text:
      "# host:port:database:user:password\n" +
      "db.example.com:5432:mydb:myuser:<password>\n" +
      "localhost:5432:dev:dev:your_password_here\n",
  },
  {
    what: "an .npmrc example with the token left unset",
    path: "docs/examples/.npmrc.example",
    text: "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n",
  },
  {
    what: "an aws credentials template",
    path: "docs/examples/aws-credentials.example",
    text: "[default]\naws_access_key_id = <your-key-id>\naws_secret_access_key = <your-secret-key>\n",
  },
  {
    what: "documentation describing the formats",
    path: "docs/secrets.md",
    text:
      "Never commit an `.npmrc` containing `_authToken`, a `.netrc` `password` line,\n" +
      "or a `.pgpass` entry. Rotate immediately if you do.\n",
  },
];
