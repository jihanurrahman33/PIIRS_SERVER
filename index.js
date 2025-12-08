const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();

const admin = require("firebase-admin");

const serviceAccount = require("./piirs-1d68b-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//middleware
app.use(cors());
app.use(express.json());
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    res.status(401).send({ message: "unauthorized access" });
  }
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    //db and collection info
    const database = client.db("PIIRS");
    const usersCollection = database.collection("users");
    const issuesCollection = database.collection("issues");
    const timelinesCollection = database.collection("timelines");
    const paymentsCollection = database.collection("payments");

    app.get("/", (req, res) => {
      res.send("server is live");
    });

    //users related API's
    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      const { name, photoURL } = userInfo;
      const accessToken = req.headers.authorization.split(" ")[1];
      if (!accessToken)
        return res.status(401).json({ error: "Unauthorized Access" });
      const decoded = await admin.auth().verifyIdToken(accessToken);
      const uid = decoded.uid;
      const email = decoded.email || null;

      const userProfile = {
        name,
        email,
        photoURL,
        role: "citizen",
        isPremium: false,
        isBlcoked: false,
        createdAt: new Date(),
      };
      const query = { email };
      const isUserExist = await usersCollection.findOne(query);
      if (!isUserExist) {
        const result = await usersCollection.insertOne(userProfile);
        return res.send(result);
      }
      return res.send({ message: "user Already Exist" });
    });

    //issues related API's
    app.get("/issues", async (req, res) => {
      const result = await issuesCollection.find().toArray();
      res.send(result);
    });
    app.get("/issues/details/:id", async (req, res) => {
      const issueId = req.params.id;
      const query = { _id: new ObjectId(issueId) };
      const result = await issuesCollection.findOne(query);
      res.send(result);
    });

    app.post("/issues", verifyFBToken, async (req, res) => {
      const issueData = req.body;
      issueData.status = "pending";
      issueData.priority = "normal";
      issueData.isBoosted = false;
      issueData.createdBy = req.decoded_email;
      issueData.createdAt = new Date();

      console.log(issueData);

      const result = await issuesCollection.insertOne(issueData);

      res.send(result);
    });

    app.get("/my-issues", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const query = { createdBy: email };

      const result = await issuesCollection.find(query).toArray();
      res.send(result);
    });

    app.listen(port, () => {
      console.log(`app listening on port ${port}`);
    });
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
