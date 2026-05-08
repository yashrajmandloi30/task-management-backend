const express = require("express");
const router = express.Router();
const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  updateTaskStatus,
  reorderTasks,
} = require("../controller/taskController");
const { isAdmin, authMiddleware } = require("../middleware/authMiddleware");

router.post("/", isAdmin, createTask);
router.get("/", authMiddleware, getTasks);
router.post("/reorder", authMiddleware, reorderTasks);
router.get("/:id", authMiddleware, getTaskById);
router.put("/:id", authMiddleware, updateTask);
router.patch("/:id/status", authMiddleware, updateTaskStatus);
router.delete("/:id", isAdmin, deleteTask);

module.exports = router;