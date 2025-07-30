const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@projectdata.7tbgj12.mongodb.net/?retryWrites=true&w=majority&appName=ProjectData`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectDB() {
  try {
    await client.connect();
    console.log("✅ MongoDB Connected Successfully");

    const db = client.db("nssbdDB");
    const usersCollection = db.collection("users");
    const usersMessagesCollection = db.collection("usersMessages");

    // ======================
    // ✅ USERS ROUTES
    // ======================

    // GET /users - Get all users (admin only)
    app.get("/users", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({ message: "Email parameter is required" });
        }

        // First check if requesting user is admin
        const requestingUser = await usersCollection.findOne({ email });

        if (!requestingUser) {
          return res.status(404).json({ message: "User not found" });
        }

        if (!requestingUser.isAdmin) {
          return res.status(403).json({ message: "Unauthorized: Admin access required" });
        }

        // If admin, return all users (excluding sensitive fields)
        const allUsers = await usersCollection.find({}).project({
          password: 0,
          firebaseUID: 0
        }).toArray();

        res.json(allUsers);
      } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // GET /users/:email - Get specific user by email
    app.get("/users/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        // Remove sensitive fields before sending
        const { password, firebaseUID, ...userData } = user;
        res.json(userData);
      } catch (err) {
        console.error("Error fetching user:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // POST /users - Create new user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        if (!user?.email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const existingUser = await usersCollection.findOne({ email: user.email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        const newUser = {
          ...user,
          isAdmin: user.isAdmin || false,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: new Date()
        };

        const result = await usersCollection.insertOne(newUser);
        const createdUser = await usersCollection.findOne({ _id: result.insertedId });

        // Remove sensitive fields before sending
        const { password, firebaseUID, ...userData } = createdUser;
        res.status(201).json(userData);
      } catch (err) {
        console.error("Error creating user:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // PATCH /users/:email - Update user data
    app.patch("/users/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const updateData = req.body;

        // Don't allow updating email or admin status through this endpoint
        if (updateData.email || updateData.isAdmin) {
          return res.status(403).json({ message: "Cannot update email or admin status through this endpoint" });
        }

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              ...updateData,
              updatedAt: new Date()
            }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        const updatedUser = await usersCollection.findOne({ email });

        // Remove sensitive fields before sending
        const { password, firebaseUID, ...userData } = updatedUser;
        res.json(userData);
      } catch (err) {
        console.error("Error updating user:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // PATCH /users/admin/:id - Update admin status (admin only)
    app.patch("/users/admin/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { isAdmin, requestingAdminEmail } = req.body;

        if (typeof isAdmin !== 'boolean') {
          return res.status(400).json({ message: "isAdmin must be boolean" });
        }

        // Verify requesting user is admin
        const adminUser = await usersCollection.findOne({ email: requestingAdminEmail });
        if (!adminUser || !adminUser.isAdmin) {
          return res.status(403).json({ message: "Admin privileges required" });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              isAdmin,
              updatedAt: new Date()
            }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        const updatedUser = await usersCollection.findOne({ _id: new ObjectId(id) });

        // Remove sensitive fields before sending
        const { password, firebaseUID, ...userData } = updatedUser;
        res.json(userData);
      } catch (err) {
        console.error("Error updating admin status:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // GET /users/role-check/:email - Check user role
    app.get("/users/role-check/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json({
          email: user.email,
          isAdmin: user.isAdmin || false,
          role: user.role || "user"
        });
      } catch (err) {
        console.error("Error checking user role:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });


    // ======================
    // Posting users messages function
    // ======================

    // POST /users-message - Save user message from contact form
    app.post("/users-message", async (req, res) => {
      try {
        const { name, email, phone, message, userId, userEmail } = req.body;

        // Basic validation
        if (!name || !email || !message) {
          return res.status(400).json({
            success: false,
            message: "Name, email and message are required fields"
          });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            message: "Please provide a valid email address"
          });
        }

        // Create new message document
        const newMessage = {
          name,
          email,
          phone: phone || null,
          message,
          userId: userId || null,
          userEmail: userEmail || email, // Use provided userEmail or fallback to form email
          status: "new", // new, in-progress, resolved
          createdAt: new Date(),
          updatedAt: new Date(),
          isRead: false
        };

        // Insert into MongoDB
        const result = await usersMessagesCollection.insertOne(newMessage);

        if (result.acknowledged) {
          return res.status(201).json({
            success: true,
            message: "Thank you for your message! We'll get back to you soon.",
            data: {
              id: result.insertedId,
              ...newMessage
            }
          });
        } else {
          throw new Error("Failed to save message");
        }
      } catch (err) {
        console.error("Error saving user message:", err);
        res.status(500).json({
          success: false,
          message: "Failed to submit your message. Please try again later."
        });
      }
    });

    // GET /all-users-messages - Get all messages (admin only)
    app.get("/all-users-messages", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email parameter is required" });
    }

    const requestingUser = await usersCollection.findOne({ email });
    if (!requestingUser || !requestingUser.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const messages = await usersMessagesCollection.find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      count: messages.length,
      data: messages
    });
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


    // PATCH /users-messages/:id - Update message status or isRead (admin only)
    app.patch("/users-messages/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status, isRead, adminEmail } = req.body;

        if (!adminEmail) {
          return res.status(400).json({ message: "Admin email is required" });
        }

        // Verify if the requester is an admin
        const adminUser = await usersCollection.findOne({ email: adminEmail });
        if (!adminUser || !adminUser.isAdmin) {
          return res.status(403).json({ message: "Admin privileges required" });
        }

        // Build dynamic update object
        const updateData = {
          updatedAt: new Date()
        };

        if (status && typeof status === "string") updateData.status = status;
        if (typeof isRead === "boolean") updateData.isRead = isRead;

        // If no fields are provided to update
        if (!("status" in req.body || "isRead" in req.body)) {
          return res.status(400).json({ message: "No valid update fields provided" });
        }

        const result = await usersMessagesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Message not found" });
        }

        const updatedMessage = await usersMessagesCollection.findOne({ _id: new ObjectId(id) });

        res.json({
          success: true,
          message: "Message updated successfully",
          data: updatedMessage
        });

      } catch (err) {
        console.error("Error updating message:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });


    //Need users message by user email::
    app.get("/users-messages/:userEmail", async (req, res) => {
      try {
        const { userEmail } = req.params;

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
          return res.status(400).json({
            success: false,
            message: "Please provide a valid email address"
          });
        }

        // Find messages by user email
        const messages = await usersMessagesCollection.find({ userEmail })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({
          success: true,
          count: messages.length,
          data: messages
        });
      } catch (err) {
        console.error("Error fetching user messages:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });



    // ======================
    // ✅ Health & Default
    // ======================
    app.get("/", (_req, res) => res.send("🚀 NSS Server is running"));

    app.get("/health", async (_req, res) => {
      try {
        const admin = client.db("admin");
        const info = await admin.command({ serverStatus: 1 });
        res.json({
          status: "ok",
          time: new Date(),
          uptime: process.uptime(),
          mongoOk: info.ok === 1,
          mongoHost: info.host,
        });
      } catch (err) {
        console.error("Health check failed:", err);
        res.status(500).json({ status: "error", message: "Database connection failed" });
      }
    });

    // Start server
    app.listen(PORT, () =>
      console.log(`✅ NSS Server running on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  }
}

connectDB().catch(console.dir);

// Graceful Shutdown
["SIGINT", "SIGTERM"].forEach((signal) =>
  process.on(signal, async () => {
    console.log(`👋 Received ${signal}, closing MongoDB connection`);
    await client.close();
    process.exit(0);
  })
);