const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { getAllTables, deleteTable } = require('../controllers/adminController');

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/tables', getAllTables);
router.delete('/tables/:tableId', deleteTable);

module.exports = router;
