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


app.patch("/api/founder/startup/:id", async (req, res) => {
  try {
    const id = makeObjectId(req.params.id);
    if (!id) return res.status(400).send({ message: "Invalid startup id" });

    const updateData = req.body;
    delete updateData._id;

    const result = await startupCollection.updateOne(
      { _id: id },
      {
        $set: {
          ...updateData,
          updatedAt: new Date(),
        },
      }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.delete("/api/founder/startup/:id", async (req, res) => {
  try {
    const id = makeObjectId(req.params.id);
    if (!id) return res.status(400).send({ message: "Invalid startup id" });

    const result = await startupCollection.deleteOne({ _id: id });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// =============================
// Add / Manage Opportunities
// =============================
app.get("/api/founder/opportunities", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).send({ message: "Founder email is required" });

    const result = await opportunityCollection
      .find({ founder_email: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.post("/api/founder/opportunities", async (req, res) => {
  try {
    const opportunity = req.body;

    if (!opportunity.role_title || !opportunity.required_skills || !opportunity.work_type || !opportunity.commitment_level || !opportunity.deadline || !opportunity.founder_email) {
      return res.status(400).send({ message: "Missing required opportunity fields" });
    }

    const totalPosted = await opportunityCollection.countDocuments({
      founder_email: opportunity.founder_email,
    });

    const hasPremium = await paymentCollection.findOne({
      user_email: opportunity.founder_email,
      payment_status: "Paid",
    });

    if (totalPosted >= 3 && !hasPremium) {
      return res.status(403).send({
        message: "Premium package required to post more than 3 opportunities",
      });
    }

    const newOpportunity = {
      startup_id: opportunity.startup_id,
      startup_name: opportunity.startup_name,
      founder_email: opportunity.founder_email,
      role_title: opportunity.role_title,
      required_skills: opportunity.required_skills,
      work_type: opportunity.work_type,
      commitment_level: opportunity.commitment_level,
      deadline: opportunity.deadline,
      image: opportunity.image || "",
      createdAt: new Date(),
    };

    const result = await opportunityCollection.insertOne(newOpportunity);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.patch("/api/founder/opportunities/:id", async (req, res) => {
  try {
    const id = makeObjectId(req.params.id);
    if (!id) return res.status(400).send({ message: "Invalid opportunity id" });

    const updateData = req.body;
    delete updateData._id;

    const result = await opportunityCollection.updateOne(
      { _id: id },
      {
        $set: {
          ...updateData,
          updatedAt: new Date(),
        },
      }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});



app.delete("/api/founder/opportunities/:id", async (req, res) => {
  try {
    const id = makeObjectId(req.params.id);
    if (!id) return res.status(400).send({ message: "Invalid opportunity id" });

    const result = await opportunityCollection.deleteOne({ _id: id });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// =============================
// Applications for Founder
// =============================
app.get("/api/founder/applications", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).send({ message: "Founder email is required" });

    const opportunities = await opportunityCollection
      .find({ founder_email: email })
      .project({ _id: 1, role_title: 1, startup_name: 1 })
      .toArray();

    const opportunityIds = opportunities.map((op) => op._id.toString());

    const applications = await applicationCollection
      .find({ opportunity_id: { $in: opportunityIds } })
      .sort({ applied_at: -1 })
      .toArray();

    res.send(applications);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.patch("/api/founder/applications/:id/status", async (req, res) => {
  try {
    const id = makeObjectId(req.params.id);
    if (!id) return res.status(400).send({ message: "Invalid application id" });

    const { status } = req.body;

    if (!["Accepted", "Rejected", "Pending"].includes(status)) {
      return res.status(400).send({ message: "Invalid status" });
    }

    const result = await applicationCollection.updateOne(
      { _id: id },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});


// =============================
// Collaborator profile
// =============================
app.get("/api/collaborator/profile", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).send({ message: "Email is required" });

    const profile = await collaboratorProfileCollection.findOne({ email });
    if (!profile) return res.status(404).send({ message: "Profile not found" });

    res.send({ profile });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.post("/api/collaborator/profile", async (req, res) => {
  try {
    const { email, name, image, skills, bio } = req.body;
    if (!email || !name || !skills) {
      return res.status(400).send({ message: "Email, name, and skills are required" });
    }

    const update = {
      email,
      name,
      image: image || "",
      skills,
      bio: bio || "",
      updatedAt: new Date(),
    };

    const result = await collaboratorProfileCollection.findOneAndUpdate(
      { email },
      { $set: update, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, returnDocument: "after" }
    );

    res.send({ profile: result.value });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});



// =============================
// Collaborator applications
// =============================
app.get("/api/applications", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).send({ message: "Email is required" });

    const applications = await applicationCollection
      .find({ applicant_email: email })
      .sort({ applied_at: -1 })
      .toArray();

    res.send({ applications });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.post("/api/applications", async (req, res) => {
  try {
    const {
      opportunity_id,
      applicant_email,
      portfolio_link,
      motivation_message,
    } = req.body;

    if (
      !opportunity_id ||
      !applicant_email ||
      !portfolio_link ||
      !motivation_message
    ) {
      return res.status(400).send({ message: "All fields are required" });
    }

    const opportunity = await opportunityCollection.findOne({
      _id: makeObjectId(opportunity_id),
    });

    if (!opportunity) {
      return res.status(404).send({ message: "Opportunity not found" });
    }

    const alreadyApplied = await applicationCollection.findOne({
      opportunity_id,
      applicant_email,
    });

    if (alreadyApplied) {
      return res.status(400).send({ message: "You already applied" });
    }

    const newApplication = {
      opportunity_id,
      opportunity_name: opportunity.role_title,
      startup_name: opportunity.startup_name,
      applicant_email,
      portfolio_link,
      motivation_message,
      status: "Pending",
      applied_at: new Date(),
      createdAt: new Date(),
    };

    const result = await applicationCollection.insertOne(newApplication);
    res.send({ ...newApplication, _id: result.insertedId });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});



// =============================
// Payment status and checkout
// =============================
app.get("/api/payments/info", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).send({ message: "Email is required" });

    const latestPayment = await paymentCollection
      .find({ user_email: email, payment_status: "Paid" })
      .sort({ paid_at: -1 })
      .limit(1)
      .toArray();

    const payment = latestPayment[0] || null;
    const opportunitiesUsed = await opportunityCollection.countDocuments({
      founder_email: email,
    });

    res.send({
      current_package: payment?.package_name || null,
      opportunities_posted: opportunitiesUsed,
      opportunities_allowed: payment?.opportunities_allowed || 3,
      upgrade_required:
        opportunitiesUsed >= (payment?.opportunities_allowed || 3),
    });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.post("/api/payments/checkout", async (req, res) => {
  try {
    const { email, package_id } = req.body;
    if (!email || !package_id) {
      return res.status(400).send({ message: "Email and package_id are required" });
    }

    const packages = {
      basic: { price: 2900, name: "Basic", opportunities: 3 },
      pro: { price: 7900, name: "Professional", opportunities: 15 },
      enterprise: { price: 19900, name: "Enterprise", opportunities: 999 },
    };

    const pkg = packages[package_id];
    if (!pkg) return res.status(400).send({ message: "Invalid package_id" });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${pkg.name} StartupForge Package`,
              description: `Post up to ${pkg.opportunities} opportunities`,
            },
            unit_amount: pkg.price,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/dashboard/collaborator`,
      customer_email: email,
      metadata: {
        package_id,
      },
    });

    await paymentCollection.insertOne({
      user_email: email,
      package_id,
      package_name: pkg.name,
      amount: pkg.price / 100,
      payment_status: "Pending",
      stripe_session_id: session.id,
      opportunities_allowed: pkg.opportunities,
      createdAt: new Date(),
    });

    res.send({ checkout_url: session.url, session_id: session.id });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});



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