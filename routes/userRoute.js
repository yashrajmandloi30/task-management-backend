const express = require('express');

const { authMiddleware } = require('../middleware/authMiddleware');
const { registerUser, getAllUsers, loginUser } = require('../controller/userController');
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/users", authMiddleware, getAllUsers);

module.exports = router;