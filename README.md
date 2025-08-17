# 🛠️ Daily Price Tracker for Local Markets — Server

This is the backend server for the **Daily Price Tracker for Local Markets (কাঁচাবাজার)** project. It handles API requests, user authentication, data storage, and business logic for products, vendors, orders, and admin functions.

---

## 🚀 Features

- RESTful API built with **Express 5**
- JWT-based authentication & role-based authorization
- Firebase Admin SDK for user verification and secure auth management
- MongoDB for data storage and querying
- Secure environment variables management with dotenv
- Stripe payment processing integration
- CORS enabled for secure cross-origin requests

---

## 📦 Dependencies

1. cors  
2. dotenv  
3. express  
4. firebase-admin  
5. mongodb  
6. stripe  

---

## 🧰 Tech Stack

- **Node.js** & **Express 5**: API and server logic  
- **MongoDB**: NoSQL database for products, users, orders, and ads  
- **Firebase Admin SDK**: Authentication management and token verification  
- **Stripe**: Payment gateway integration  
- **dotenv**: Environment variable management  
- **cors**: Cross-origin resource sharing middleware  

---

## 📋 API Overview

- **Authentication**  
  - User registration & login (JWT token issuance)  
  - Google social login verification via Firebase  
- **Users**  
  - Role management (Admin, Vendor, User)  
  - Search and pagination  
- **Products**  
  - Create, update, approve, reject (with feedback), delete  
  - Vendor-specific product management  
- **Advertisements**  
  - Vendor ad submissions with approval workflow  
- **Orders**  
  - Store and manage user orders  
- **Offers** (Optional)  
  - Admin can post special market offers  
- **Middleware**  
  - Role-based access control  
  - Error handling & validation  
  - CORS configuration  

---

## ⚙️ Environment Variables

Create a `.env` file at the root with:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
FIREBASE_SERVICE_ACCOUNT_KEY=your_firebase_service_account_json_as_string
STRIPE_SECRET_KEY=your_stripe_secret_key
JWT_SECRET=your_jwt_secret_key
CORS_ORIGIN=https://your-client-domain.com

## Installation & Running Locally

git clone https://github.com/your-username/b12-a12-c21-server.git
cd b12-a12-c21-server
npm install
npm run start    # or 'node index.js' / 'nodemon index.js' depending on your setup
