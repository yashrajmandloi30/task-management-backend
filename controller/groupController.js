const Group = require("../model/groupModel");
const { emitToUser } = require("../config/socket");
const { getRedis } = require("../config/redis");
const apiResponse = require("../config/apiResponse");

exports.createGroup = async (req, res) => {
  try {
    const { name, participants = [] } = req.body;

    if (!name) {
      return res.status(400).json(apiResponse(false, "Group name required"));
    }

    // Check if user already has a group with same name (optional validation)
    const existingGroup = await Group.findOne({
      name: name,
      createdBy: req.user._id,
    });

    if (existingGroup) {
      return res.status(400).json(apiResponse(false, "You already have a group with this name. Please choose a different name."));
    }

    const creator = {
      user: req.user._id,
      role: "admin",
    };

    const members = participants.map((id) => ({
      user: id,
      role: "member",
    }));

    // Remove duplicates (including creator if accidentally added)
    const uniqueMembers = members.filter(
      (m) => m.user.toString() !== req.user._id.toString()
    );

    const finalParticipants = [creator, ...uniqueMembers];

    const group = await Group.create({
      name,
      participants: finalParticipants,
      createdBy: req.user._id,
    });

    const redis = getRedis();
    await redis.del("groups:all");
    
    // Clear cache for all participants
    const participantIds = finalParticipants.map(p => p.user.toString());
    for (const userId of participantIds) {
      await redis.del(`groups:user:${userId}`);
    }

    finalParticipants.forEach((p) => {
      emitToUser(p.user, "groupCreated", group);
    });

    res.json(apiResponse(true, "Group created", group));
  } catch (err) {
    console.error(err);
    // Handle duplicate key error
    if (err.code === 11000) {
      return res.status(400).json(apiResponse(false, "A group with this name already exists. Please choose a different name."));
    }
    res.status(500).json(apiResponse(false, err.message));
  }
};

exports.getGroups = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const redis = getRedis();
    const key = `groups:user:${req.user._id}`;

    const cached = await redis.get(key);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const groups = await Group.find({
      "participants.user": req.user._id, // ✅ IMPORTANT
    }).populate("participants.user", "name email");

    await redis.set(key, JSON.stringify(groups), { EX: 60 });

    res.json(groups);
  } catch (err) {
    console.error("GET GROUP ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const groupId = req.params.id;

    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      req.body,
      { new: true }
    ).populate("participants.user", "name email");

    if (!updatedGroup) {
      return res.status(404).json(apiResponse(false, "Group not found"));
    }

    // 🔥 REDIS CACHE CLEAR
    const redis = getRedis();

    // Clear cache for all participants
    const participantIds = updatedGroup.participants.map(
      (p) => p.user._id.toString()
    );

    for (const userId of participantIds) {
      await redis.del(`groups:user:${userId}`);
    }

    // 🔥 SOCKET EMIT (optional but recommended)
    participantIds.forEach((userId) => {
      emitToUser(userId, "groupUpdated", updatedGroup);
    });

    res.json(apiResponse(true, "Group updated", updatedGroup));
  } catch (err) {
    console.error("UPDATE GROUP ERROR:", err);
    res.status(500).json(apiResponse(false, err.message));
  }
}; 
exports.deleteGroup = async (req, res) => {
  try {
    await Group.findByIdAndDelete(req.params.id);
    res.json(apiResponse(true, "Group deleted"));
  } catch (err) {
    res.status(500).json(apiResponse(false, err.message));
  }
}; 
