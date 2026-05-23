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

router.post("/",authMiddleware,isAdmin, createTask);
router.get("/", authMiddleware, getTasks);
router.post("/reorder", authMiddleware, reorderTasks);
router.get("/:id", authMiddleware, getTaskById);
router.patch("/:id", authMiddleware,isAdmin , updateTask);
router.patch("/:id/status", authMiddleware, updateTaskStatus);
router.delete("/:id" , authMiddleware, isAdmin, deleteTask);

module.exports = router;