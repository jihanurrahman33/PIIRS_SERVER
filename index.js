const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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

    //payment related api
    app.post("/create-checkout-session", verifyFBToken, async (req, res) => {
      try {
        // req.decoded_email and req.decoded_uid should be set by verifyFBToken
        const userEmail = req.decoded_email;
        const userUid = req.decoded_uid || null;
        if (!userEmail) return res.status(401).send({ error: "Unauthorized" });

        // amount in smallest currency unit (1000 BDT -> 1000 * 100 = 100000)
        const amount = Math.round(1000 * 100);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "bdt", // confirm Stripe supports BDT for your account
                product_data: {
                  name: "Premium access (one-time)",
                  description: "One-time premium subscription — 1000 BDT",
                },
                unit_amount: amount,
              },
              quantity: 1,
            },
          ],
          metadata: {
            userEmail,
            userUid: userUid || "",
            // any other metadata you want
          },
          success_url: `${process.env.CLIENT_URL}/dashboard/profile?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/dashboard/profile?canceled=true`,
        });

        return res.send({ url: session.url, id: session.id });
      } catch (err) {
        console.error("create-checkout-session error:", err);
        return res.status(500).send({ error: "Failed to create session" });
      }
    });
    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId)
          return res.status(400).send({ error: "session_id required" });

        // Retrieve session (expand payment_intent if you want more details)
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["payment_intent"],
        });
        if (!session)
          return res.status(404).send({ error: "Session not found" });

        const paymentIntent =
          typeof session.payment_intent === "object"
            ? session.payment_intent.id
            : session.payment_intent;

        if (!paymentIntent) {
          return res
            .status(400)
            .send({ error: "Payment intent not available on session" });
        }

        // Avoid duplicates: check by payment_intent
        const existing = await paymentsCollection.findOne({
          payment_intent: paymentIntent,
        });
        if (existing) {
          return res.send({
            message: "already exist",
            transactionId: paymentIntent,
            payment: existing,
          });
        }

        // Build payment document
        const paymentDoc = {
          stripeSessionId: session.id,
          payment_intent: paymentIntent,
          amount_total: session.amount_total ?? null, // in minor units
          amount_display:
            session.amount_total != null ? session.amount_total / 100 : null, // for easy reading
          currency: session.currency ?? null,
          payment_status: session.payment_status ?? null,
          customer_email:
            session.customer_email ?? session.metadata?.userEmail ?? null,
          metadata: session.metadata ?? {},
          createdAt: new Date(),
        };

        // Insert payment record
        const insertRes = await paymentsCollection.insertOne(paymentDoc);

        // If paid, update user's premium flag (metadata should include userEmail)
        if (session.payment_status === "paid") {
          const userEmail = session.metadata?.userEmail;
          if (userEmail) {
            await usersCollection.updateOne(
              { email: userEmail },
              { $set: { isPremium: true, premiumSince: new Date() } },
              { upsert: false }
            );
          }
        }

        return res.send({
          success: true,
          transactionId: paymentIntent,
          paymentId: insertRes.insertedId,
          userEmail: session.metadata?.userEmail ?? null,
        });
      } catch (err) {
        console.error("payment-success error:", err);
        return res.status(500).send({ success: false, error: err.message });
      }
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

    //latest resolved issues
    app.get("/issues", async (req, res) => {
      const query = req.query;
      console.log(query);
      const result = await issuesCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(8)
        .toArray();
      res.send(result);
    });
    app.get("/issues/all", async (req, res) => {
      const result = await issuesCollection.find().toArray();
      res.send(result);
    });
    app.get(
      "/issues/all/admin",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const result = await issuesCollection.find().toArray();
        res.send(result);
      }
    );
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
    //dashoboard stats of admin
    app.get(
      "/dashboard/admin/stats",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const issues = await issuesCollection.find().toArray();
        const totalIssues = issues.length;
        const resolvedIssues = await issuesCollection
          .find({
            status: "resolved",
          })
          .toArray();
        const totalResolvedIssues = resolvedIssues.length;
        const pendingIssues = await issuesCollection
          .find({ status: "pending" })
          .toArray();
        const totalPendingIssues = pendingIssues.length;
        const rejectedIssues = await issuesCollection
          .find({
            status: "rejected",
          })
          .toArray();
        const totalRejectedIssues = rejectedIssues.length;
        const result = {
          totalIssues,
          totalResolvedIssues,
          totalPendingIssues,
          totalRejectedIssues,
        };
        res.send(result);
      }
    );
    //staff dashboard stats
    // GET /dashboard/staff/:email/stats
    app.get(
      "/dashboard/staff/:email/stats",
      verifyFBToken,
      verifyStaff,
      async (req, res) => {
        try {
          const targetEmail = req.params.email;
          const requesterEmail = req.decoded_email; // set by verifyFBToken

          if (!targetEmail)
            return res.status(400).send({ error: "Missing staff email" });
          if (!requesterEmail)
            return res.status(401).send({ error: "Unauthorized" });

          // authorize: allow if requester is the same user or admin
          const requester = await usersCollection.findOne({
            email: requesterEmail,
          });
          if (!requester)
            return res.status(401).send({ error: "Requester not found" });

          const isAdmin = requester.role === "admin";
          const isSelf = requesterEmail === targetEmail;
          if (!isAdmin && !isSelf) {
            return res.status(403).send({ error: "Forbidden" });
          }

          // Helper: match assignedStaff stored either as string email or object { email }
          const assignedMatch = {
            $or: [
              { "assignedStaff.email": targetEmail },
              { assignedStaff: targetEmail },
              { assignedStaff: { $eq: targetEmail } }, // defensive
            ],
          };

          // 1) assignedCount: issues currently assigned to staff (not resolved/rejected/closed)
          const openStatusFilter = { $nin: ["resolved", "rejected", "closed"] };
          const assignedCount = await issuesCollection.countDocuments({
            ...assignedMatch,
            status: openStatusFilter,
          });

          // 2) resolvedCount: issues with status resolved assigned to staff
          const resolvedCount = await issuesCollection.countDocuments({
            ...assignedMatch,
            status: "resolved",
          });

          // 3) openCount: similar to assignedCount but explicit 'open' statuses if you use specific ones
          // (keeps parity with UI variable 'openCount')
          const openCount = assignedCount;

          // 4) avgResponseHours: average hours between assignedAt -> resolvedAt for resolved issues by this staff
          // Only consider docs where both assignedAt and resolvedAt exist
          const avgAgg = await issuesCollection
            .aggregate([
              {
                $match: {
                  ...assignedMatch,
                  status: "resolved",
                  assignedAt: { $exists: true, $ne: null },
                  resolvedAt: { $exists: true, $ne: null },
                },
              },
              {
                $project: {
                  diffMs: { $subtract: ["$resolvedAt", "$assignedAt"] },
                },
              },
              {
                $group: {
                  _id: null,
                  avgMs: { $avg: "$diffMs" },
                  count: { $sum: 1 },
                },
              },
            ])
            .toArray();

          let avgResponseHours = "-";
          if (avgAgg && avgAgg[0] && typeof avgAgg[0].avgMs === "number") {
            const avgHours = avgAgg[0].avgMs / (1000 * 60 * 60);
            // round to one decimal
            avgResponseHours = Math.round(avgHours * 10) / 10;
          }

          // 5) last7Days: resolved issues count per day for last 7 days (including today)
          const now = new Date();
          const start7 = new Date(now);
          start7.setHours(0, 0, 0, 0);
          start7.setDate(start7.getDate() - 6); // 7 days total: today and previous 6

          const last7Agg = await issuesCollection
            .aggregate([
              {
                $match: {
                  ...assignedMatch,
                  status: "resolved",
                  resolvedAt: { $gte: start7 },
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$resolvedAt" },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ])
            .toArray();

          // Convert aggregation result to map for easy filling of missing days
          const countsByDate = {};
          last7Agg.forEach((d) => (countsByDate[d._id] = d.count));

          // Build array of last 7 days with labels
          const last7Days = [];
          for (let i = 0; i < 7; i++) {
            const d = new Date(start7);
            d.setDate(start7.getDate() + i);
            const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
            // label: e.g., '12-09' or short day like 'Mon'
            const label = `${iso.slice(5)}`; // MM-DD
            last7Days.push({
              date: iso,
              label,
              count: countsByDate[iso] || 0,
            });
          }

          // assignedToYou: how many issues are assigned to this staff (same as assignedCount but returning for compatibility)
          const assignedToYou = assignedCount;

          const result = {
            assignedCount,
            resolvedCount,
            openCount,
            assignedToYou,
            avgResponseHours,
            last7Days,
          };

          return res.send(result);
        } catch (err) {
          console.error("GET /dashboard/staff/:email/stats error:", err);
          return res.status(500).send({ error: "Internal server error" });
        }
      }
    );
    //citizen dashboard api
    // GET /dashboard/citizen/:email/stats
    app.get(
      "/dashboard/citizen/:email/stats",
      verifyFBToken,
      async (req, res) => {
        try {
          const targetEmail = req.params.email;
          const requesterEmail = req.decoded_email; // set by verifyFBToken

          if (!targetEmail)
            return res.status(400).send({ error: "Missing email" });
          if (!requesterEmail)
            return res.status(401).send({ error: "Unauthorized" });

          // find requester to check role
          const requester = await usersCollection.findOne({
            email: requesterEmail,
          });
          if (!requester)
            return res.status(401).send({ error: "Requester not found" });

          const isAdmin = requester.role === "admin";
          const isSelf = requesterEmail === targetEmail;
          if (!isAdmin && !isSelf)
            return res.status(403).send({ error: "Forbidden" });

          // Basic counts for the user's issues
          const baseFilter = { createdBy: targetEmail };

          const submittedCountPromise =
            issuesCollection.countDocuments(baseFilter);

          const resolvedCountPromise = issuesCollection.countDocuments({
            ...baseFilter,
            status: "resolved",
          });

          const pendingCountPromise = issuesCollection.countDocuments({
            ...baseFilter,
            status: "pending",
          });

          // openCount = issues not resolved/rejected/closed
          const openCountPromise = issuesCollection.countDocuments({
            ...baseFilter,
            status: { $nin: ["resolved", "rejected", "closed"] },
          });

          // upvotesGiven = number of issues where this user is in upvoters array
          const upvotesGivenPromise = issuesCollection.countDocuments({
            upvoters: targetEmail,
          });

          // last7Days: number of issues created by this user per day for last 7 days
          const now = new Date();
          const start7 = new Date(now);
          start7.setHours(0, 0, 0, 0);
          start7.setDate(start7.getDate() - 6); // include today and previous 6 days

          const last7Agg = await issuesCollection
            .aggregate([
              {
                $match: {
                  createdBy: targetEmail,
                  createdAt: { $gte: start7 },
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ])
            .toArray();

          // resolve parallel count promises
          const [
            submittedCount,
            resolvedCount,
            pendingCount,
            openCount,
            upvotesGiven,
          ] = await Promise.all([
            submittedCountPromise,
            resolvedCountPromise,
            pendingCountPromise,
            openCountPromise,
            upvotesGivenPromise,
          ]);

          // Build last7Days array (fill missing days with 0)
          const countsByDate = {};
          last7Agg.forEach((d) => {
            countsByDate[d._id] = d.count;
          });

          const last7Days = [];
          for (let i = 0; i < 7; i++) {
            const d = new Date(start7);
            d.setDate(start7.getDate() + i);
            const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
            const label = `${iso.slice(5)}`; // MM-DD
            last7Days.push({
              date: iso,
              label,
              count: countsByDate[iso] || 0,
            });
          }

          // Find user doc to return isBlocked flag (if you want)
          const targetUserDoc = await usersCollection.findOne({
            email: targetEmail,
          });
          const isBlocked = Boolean(
            targetUserDoc &&
              (targetUserDoc.isBlocked || targetUserDoc.isBlcoked)
          );

          const result = {
            submittedCount: submittedCount || 0,
            resolvedCount: resolvedCount || 0,
            pendingCount: pendingCount || 0,
            openCount: openCount || 0,
            upvotesGiven: upvotesGiven || 0,
            isBlocked: !!isBlocked,
            last7Days,
          };

          return res.send(result);
        } catch (err) {
          console.error("GET /dashboard/citizen/:email/stats error:", err);
          return res.status(500).send({ error: "Internal server error" });
        }
      }
    );

    app.listen(port, () => {
      console.log(`app listening on port ${port}`);
    });
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
