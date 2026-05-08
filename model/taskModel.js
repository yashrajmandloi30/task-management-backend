const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed", "review"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    type: {
      type: String,
      enum: ["group", "personal"],
      default: "personal",
    },
    assignedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    date: {
      type: Date,
      default: Date.now,
    },
    deadline: {
      type: Date,
    },
    file: {
      type: String,
    },
  },
  { timestamps: true },
);

taskSchema.index({ title: 1, createdBy: 1 }, { unique: true });

module.exports = mongoose.model("Task", taskSchema);
