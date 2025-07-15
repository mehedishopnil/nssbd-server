const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion } = require('mongodb');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection URI
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
    // Enhanced User Routes
    // ======================
    app.get('/users', async (_req, res) => {
      const users = await usersCollection.find().toArray();
      res.json(users);
    });

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      if (!user?.email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      // Check if user already exists
      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const result = await usersCollection.insertOne({
        ...user,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      res.status(201).json(result);
    });

    // ======================
    // Health Check & Root
    // ======================
    app.get("/", (_req, res) => res.send("🚀 NSS Server is running"));

    app.get("/health", (_req, res) =>
      res.json({
        status: "ok",
        time: new Date(),
        db: client.topology?.isConnected() ? "connected" : "disconnected",
      })
    );

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
// Graceful Shutdown
// ========================
["SIGINT", "SIGTERM"].forEach(signal =>
  process.on(signal, async () => {
    console.log(`👋 Received ${signal}, closing MongoDB connection`);
    await client.close();
    process.exit(0);
  })
);
