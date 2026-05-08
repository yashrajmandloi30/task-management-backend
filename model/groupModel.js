// backend/models/groupModel.js
const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        role: {
          type: String,
          enum: ["admin", "member"],
          default: "member",
        },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

groupSchema.index({ name: 1 });
groupSchema.index({ createdBy: 1 });
groupSchema.index({ "participants.user": 1 });

module.exports = mongoose.model("Group", groupSchema);