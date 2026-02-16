const express = require('express');

const router = express.Router();

// CF cookie linking has been moved to admin routes.
// Normal users no longer need to link a Codeforces account.
// All submissions use the admin's CF credentials.

module.exports = router;
