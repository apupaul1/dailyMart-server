const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

dotenv.config();

const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware

app.use(cors());
app.use(express.json());

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decodedKey);


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDb

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rbn9qen.mongodb.net/?appName=Cluster0`;

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
    // await client.connect();

    const db = client.db("productDB");
    const productCollection = db.collection("products");
    const adCollection = db.collection("advertisement");
    const usersCollection = db.collection("users");
    const watchlistCollection = db.collection("watchlist");
    const paymentsCollection = db.collection("payments");
    const reviewsCollection = db.collection("reviews");

    // Custom Middleware

    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).send({ message: "Forbidden access" });
      }
    };

    // Admin Middleware
    const verifyAdmin = async (req, res, next) => {
      try {
        // Check if decoded exists and contains email
        const email = req.decoded?.email;
        if (!email) {
          return res.status(401).send({ message: "Unauthorized: Email missing" });
        }

        const query = { email };
        const user = await usersCollection.findOne(query);

        if (!user || user.role !== "admin") {
          return res.status(403).send({ message: "Forbidden: Admins only" });
        }

        next();
      } catch (error) {
        console.error("verifyAdmin error:", error);
        res.status(500).send({ message: "Internal Server Error in verifyAdmin" });
      }
    };


    // Vendor Middleware

    const verifyVendor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "rider") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // 📩 POST: Submit a new review
    app.post("/reviews", async (req, res) => {
      try {
        const review = req.body;

        // Basic validation
        if (
          !review.productId ||
          !review.userEmail ||
          !review.rating ||
          !review.comment
        ) {
          return res.status(400).send({ error: "Missing required fields" });
        }

        review.date = new Date(); // Set submission date

        const result = await reviewsCollection.insertOne(review);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error submitting review:", error);
        res.status(500).send({ error: "Failed to submit review" });
      }
    });

    // 📤 GET: Fetch all reviews for a product
    app.get("/reviews/:productId", verifyFBToken, async (req, res) => {
      try {
        const productId = req.params.productId;
        const reviews = await reviewsCollection
          .find({ productId })
          .sort({ date: -1 }) // Latest first
          .toArray();
        res.send(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).send({ error: "Failed to load reviews" });
      }
    });

    // USERS : POST API

    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res
          .status(200)
          .send({ message: "User already exists", inserted: false });
      }
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // USERS : GET API

    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      const search = req.query.search || "";
      const query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };

      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    // USERS : PATCH API

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: role } }
        );

        if (result.modifiedCount > 0) {
          res.send({ updated: true });
        } else {
          res.send({ updated: false });
        }
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send({ error: "Failed to update user role" });
      }
    });

    // USERS ROLE : GET API

    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send({ role: user.role || "user" });
      } catch (error) {
        console.error("Error getting user role: ", error);
        res.status(500).send({ error: "Failed to get user role" });
      }
    });

    // Ads : GET API

    app.get("/ads", async (req, res) => {
      try {
        const email = req.query.email;
        const status = req.query.status;

        const query = {};

        if (email) {
          query.email = email;
        }

        if (status) {
          query.status = status.toLowerCase(); // assuming you store 'approved' in lowercase
        }

        const ads = await adCollection.find(query).sort({ _id: -1 }).toArray();

        res.send(ads);
      } catch (error) {
        console.error("Error fetching ads:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Ads : POST API

    app.post("/ads", async (req, res) => {
      try {
        const newAd = req.body;
        const result = await adCollection.insertOne(newAd);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error inserting the product", error);
        res.status(500).send({ message: "Faild to add Product" });
      }
    });

    // Ads: DELETE API

    app.delete("/ads/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await adCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        console.error("Error deleting Product: ", error);
        res.status(500).send({ message: "Failed to delete parcel" });
      }
    });

    //

    // Admin API for add

    app.patch("/ads/status/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      try {
        const result = await adCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount > 0) {
          res.send({ updated: true });
        } else {
          res.send({ updated: false });
        }
      } catch (error) {
        console.error("Error updating ad status:", error);
        res.status(500).send({ error: "Failed to update ad" });
      }
    });

    // In your Express server (e.g., ads.routes.js or main server file)

    app.patch("/ads/:id", async (req, res) => {
      try {
        const adId = req.params.id;
        const updatedFields = req.body;

        const result = await adCollection.updateOne(
          { _id: new ObjectId(adId) },
          { $set: updatedFields }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Ad not found" });
        }

        res.status(200).json({ message: "Ad updated successfully" });
      } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // GET only 6 products

    app.get("/marketcards", async (req, res) => {
      try {
        // Only get approved products, sorted by latest (_id: -1), limited to 6
        const cursor = productCollection
          .find({ status: "approved" })
          .sort({ _id: -1 })
          .limit(8);

        const cards = await cursor.toArray();
        res.send(cards);
      } catch (error) {
        console.error("Error fetching market cards:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // PUBLIC ROUTE: GET /all-products

    app.get("/all-products", async (req, res) => {
      try {
        const { sort, start, end, page = 1, limit = 6 } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const match = { status: "approved" };

        // Date filtering on root document 'date' field
        if (start && end) {
          match.date = {
            $gte: new Date(start),
            $lte: new Date(end),
          };
        }

        // Sorting by latestPrice (computed)
        const sortStage = {};
        if (sort === "asc") sortStage["latestPrice"] = 1;
        else if (sort === "desc") sortStage["latestPrice"] = -1;

        const pipeline = [
          { $match: match },
          {
            // Get the last element of prices array
            $addFields: {
              latestPriceObj: { $arrayElemAt: ["$prices", -1] },
            },
          },
          {
            // Convert price string to double; fallback to 0 if empty or invalid
            $addFields: {
              latestPrice: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$latestPriceObj.price", ""] },
                      { $eq: ["$latestPriceObj.price", null] },
                    ],
                  },
                  0,
                  { $toDouble: "$latestPriceObj.price" },
                ],
              },
            },
          },
          ...(sort ? [{ $sort: sortStage }] : []),
          { $skip: skip },
          { $limit: limitNum },
          {
            // Project required fields including vendorEmail, vendorName, and status from root
            $project: {
              itemName: 1,
              marketName: 1,
              vendorName: 1,
              vendorEmail: 1,
              imageUrl: 1,
              latestPrice: 1,
              date: 1,
              status: 1,
            },
          },
        ];

        const products = await productCollection.aggregate(pipeline).toArray();
        const totalCount = await productCollection.countDocuments(match);

        res.send({
          data: products,
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        });
      } catch (err) {
        console.error("Error loading all products:", err);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // My Product : PUT API

    app.put("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedProduct = req.body;
        const result = await productCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedProduct }
        );

        res.send({ success: result.modifiedCount > 0 });
      } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // My Products : PATCH API

    app.patch("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status, rejectionReason } = req.body;

        const updateFields = { status };

        // Include rejectionReason only if it's provided
        if (rejectionReason) {
          updateFields.rejectionReason = rejectionReason;
        }

        const result = await productCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        res.send({ updated: result.modifiedCount > 0 });
      } catch (error) {
        console.error("Error updating product status:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Products : GET API based on ID

    app.get("/product/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const product = await productCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!product)
          return res.status(404).send({ message: "Product not found" });

        // Add latestPrice field same as before:
        const latestPriceObj = product.prices?.slice(-1)[0] || {};
        const latestPrice = latestPriceObj.price
          ? parseFloat(latestPriceObj.price) || 0
          : 0;

        res.send({ product: { ...product, latestPrice } });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Product :  GET API based on email

    app.get("/products", verifyFBToken, async (req, res) => {
      try {
        const userEmail = req.query.email;

        if (req.decoded.email !== userEmail) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const query = userEmail ? { vendorEmail: userEmail } : {};
        const options = { sort: { _id: -1 } };

        const products = await productCollection.find(query, options).toArray();
        res.send(products);
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // GET for Admin

    // Admin Product : GET API

    app.get("/admin/products", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const options = { sort: { _id: -1 } };
        const total = await productCollection.countDocuments();

        const products = await productCollection
          .find({}, options)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({ products, total });
      } catch (error) {
        console.error("Error fetching all products for admin:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Post Product : POST API

    app.post("/products", verifyFBToken, verifyVendor, async (req, res) => {
      try {
        const newProduct = req.body;
        const result = await productCollection.insertOne(newProduct);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error inserting the product", error);
        res.status(500).send({ message: "Faild to add Product" });
      }
    });

    // Delete API to delete Product

    app.delete("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await productCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        console.error("Error deleting Product: ", error);
        res.status(500).send({ message: "Failed to delete parcel" });
      }
    });

    // Record payment

    app.post("/payments", async (req, res) => {
      try {
        const {
          productId,
          email,
          amount,
          paymentMethod,
          transactionId,
          quantity,
          productName,
          marketName,
          price,
        } = req.body;

        // if(!productId || !email || !amount){
        //   return res.status(400).send({ message: "Please fill all fields" });
        // }

        const paymentDoc = {
          productId,
          productName,
          marketName,
          price,
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at_string: new Date().toISOString(),
          paid_at: new Date(),
          quantity,
        };

        const paymentResult = await paymentsCollection.insertOne(paymentDoc);
        res.status(201).send({
          message: "Payment recorded",
          insertedId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error("Payment Failded", error);
      }
    });

    // GET API

    app.get("/payments", async (req, res) => {
      try {
        const userEmail = req.query.email;

        const query = userEmail ? { email: userEmail } : {};
        const options = { sort: { paid_at: -1 } };

        const payments = await paymentsCollection
          .find(query, options)
          .toArray();
        res.send(payments);
      } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({ message: "Failed to get payments" });
      }
    });

    // Payment API

    app.post("/create-payment-intent", async (req, res) => {
      const amountInCents = req.body.amountInCents;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE: Remove from Watchlist
    app.delete("/watchlist/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await watchlistCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        console.error("Error deleting watchlist item:", err);
        res.status(500).send({ error: "Failed to delete from watchlist" });
      }
    });

    // POST: Add to Watchlist

    app.post("/watchlist", async (req, res) => {
      try {
        const watchList = req.body;
        const result = await watchlistCollection.insertOne(watchList);
        res.status(201).send(result);
      } catch (err) {
        console.error("Error adding to watchlist:", err);
        res.status(500).send({ error: "Failed to add to watchlist" });
      }
    });

    // GET: Fetch Watchlist by User Email
    app.get("/watchlist", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: "Missing email" });

      try {
        const items = await watchlistCollection
          .find({ userEmail: email })
          .toArray();
        res.send(items);
      } catch (err) {
        console.error("Error fetching watchlist:", err);
        res.status(500).send({ error: "Failed to load watchlist" });
      }
    });

    app.get("/dashboard/user/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // Recent orders
        const recentOrders = await paymentsCollection
          .aggregate([
            { $match: { email } },
            { $sort: { paid_at: -1 } },
            { $limit: 5 },
            {
              $project: {
                productName: 1,
                marketName: 1,
                price: 1,
                quantity: 1,
                paid_at: 1,
                totalAmount: { $multiply: ["$price", "$quantity"] },
              },
            },
          ])
          .toArray();

        // Watchlist with latest product price
        const watchlist = await watchlistCollection
          .aggregate([
            { $match: { userEmail: email } },
            {
              $lookup: {
                from: "products",
                localField: "productId",
                foreignField: "_id",
                as: "productDetails",
              },
            },
            { $unwind: "$productDetails" },
            {
              $project: {
                productName: "$productDetails.productName",
                currentPrice: "$productDetails.price",
                marketName: "$productDetails.marketName",
              },
            },
          ])
          .toArray();

        res.json({ recentOrders, watchlist });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch user dashboard data" });
      }
    });

    // --- Vendor Dashboard API ---
    app.get("/dashboard/vendor/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // Total products and out-of-stock count
        const productStats = await productCollection
          .aggregate([
            { $match: { userEmail: email } },
            {
              $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                outOfStock: { $sum: { $cond: [{ $eq: ["$stock", 0] }, 1, 0] } },
              },
            },
          ])
          .toArray();

        // Recent 3 products
        const recentProducts = await productCollection
          .find({ userEmail: email })
          .sort({ date: -1 })
          .limit(3)
          .toArray();

        res.json({
          totalProducts: productStats[0]?.totalProducts || 0,
          outOfStock: productStats[0]?.outOfStock || 0,
          recentProducts,
        });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ error: "Failed to fetch vendor dashboard data" });
      }
    });

    // --- Admin Dashboard API ---
    app.get("/dashboard/admin/stats", async (req, res) => {
      try {
        // Users grouped by role
        const userRoles = await usersCollection
          .aggregate([
            {
              $group: {
                _id: "$role",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray();

        // Count pending advertisements
        const pendingAdsCount = await adCollection.countDocuments({
          status: "pending",
        });

        // Total products
        const totalProducts = await productCollection.countDocuments();

        // Total reports (assuming reviews collection are reports)
        const totalReports = await reviewsCollection.countDocuments();

        res.json({
          userRoles,
          pendingAdsCount,
          totalProducts,
          totalReports,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch admin dashboard data" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Product Server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
