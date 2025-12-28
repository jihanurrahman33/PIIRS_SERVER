# PIIRS Server

A robust Node.js backend API for the **Public Infrastructure Reporting System** (PIIRS) — enabling citizens to report and track infrastructure issues with role-based access control, premium subscriptions, and real-time collaboration features.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0-13AA52?logo=mongodb&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Admin-FFCA28?logo=firebase&logoColor=white)

---

## 📖 Overview

PIIRS Server provides a secure, scalable API for managing infrastructure issue reports, user authentication, role-based permissions, and subscription-based features. It leverages Firebase for authentication, MongoDB for persistence, and Stripe for payment processing.

---

## ✨ Key Features

### 🔐 Authentication & Security
- **Firebase ID Token verification** for all protected endpoints
- JWT-based token validation via Firebase Admin SDK
- Role-based access control (Admin, Staff, User)
- Secure middleware authentication chain

### 👥 User Management
- User profile creation and updates
- Role assignment (admin, staff, user)
- Subscription status tracking (`isPremium`)
- Daily issue reporting limits
- User activity tracking

### 📝 Issue Reporting System
- Create, read, update, delete (CRUD) operations for issues
- Support for titles, descriptions, categories, and images
- Issue filtering by user, category, status, and date
- Priority and urgency assignment
- Real-time issue timeline tracking

### 💳 Premium Features
- **Stripe Checkout integration** for secure payments
- Premium subscription management
- Elevated usage limits for premium users
- Free tier with reporting caps
- Payment history tracking

### 🗄 Data Management
- **MongoDB Atlas** for reliable data persistence
- Collections: `users`, `issues`, `timelines`, `payments`
- Indexed queries for optimal performance

### 🚀 Deployment
- **Vercel serverless deployment** ready
- Automatic CORS handling
- Environment-based configuration

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js |
| **Framework** | Express 5.2 |
| **Database** | MongoDB 7.0 |
| **Authentication** | Firebase Admin SDK 13.6 |
| **Payments** | Stripe 20.0 |
| **Deployment** | Vercel |
| **Development** | Nodemon 3.1 |

---

## 📋 Prerequisites

- Node.js 18+ (v20+ recommended)
- npm or yarn
- MongoDB Atlas account & connection string
- Firebase project & Admin SDK credentials
- Stripe API keys
- Vercel account (for deployment)

---

## ⚙️ Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd PIIRS_SERVER
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>
FB_SERVICE_KEY=<base64-encoded-firebase-service-account>
STRIPE_SECRET_KEY=sk_test_xxxxx
```

**Environment Variables:**
- `PORT` — Server port (default: 3000)
- `MONGODB_URI` — MongoDB connection string
- `FB_SERVICE_KEY` — Base64-encoded Firebase service account JSON
- `STRIPE_SECRET_KEY` — Stripe secret API key

### 4. Firebase Setup
1. Generate Firebase service account from Firebase Console
2. Encode to base64:
```bash
node encode.js  # Outputs base64-encoded service key
```
3. Set `FB_SERVICE_KEY` in `.env`

### 5. Run the Server
**Development:**
```bash
npm run dev
```

**Production:**
```bash
node index.js
```

Server runs on `http://localhost:3000`

---

## 🔌 API Endpoints

### Authentication
All protected endpoints require `Authorization: Bearer <firebase-id-token>` header.

### User Endpoints
- `POST /users` — Create user profile
- `GET /users/<uid>` — Get user details
- `PATCH /users/<uid>` — Update user profile
- `GET /users` — List all users (admin only)

### Issue Endpoints
- `POST /issues` — Create new issue (authenticated)
- `GET /issues` — List all issues (with filters)
- `GET /issues/<id>` — Get issue details
- `PUT /issues/<id>` — Update issue (owner or admin)
- `DELETE /issues/<id>` — Delete issue (owner or admin)
- `GET /issues/user/<uid>` — Get user's issues

### Payment Endpoints
- `POST /create-checkout-session` — Initialize Stripe payment
- `POST /verify-payment` — Confirm payment completion
- `GET /payment-history/<uid>` — View payment history

### Timeline Endpoints
- `POST /timelines` — Create issue timeline entry
- `GET /timelines/<issue-id>` — Get issue timeline

---

## 🏗 Project Structure

```
PIIRS_SERVER/
├── index.js              # Main application & API endpoints
├── encode.js             # Firebase service key encoding utility
├── package.json          # Dependencies & scripts
├── vercel.json           # Vercel deployment config
├── .env                  # Environment variables (not in git)
└── README.md             # This file
```

---

## 🔐 Middleware

### `verifyFBToken`
Validates Firebase ID tokens from request headers.
```javascript
// Usage: app.get("/protected-route", verifyFBToken, handler)
```

### `verifyAdmin` & `verifyStaff`
Role-based access control for administrative operations.

---

## 📦 Database Schema

### Users Collection
```json
{
  "_id": ObjectId,
  "email": "user@example.com",
  "uid": "firebase-uid",
  "role": "user|admin|staff",
  "isPremium": boolean,
  "issueCount": number,
  "dailyLimit": number,
  "createdAt": ISODate
}
```

### Issues Collection
```json
{
  "_id": ObjectId,
  "title": "string",
  "description": "string",
  "category": "string",
  "images": ["url1", "url2"],
  "authorEmail": "user@example.com",
  "status": "open|in-review|resolved",
  "priority": "low|medium|high",
  "createdAt": ISODate,
  "updatedAt": ISODate
}
```

### Payments Collection
```json
{
  "_id": ObjectId,
  "email": "user@example.com",
  "amount": number,
  "currency": "usd",
  "status": "completed|pending|failed",
  "stripeSessionId": "string",
  "createdAt": ISODate
}
```

---

## 🚀 Deployment

### Vercel Deployment
The project is configured for Vercel serverless deployment via `vercel.json`.

**Deploy:**
```bash
vercel
```

**Environment Variables on Vercel:**
Set all `.env` variables in Vercel project settings before deploying.

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `CORS errors` | Verify client origin is allowed in CORS middleware |
| `Firebase auth fails` | Check `FB_SERVICE_KEY` is valid base64 and properly decoded |
| `MongoDB connection timeout` | Verify connection string and whitelist IP in MongoDB Atlas |
| `Stripe errors` | Ensure `STRIPE_SECRET_KEY` is correct and in test mode for development |

---

## 📝 Development Workflow

### Local Development
```bash
npm run dev  # Starts server with hot-reload via nodemon
```

### Running Tests
Currently, no automated tests are configured. Consider adding Jest or Mocha.

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "Add feature description"`
3. Push to branch: `git push origin feature/your-feature`
4. Open a Pull Request

---

## 📄 License

ISC

---

## 📞 Support

For issues or questions, please open an issue on the repository.

---

**Last Updated:** December 2025

