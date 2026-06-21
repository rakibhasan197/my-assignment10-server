const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
require("dotenv").config();
const express = require('express');
const app = express()
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}
const stripe = require("stripe")(stripeSecretKey);
const PORT = process.env.PORT || 8000;


app.use(cors())
app.use(express.json())
// Sanitize and validate connection string from .env
let uri = process.env.MONGODB_URI


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    const database = client.db("StartupForge")
    const startupCollection = database.collection("startup")
    const opportunityCollection = database.collection("opportunity")
    const applicationCollection = database.collection("applications");
    const paymentCollection = database.collection("payments");
    const collaboratorProfileCollection = database.collection("collaborator_profiles");
    

    app.get('/api/startup', async (req, res) => {
  const result = await startupCollection
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});

    app.get('/api/featured-startups', async (req, res) => {
  try {
    const result = await startupCollection
      .find()
      .sort({ createdAt: -1 }) 
      .limit(4)
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get("/api/opportunities", async (req, res) => {
  try {
    const result = await opportunityCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get("/api/featured-opportunities", async (req, res) => {
  const result = await opportunityCollection
    .find()
    .sort({ createdAt: -1 })
    .limit(4)
    .toArray();

  res.send(result);
});


// helper
const makeObjectId = (id) => {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
};

// =============================
// Founder Dashboard Overview
// =============================
app.get("/api/founder/overview", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).send({ message: "Founder email is required" });

    const startups = await startupCollection
      .find({ founder_email: email })
      .project({ _id: 1, startup_name: 1 })
      .toArray();

    const startupIds = startups.map((s) => s._id.toString());
    const startupNames = startups.map((s) => s.startup_name);

    const opportunityQuery = {
      $or: [
        { founder_email: email },
        { startup_id: { $in: startupIds } },
        { startup_name: { $in: startupNames } },
      ],
    };

    const opportunities = await opportunityCollection
      .find(opportunityQuery)
      .project({ _id: 1 })
      .toArray();

    const opportunityIds = opportunities.map((op) => op._id.toString());

    const totalApplications = await applicationCollection.countDocuments({
      opportunity_id: { $in: opportunityIds },
    });

    const acceptedMembers = await applicationCollection.countDocuments({
      opportunity_id: { $in: opportunityIds },
      status: "Accepted",
    });

    res.send({
      totalOpportunities: opportunities.length,
      totalApplications,
      acceptedMembers,
    });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// =============================
// My Startup: Create / Read
// =============================
app.get("/api/founder/startup", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).send({ message: "Founder email is required" });

    const result = await startupCollection
      .find({ founder_email: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.post("/api/founder/startup", async (req, res) => {
  try {
    const startup = req.body;

    if (!startup.startup_name || !startup.logo || !startup.industry || !startup.description || !startup.funding_stage || !startup.founder_email) {
      return res.status(400).send({ message: "Missing required startup fields" });
    }

    const newStartup = {
      startup_name: startup.startup_name,
      logo: startup.logo,
      industry: startup.industry,
      description: startup.description,
      funding_stage: startup.funding_stage,
      founder_email: startup.founder_email,
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await startupCollection.insertOne(newStartup);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// =============================
// My Startup: Update / Delete
// =============================



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})