/* The browser-launch helper's one piece of real arithmetic.
   ------------------------------------------------------------------
   Chromium is told to trust the sandbox proxy by PUBLIC KEY HASH rather than
   by turning certificate checking off, so this hash is the whole reason the
   end-to-end signup test can still tell a good certificate from a bad one.

   Get the encoding wrong and nothing shouts: the flag is simply ignored, every
   page fails with ERR_CERT_AUTHORITY_INVALID, and the obvious "fix" is to
   reach for --ignore-certificate-errors and throw the protection away. So the
   exact format is pinned here against a certificate whose hash was computed
   independently, by openssl:

     openssl x509 -in fixture.pem -pubkey -noout \
       | openssl pkey -pubin -outform der \
       | openssl dgst -sha256 -binary | openssl enc -base64
*/
import { describe, it, expect } from "vitest";
import { spkiHash } from "../ops/browser.mjs";

const FIXTURE = `-----BEGIN CERTIFICATE-----
MIIBhjCCASugAwIBAgIUYW9ikvXTqOAe9fLB7cnHC+6AXQIwCgYIKoZIzj0EAwIw
FzEVMBMGA1UEAwwMc3BraS1maXh0dXJlMCAXDTI2MDkyOTA0NTYwN1oYDzIxMjYw
OTA1MDQ1NjA3WjAXMRUwEwYDVQQDDAxzcGtpLWZpeHR1cmUwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAAT7kAeQG9xmVeTBKeoI1b9RBc9Q1vKfxrwFp+c4f7NDJpVd
6rcAg4xDVWSRCXpQKv+9k/0UkARPNZ58/rN4fCpPo1MwUTAdBgNVHQ4EFgQUuhYF
zCXRMomD9Y8FdfywYAtd0okwHwYDVR0jBBgwFoAUuhYFzCXRMomD9Y8FdfywYAtd
0okwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNJADBGAiEAtGlhPnnyP5gZ
Y5lJhuU9czbRW95gfpD7dcVDiOHIwGQCIQCQLyPfmGW0nkHOeWGQosQEUUL5l2V3
XuA4WjcwV7S6aQ==
-----END CERTIFICATE-----`;

describe("spkiHash", () => {
  it("matches the hash openssl computes for the same certificate", () => {
    expect(spkiHash(FIXTURE)).toBe("FEI5dvpSOAbnHOaKJFrv3OnLGRqYTbd3HTayA1C2z7w=");
  });

  it("produces base64 sha256, the length Chromium's flag expects", () => {
    const h = spkiHash(FIXTURE);
    expect(h).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it("refuses to invent a hash for something that is not a certificate", () => {
    expect(() => spkiHash("not a certificate")).toThrow();
  });
});
