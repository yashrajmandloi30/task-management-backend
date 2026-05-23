const Task = require("../model/taskModel");
const User = require("../model/userModel");
const apiResponse = require("../config/apiResponse");
const { emitToUser, emitToGroup } = require("../config/socket");
const { getRedis } = require("../config/redis");
const { sendMail } = require("../config/email");

// ✅ CREATE TASK
const createTask = async (req, res) => {
  try {
    const { title, description, status, priority, type, groupId, deadline, assignedTo, file } = req.body;

    if (!title) {
      return res.status(400).json(apiResponse(false, "Task title is required"));
    }

    // Normalize assignedTo
    let assignedToArray = [];
    if (assignedTo) {
      if (Array.isArray(assignedTo)) {
        assignedToArray = assignedTo.filter(id => id && typeof id === 'string');
      } else if (typeof assignedTo === 'string') {
        assignedToArray = assignedTo.split(',').map(id => id.trim()).filter(id => id);
      }
    }

    // Handle groupId
    let finalGroupId = null;
    if (type === 'group') {
      if (!groupId) return res.status(400).json(apiResponse(false, "Group ID required for group tasks"));
      finalGroupId = groupId;
    }

    // Deadline
    let deadlineDate = null;
    if (deadline) {
      deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        return res.status(400).json(apiResponse(false, "Invalid deadline format"));
      }
    }

    const task = new Task({
      title,
      description: description || '',
      status: status || 'pending',
      priority: priority || 'medium',
      type: type || 'personal',
      groupId: finalGroupId,
      deadline: deadlineDate,
      assignedTo: assignedToArray,
      createdBy: req.user._id,
      file: file || null,
      order: 0,
    });

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email');

    // Clear cache
    const redis = getRedis();
    if (redis) await redis.del("tasks:all");

    // ✅ Email (non-blocking) – send to each assigned user
    if (assignedToArray.length > 0) {
      try {
        const creator = await User.findById(req.user._id);
        const users = await User.find({ _id: { $in: assignedToArray } });
        
        for (const user of users) {
          await sendMail("New Task Assigned", "taskAssigned", {
            to: user.email,
            name: user.name,
            title: task.title,
            description: task.description,
            priority: task.priority,
            deadline: task.deadline ? task.deadline.toDateString() : "Not set",
            assignedBy: creator.name || "Admin",
          }).catch(err => console.error(`Email to ${user.email} failed:`, err.message));
        }
      } catch (emailError) {
        console.error("Email sending failed but task created:", emailError.message);
        // Do NOT block task creation
      }
    }

    // Socket events
    if (type === 'group' && finalGroupId) {
      emitToGroup(finalGroupId, "new-task", populatedTask);
    } else {
      assignedToArray.forEach(userId => emitToUser(userId, "new-task", populatedTask));
      emitToUser(req.user._id, "new-task", populatedTask);
    }

    res.status(201).json(apiResponse(true, "Task created", populatedTask));
  } catch (error) {
    console.error("CREATE TASK ERROR:", error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ✅ GET ALL TASKS
const getTasks = async (req, res) => {
  try {
    const redis = getRedis();
    const cacheKey = "tasks:all";

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(apiResponse(true, "From cache", JSON.parse(cached)));
    }

    const tasks = await Task.find()
      .populate("assignedTo", "name email")
      .sort({ createdAt: -1 });

    await redis.set(cacheKey, JSON.stringify(tasks), { EX: 60 });

    res.json(apiResponse(true, "DB data", tasks));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ✅ GET TASK BY ID
const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate("assignedTo");

    if (!task) {
      return res.status(404).json(apiResponse(false, "Task not found"));
    }

    res.json(apiResponse(true, "Task fetched", task));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ✅ UPDATE TASK
const updateTask = async (req, res) => {
  try {
    // ✅ Convert empty string groupId to null (fixes CastError)
    if (req.body.groupId === "" || req.body.groupId === "null") {
      req.body.groupId = null;
    }

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate("assignedTo", "name email");

    const redis = getRedis();
    await redis.del("tasks:all");

    res.json(apiResponse(true, "Task updated", updatedTask));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ✅ DELETE TASK
const deleteTask = async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);

    const redis = getRedis();
    await redis.del("tasks:all");

    res.json(apiResponse(true, "Task deleted"));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ✅ UPDATE TASK STATUS (with null check fix)
// taskController.js - updateTaskStatus
const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const taskId = req.params.id;

    const task = await Task.findById(taskId).populate('assignedTo', 'name email');
    if (!task) return res.status(404).json(apiResponse(false, 'Task not found'));
    
    if (task.status === 'completed') {
  return res.status(403).json(apiResponse(false, 'Completed tasks cannot be changed'));
}

    const user = req.user; // from authMiddleware
    const isAdmin = user.role === 'admin';
    const isAssigned = task.assignedTo.some(u => u._id.toString() === user._id.toString());

    // 1. Deadline check (if passed, block all status changes)
    const now = new Date();
    const deadline = task.deadline ? new Date(task.deadline) : null;
    if (deadline && deadline < now && task.status !== 'completed') {
      return res.status(403).json(apiResponse(false, 'Task deadline has passed. Cannot change status.'));
    }

    // 2. Status transition rules
    const oldStatus = task.status;
    const newStatus = status;

    // Define allowed transitions
    const allowedTransitions = {
      pending: ['in-progress'],
      'in-progress': ['pending', 'review'],
      review: ['in-progress'],   // only admin can move review -> completed later
      completed: []               // once completed, cannot change (or only admin can revert? We'll keep it strict)
    };

    // Special case: moving to 'completed' only by admin
    if (newStatus === 'completed') {
      if (!isAdmin) {
        return res.status(403).json(apiResponse(false, 'Only admin can mark task as completed'));
      }
      // Admin can complete from any status except maybe already completed
      if (oldStatus === 'completed') {
        return res.status(400).json(apiResponse(false, 'Task is already completed'));
      }
    } 
    // For non-completed status changes, check allowed transitions
    else {
      // Normal user can only move within allowedTransitions[oldStatus]
      if (!isAdmin && !allowedTransitions[oldStatus]?.includes(newStatus)) {
        return res.status(403).json(apiResponse(false, `Cannot move from ${oldStatus} to ${newStatus}`));
      }
      // Admin can move any non-completed status freely (except maybe to completed handled above)
      // No extra restriction for admin
    }

    task.status = newStatus;
    await task.save();

    // Invalidate cache & emit socket events...
    const redis = getRedis();
    await redis.del("tasks:all");

    if (task.type === 'group' && task.groupId) {
      emitToGroup(task.groupId, 'task-status-updated', task);
    } else {
      task.assignedTo.forEach(u => emitToUser(u._id, 'task-status-updated', task));
      emitToUser(task.createdBy, 'task-status-updated', task);
    }

    res.json(apiResponse(true, 'Task status updated', task));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ✅ REORDER TASKS
const reorderTasks = async (req, res) => {
  try {
    const { tasks } = req.body; // Array of task ids in order
    
    // Update order for each task
    for (let i = 0; i < tasks.length; i++) {
      await Task.findByIdAndUpdate(tasks[i], { order: i });
    }
    
    const redis = getRedis();
    await redis.del("tasks:all");
    
    res.json(apiResponse(true, 'Tasks reordered'));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ✅ EXPORT ALL FUNCTIONS
module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  updateTaskStatus,
  reorderTasks,
};