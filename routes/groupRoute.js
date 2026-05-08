const express = require("express");
const { createGroup, getGroups, updateGroup, deleteGroup } = require("../controller/groupController");
const { authMiddleware } = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/", authMiddleware, createGroup);
router.get("/", authMiddleware, getGroups);
router.patch("/:id", authMiddleware, updateGroup);
router.delete("/:id", authMiddleware, deleteGroup);

module.exports = router;