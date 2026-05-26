const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const path = require('path');
const cors = require('cors');

const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const { initIo } = require("./config/socket");

const userRoute = require("./routes/userRoute");
const taskRoute = require("./routes/taskRoute");
const groupRoute = require("./routes/groupRoute");
const chatRoute = require("./routes/chatRoute");
const { getCurrentUser } = require("./controller/userController");
const { authMiddleware } = require("./middleware/authMiddleware");

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// CORS middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));

// Middlewares
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get("/api/me" , authMiddleware, getCurrentUser)
// Routes - Note the /api prefix
app.use("/api/user", userRoute);
app.use("/api/task", taskRoute);
app.use("/api/group", groupRoute);
app.use("/api/chat", chatRoute);

// Root route
app.get("/", (req, res) => {
  res.send("API running...");
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();
    await initIo(server);

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error("❌ Server startup error:", error);
  }
};

startServer();