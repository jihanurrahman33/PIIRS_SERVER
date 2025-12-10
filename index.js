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

    //middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;

      const query = { email };

      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyStaff = async (req, res, next) => {
      const email = req.decoded_email;

      const query = { email };

      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "staff") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    app.get("/", (req, res) => {
      res.send("server is live");
    });

    //users related API's
    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = {
        email,
      };
      const result = await usersCollection.findOne(query);
      console.log(result);

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

    app.get(
      "/users/:role/staffs",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const role = req.params.role;
        const query = { role };
        console.log(query);
        const result = await usersCollection.find(query).toArray();
        res.send(result);
      }
    );

    //admin api's
    app.post(
      "/users/add-staff",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const {
            name,
            email,
            password,
            photoURL = "",
            phone = "",
            address = "",
          } = req.body;

          if (!email || !password) {
            return res
              .status(400)
              .send({ error: "Email and password are required" });
          }

          // Create Firebase Authentication user
          const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
            photoURL,
          });

          // Assign custom claim so Firebase securely knows the user is staff
          await admin
            .auth()
            .setCustomUserClaims(userRecord.uid, { role: "staff" });

          // Build staff MongoDB document
          const staffInfo = {
            uid: userRecord.uid,
            name,
            email,
            photoURL,
            phone,
            address,
            role: "staff",
            createdAt: new Date(),
            isPremium: false,
            isBlocked: false,
          };

          // Insert into MongoDB
          const result = await usersCollection.insertOne(staffInfo);

          return res.status(201).send({
            success: true,
            message: "Staff created successfully",
            userId: userRecord.uid,
            insertedId: result.insertedId,
          });
        } catch (error) {
          console.error("Add staff error:", error);
          return res.status(500).send({
            success: false,
            error: error.message,
          });
        }
      }
    );

    //issues related API's
    app.get("/issues", verifyFBToken, async (req, res) => {
      const query = req.query;
      console.log(query);
      const result = await issuesCollection.find(query).limit(6).toArray();
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
      issueData.upvotes = 0;
      issueData.upvoters = [];
      issueData.createdBy = req.decoded_email;
      issueData.createdAt = new Date();

      console.log(issueData);

      const result = await issuesCollection.insertOne(issueData);

      res.send(result);
    });

    //change status by staff
    app.patch(
      `/issues/:issueId/status`,
      verifyFBToken,
      verifyStaff,
      async (req, res) => {
        const issueId = req.params.issueId;
        const { status } = req.body;

        const query = { _id: new ObjectId(issueId) };
        const updatedDoc = { $set: { status } };

        const result = await issuesCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    app.get("/my-issues", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const query = { createdBy: email };

      const result = await issuesCollection.find(query).toArray();
      res.send(result);
    });

    // getissuesByAssinedStaff
    app.get(
      "/issues/:staffEmail/assinedTask",
      verifyFBToken,
      verifyStaff,
      async (req, res) => {
        const assignedStaff = req.params.staffEmail;
        const query = { assignedStaff };

        const result = await issuesCollection.find(query).toArray();

        res.send(result);
      }
    );

    //staff assign
    app.post(
      "/issues/:selectedIssueId/assign",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { selectedIssueId } = req.params;
          const { staffEmail } = req.body;

          if (!staffEmail) {
            return res.status(400).json({ error: "staffEmail required" });
          }

          let _id;
          try {
            _id = new ObjectId(selectedIssueId);
          } catch {
            return res.status(400).json({ error: "Invalid issue id" });
          }

          // update issue
          const updated = await issuesCollection.findOneAndUpdate(
            { _id },
            {
              $set: {
                status: "staff-assigned",
                assignedStaff: staffEmail,
              },
            },
            { returnDocument: "after" }
          );

          if (!updated) {
            return res.status(404).json({ error: "Issue not found" });
          }

          res.json({ success: true, issue: updated });
        } catch (err) {
          console.error("Assign error:", err);
          res.status(500).json({ error: err.message });
        }
      }
    );

    //upvote on issue
    app.patch("/issues/:id/upvote", verifyFBToken, async (req, res) => {
      console.log(">>> upvote called");
      const issueId = req.params.id;
      const userEmail = req.decoded_email;
      console.log("issueId:", issueId, "userEmail:", userEmail);

      // Validate ObjectId
      let _id;
      try {
        _id = new ObjectId(issueId);
      } catch (err) {
        console.error("Invalid ObjectId:", issueId, err);
        return res.status(400).send({ error: "Invalid issue id" });
      }

      try {
        // Fetch doc first and log it
        const doc = await issuesCollection.findOne({ _id });
        console.log("fetched doc:", doc);

        if (!doc) {
          console.warn("Issue not found for id:", issueId);
          return res.status(404).send({ error: "Issue not found" });
        }

        // normalize and defensive checks
        const upvoters = Array.isArray(doc.upvoters) ? doc.upvoters : [];
        const currentUpvotes =
          typeof doc.upvotes === "number" ? doc.upvotes : 0;

        // log details
        console.log("upvoters array length:", upvoters.length);
        // show first few upvoters to inspect format
        console.log("some upvoters:", upvoters.slice(0, 10));
        console.log("currentUpvotes:", currentUpvotes);

        // membership test — trim and lowercase to avoid whitespace/case mismatch
        const normalizedEmail = (userEmail || "").trim().toLowerCase();
        const normalizedUpvoters = upvoters.map((e) =>
          String(e).trim().toLowerCase()
        );
        const hasUpvoted = normalizedUpvoters.includes(normalizedEmail);
        console.log(
          "normalizedEmail:",
          normalizedEmail,
          "hasUpvoted:",
          hasUpvoted
        );

        if (!hasUpvoted) {
          // Add upvote
          const result = await issuesCollection.findOneAndUpdate(
            { _id, upvoters: { $ne: userEmail } },
            {
              $addToSet: { upvoters: userEmail },
              $inc: { upvotes: 1 },
            },
            { returnDocument: "after" }
          );
          console.log("add result:", result);

          // If result.value missing, fallback to currentUpvotes + 1
          const upvotes = result?.value?.upvotes ?? currentUpvotes + 1;
          return res.send({ upvoted: true, upvotes });
        } else {
          // Remove upvote
          const result = await issuesCollection.findOneAndUpdate(
            { _id, upvoters: userEmail },
            {
              $pull: { upvoters: userEmail },
              $inc: { upvotes: -1 },
            },
            { returnDocument: "after" }
          );
          console.log("remove result:", result);

          const upvotes = Math.max(
            0,
            result?.value?.upvotes ?? currentUpvotes - 1
          );
          return res.send({ upvoted: false, upvotes });
        }
      } catch (err) {
        console.error("Upvote route error:", err);
        return res.status(500).send({ error: "Internal server error" });
      }
    });

    app.listen(port, () => {
      console.log(`app listening on port ${port}`);
    });
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
