import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  hashSensitiveData,
  verifyHash,
  maskSensitiveData,
  maskEmail,
  maskPhone,
  generateSecureToken,
} from '@/lib/security/encryption';

describe('Encryption & Hashing', () => {
  describe('Symmetric Encryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const plaintext = 'sensitive data';
      const secretKey = 'test-secret-key';

      const encrypted = await encrypt(plaintext, secretKey);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toBeTruthy();

      const decrypted = await decrypt(encrypted, secretKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      const plaintext = 'same data';
      const secretKey = 'test-secret-key';

      const encrypted1 = await encrypt(plaintext, secretKey);
      const encrypted2 = await encrypt(plaintext, secretKey);

      expect(encrypted1).not.toBe(encrypted2);
      expect(await decrypt(encrypted1, secretKey)).toBe(plaintext);
      expect(await decrypt(encrypted2, secretKey)).toBe(plaintext);
    });

    it('should fail to decrypt with wrong key', async () => {
      const plaintext = 'sensitive data';
      const encrypted = await encrypt(plaintext, 'correct-key');

      await expect(decrypt(encrypted, 'wrong-key')).rejects.toThrow();
    });

    it('should handle empty strings', async () => {
      const encrypted = await encrypt('', 'test-key');
      const decrypted = await decrypt(encrypted, 'test-key');
      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', async () => {
      const plaintext = '你好世界 🌍 émojis';
      const secretKey = 'test-key';

      const encrypted = await encrypt(plaintext, secretKey);
      const decrypted = await decrypt(encrypted, secretKey);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Password Hashing', () => {
    it('should hash data using Argon2', async () => {
      const data = 'password123';
      const hash = await hashSensitiveData(data);

      expect(hash).not.toBe(data);
      expect(hash).toBeTruthy();
      expect(hash.startsWith('$argon2')).toBe(true);
    });

    it('should verify correct hash', async () => {
      const data = 'password123';
      const hash = await hashSensitiveData(data);

      const valid = await verifyHash(data, hash);
      expect(valid).toBe(true);
    });

    it('should reject incorrect hash', async () => {
      const data = 'password123';
      const hash = await hashSensitiveData(data);

      const valid = await verifyHash('wrong-password', hash);
      expect(valid).toBe(false);
    });

    it('should produce different hashes for same input', async () => {
      const data = 'password123';
      const hash1 = await hashSensitiveData(data);
      const hash2 = await hashSensitiveData(data);

      expect(hash1).not.toBe(hash2);
      expect(await verifyHash(data, hash1)).toBe(true);
      expect(await verifyHash(data, hash2)).toBe(true);
    });
  });

  describe('Data Masking', () => {
    it('should mask sensitive data with visible chars', () => {
      const data = 'secret1234';
      const masked = maskSensitiveData(data, 2);
      expect(masked).toBe('se******34');
    });

    it('should completely mask short data', () => {
      const data = 'abc';
      const masked = maskSensitiveData(data, 4);
      expect(masked).toBe('***');
    });

    it('should mask email addresses', () => {
      const email = 'john.doe@example.com';
      const masked = maskEmail(email);
      expect(masked).toMatch(/j\*+e@example\.com/);
      expect(masked).not.toContain('john.doe');
    });

    it('should handle short email local parts', () => {
      const email = 'ab@example.com';
      const masked = maskEmail(email);
      expect(masked).toContain('@example.com');
      expect(masked.split('@')[0].length).toBe(2);
    });

    it('should mask phone numbers', () => {
      const phone = '1234567890';
      const masked = maskPhone(phone);
      expect(masked).toBe('******7890');
    });

    it('should handle formatted phone numbers', () => {
      const phone = '(123) 456-7890';
      const masked = maskPhone(phone);
      expect(masked).toContain('7890');
      expect(masked).toContain('*');
    });

    it('should completely mask short phone numbers', () => {
      const phone = '123';
      const masked = maskPhone(phone);
      expect(masked).toBe('***');
    });
  });

  describe('Secure Token Generation', () => {
    it('should generate tokens of correct length', () => {
      const token = generateSecureToken(32);
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate different tokens each time', () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      expect(token1).not.toBe(token2);
    });

    it('should only contain hex characters', () => {
      const token = generateSecureToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
    });
  });
});
