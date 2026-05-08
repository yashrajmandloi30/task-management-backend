const User = require("../model/userModel");
const apiResponse = require("../config/apiResponse");

const registerUser = async (req, res) => {
  try {
    const { name, userId, email, password } = req.body;
    if (!name || !userId || !email || !password) {
      return res
        .status(400)
        .json(apiResponse(false, "All fields are required"));
    }
    const existingUser = await User.findOne({ $or: [{ email }, { userId }] });
    if (existingUser) {
      return res.status(400).json(apiResponse(false, "User already exists"));
    }
    const user = new User({ name, userId, email, password });
    await user.save();
    res.status(201).json(
      apiResponse(true, "User registered successfully", {
        user: {
          name: user.name,
          userId: user.userId,
          email: user.email,
          role: user.role,
          token: user.generateToken(),
        },
      }),
    );
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json(apiResponse(false, "Server error"));
  }
};

const loginUser = async (req, res) => {
  try {
    console.log("body",req.body)
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json(apiResponse(false, "Email and password are required"));
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json(apiResponse(false, "Invalid credentials"));
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json(apiResponse(false, "Invalid credentials"));
    }
    res.status(200).json(
      apiResponse(true, "Login successful", {
        token: user.generateToken(),
      }),
    );
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json(apiResponse(false, "Server error"));
  }
};


const getAllUsers = async (req, res) => {
  try {
    // Get all users except the current user
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select("name email userId _id");
    
    res.json(apiResponse(true, "Users fetched successfully", users));
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json(apiResponse(false, "Server error"));
  }
}; 

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json(apiResponse(false, 'User not found'));
    }
    res.json(apiResponse(true, 'User fetched', user));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

module.exports = { registerUser, loginUser  , getAllUsers  , getCurrentUser};
