const crypto = require('crypto');
const { ENCRYPTION_KEY } = require('../config/env');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// ENCRYPTION_KEY is a 64-char hex string → 32 bytes
const KEY = Buffer.from(ENCRYPTION_KEY, 'hex');

/**
 * Encrypt plaintext string using AES-256-CBC.
 * Returns "iv:encrypted" in hex format.
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt "iv:encrypted" hex string back to plaintext.
 */
function decrypt(encryptedText) {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
