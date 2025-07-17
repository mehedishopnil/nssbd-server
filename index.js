const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const { MongoClient, ServerApiVersion } = require("mongodb");

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



    // ======================
    // ✅ USERS ROUTES
    // ======================

    // GET /users?email=email@example.com
    app.get("/users", async (req, res) => {
      const { email, isAdmin } = req.query;

      if (email) {
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });
        return res.json(user);
      }

      const filter = isAdmin ? { isAdmin: true } : {};
      const users = await usersCollection.find(filter).toArray();
      res.json(users);
    });
    

    // GET /users/:email - get user by email (cleaner API for client)
    app.get("/users/:email", async (req, res) => {
      const { email } = req.params;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    });

    // POST /users - create a new user
    app.post("/users", async (req, res) => {
      const user = req.body;
      if (!user?.email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const result = await usersCollection.insertOne({
        ...user,
        isAdmin: user.isAdmin || false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const createdUser = await usersCollection.findOne({
        _id: result.insertedId,
      });
      res.status(201).json(createdUser);
    });

    // PATCH /users/:email - update user data (e.g., role change)
    app.patch("/users/:email", async (req, res) => {
      const { email } = req.params;
      const updateData = req.body;

      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            ...updateData,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const updatedUser = await usersCollection.findOne({ email });
      res.json(updatedUser);
    });

    // ======================
    // ✅ Health & Default
    // ======================
    app.get("/", (_req, res) => res.send("🚀 NSS Server is running"));

    app.get("/health", async (_req, res) => {
      const admin = client.db("admin");
      const info = await admin.command({ serverStatus: 1 });
      res.json({
        status: "ok",
        time: new Date(),
        uptime: process.uptime(),
        mongoOk: info.ok === 1,
        mongoHost: info.host,
      });
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

// ========================
// 👋 Graceful Shutdown
// ========================
["SIGINT", "SIGTERM"].forEach((signal) =>
  process.on(signal, async () => {
    console.log(`👋 Received ${signal}, closing MongoDB connection`);
    await client.close();
    process.exit(0);
  })
);
