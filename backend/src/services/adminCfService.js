const User = require('../models/User');
const { decrypt } = require('../utils/encryption');

/**
 * Get the admin's decrypted Codeforces cookies and handle.
 * Finds any admin user who has linked CF cookies.
 * Returns { handle, cookies } or throws an error.
 */
async function getAdminCfCredentials() {
  const admin = await User.findOne({
    role: 'admin',
    codeforcesCookies: { $ne: null },
    codeforcesHandle: { $ne: null },
  });

  if (!admin) {
    throw new Error('NO_ADMIN_CF');
  }

  let cookies;
  try {
    cookies = decrypt(admin.codeforcesCookies);
  } catch {
    throw new Error('ADMIN_CF_DECRYPT_FAILED');
  }

  return {
    handle: admin.codeforcesHandle,
    cookies,
  };
}

module.exports = { getAdminCfCredentials };
