const Task = require("../model/taskModel");
const User = require("../model/userModel");
const apiResponse = require("../config/apiResponse");
const { emitToUser, emitToGroup } = require("../config/socket");
const { getRedis } = require("../config/redis");
const { sendMail } = require("../config/email");

// ✅ CREATE TASK
const createTask = async (req, res) => {
  try {
    const { type, groupId, assignedTo } = req.body;

    const task = new Task({
      ...req.body,
      createdBy: req.user._id,
    });

    await task.save();

    const redis = getRedis();
    await redis.del("tasks:all");

    const creator = await User.findById(req.user._id);

    // Email send
    if (assignedTo && assignedTo.length) {
      const users = await User.find({ _id: { $in: assignedTo } });

      for (const user of users) {
        await sendMail("New Task Assigned", "taskAssigned", {
          to: user.email,
          name: user.name,
          title: task.title,
          description: task.description,
          priority: task.priority,
          deadline: task.deadline,
          assignedBy: creator.name,
        });
      }
    }

    if (type === "group" && groupId) {
      emitToGroup(groupId, "new-task", task);
    } else {
      assignedTo?.forEach((userId) => {
        emitToUser(userId, "new-task", task);
      });
    }

    res.status(201).json(apiResponse(true, "Task created", task));
  } catch (error) {
    console.error(error);
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
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

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
const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const taskId = req.params.id;

    const task = await Task.findById(taskId);
    
    if (!task) {
      return res.status(404).json(apiResponse(false, 'Task not found'));
    }

    // Check authorization
    if (task.type === 'group' && task.groupId) {
      const Group = require("../model/groupModel");
      const group = await Group.findById(task.groupId);
      
      // ✅ NULL CHECK - FIX FOR THE ERROR
      if (!group) {
        return res.status(404).json(apiResponse(false, 'Group not found for this task'));
      }
      
      // ✅ Check if participants exists and user is a member
      const isMember = group.participants && group.participants.some(
        p => p.user && p.user.toString() === req.user._id.toString()
      );
      
      if (!isMember) {
        return res.status(403).json(apiResponse(false, 'You are not a member of this group'));
      }
    } else if (task.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json(apiResponse(false, 'Not authorized to update this task'));
    }

    task.status = status;
    await task.save();

    const redis = getRedis();
    await redis.del("tasks:all");

    // Emit socket event
    if (task.type === 'group' && task.groupId) {
      emitToGroup(task.groupId, 'task-status-updated', task);
    } else {
      if (task.assignedTo && task.assignedTo.length > 0) {
        task.assignedTo.forEach(userId => {
          emitToUser(userId, 'task-status-updated', task);
        });
      }
      emitToUser(task.createdBy, 'task-status-updated', task);
    }

    res.json(apiResponse(true, 'Task status updated', task));
  } catch (error) {
    console.error('Update task status error:', error);
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