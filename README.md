

---

```md
# Public Infrastructure Reporting System — Backend API

Backend API for the **Public Infrastructure Reporting System**, supporting:
- User authentication via **Firebase Admin**
- Role & profile management
- Issue reporting (CRUD)
- Image support
- Premium subscription using **Stripe Checkout**
- Usage limits for free users
- Secure endpoints via JWT (Firebase ID Token)
- MongoDB persistence

This README provides setup instructions, API details, environment configuration, and development workflow.

---

## 📌 Features

### 🔐 Authentication
- Firebase Authentication on frontend  
- Backend verifies ID Token using **Firebase Admin SDK**

### 👤 User Management
- Create/update user profile  
- Track user subscription status (`isPremium`)  
- Track issue report count & daily limit  

### 📝 Issue Reporting
- Create issue with title, description, category, images  
- View all issues or issues by user  
- Sort & filter by query parameters  
- Issue details endpoint  

### 💳 Premium Subscription (Stripe)
- Create Stripe Checkout Session  
- Verify completed payment  
- Update user’s `isPremium` status in MongoDB  
- Limit issue creation for free users  

### 🗄 Database
- MongoDB Atlas  
- Collections: `users`, `issues`, `payments`

---

# 📁 Project Structure

```

backend/
├── src/
│   ├── config/
│   │   ├── firebase.js       # Firebase Admin setup
│   │   ├── db.js             # MongoDB connection
│   │   └── stripe.js         # Stripe setup
│   ├── middleware/
│   │   └── verifyToken.js    # Auth middleware
│   ├── routes/
│   │   ├── users.js          # User endpoints
│   │   ├── issues.js         # Issue endpoints
│   │   └── payments.js       # Stripe endpoints
│   ├── models/
│   │   ├── User.js
│   │   └── Issue.js
│   ├── utils/
│   │   └── upload.js         # Image upload helpers (if using)
│   └── app.js                # Express initialization
├── .env
├── package.json
└── README.md

````

---

# ⚙️ Environment Variables

Create a `.env` file:

```env
# Server
PORT=5000
CLIENT_URL=http://localhost:5173

# MongoDB
MONGODB_URI=mongodb+srv://...

# Firebase Admin
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # optional if using webhooks

# Subscription config
FREE_USER_LIMIT=3
````

⚠️ **Never expose private keys to GitHub.**
⚠️ Firebase Private Key must include newline escapes (`\n`).

---

# 🚀 Installation & Run (Development)

### 1️⃣ Install dependencies

```bash
npm install
```

### 2️⃣ Start development server

```bash
npm run dev
```

### 3️⃣ Server runs at:

```
http://localhost:5000
```

---

# 🔐 Authentication Flow

1. Frontend obtains Firebase ID Token from Firebase Auth
2. Frontend sends token in every request:

   ```
   Authorization: Bearer <token>
   ```
3. Backend verifies token:

   ```js
   admin.auth().verifyIdToken(token)
   ```
4. Identifies user by UID or email
5. Allows access to protected routes

---

# 🔑 Middleware: verifyToken

All protected routes use:

```js
Authorization: Bearer <Firebase ID Token>
```

Example route usage:

```js
router.get("/me", verifyToken, async (req, res) => {
  res.json(req.user);
});
```

---

# 🧠 User Endpoints

| Method | Endpoint                | Description                           |
| ------ | ----------------------- | ------------------------------------- |
| GET    | `/users/me`             | Get logged-in user profile            |
| POST   | `/users`                | Create/update profile                 |
| GET    | `/users/me/issue-count` | Returns `{ count, limit, isPremium }` |

### `/users/me/issue-count` Response Example:

```json
{
  "count": 2,
  "limit": 3,
  "isPremium": false
}
```

---

# 📝 Issue Endpoints

| Method | Endpoint      | Description                |
| ------ | ------------- | -------------------------- |
| POST   | `/issues`     | Create an issue            |
| GET    | `/issues`     | List issues (with filters) |
| GET    | `/issues/:id` | Get issue details          |

### Issue object example

```json
{
  "_id": "674ab12c",
  "title": "Street light not working",
  "description": "...",
  "images": ["url1", "url2"],
  "category": "Electrical",
  "status": "Pending",
  "createdBy": "user@gmail.com",
  "createdAt": "2024-01-05T00:00:00Z"
}
```

---

# ⭐ Premium Subscription (Stripe)

## 1️⃣ Create Checkout Session

**POST** `/create-checkout-session`

Response:

```json
{
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

Frontend redirects user to Stripe Checkout.

---

## 2️⃣ Handle Success Redirect

Stripe sends user back:

```
/profile?session_id=cs_test_123
```

Frontend calls:

```
PATCH /payment-success?session_id=cs_test_123
```

Backend verifies session → updates DB:

```json
{ "success": true }
```

---

## 3️⃣ Backend Updates DB Example

```js
await users.updateOne(
  { email: user.email },
  { $set: { isPremium: true } }
);
```

---

# 🔒 Free User Limitation Logic

Backend checks before creating new issue:

```js
if (!user.isPremium && count >= FREE_USER_LIMIT) {
  return res.status(403).json({
    error: "Free limit reached. Please upgrade to premium."
  });
}
```

---

# 🛠 Deployment Notes

### Deployment Options

* **Render**
* **Railway**
* **Vercel Serverless Functions**
* **AWS Lambda**
* **DigitalOcean App Platform**

### CORS

Make sure `CLIENT_URL` is whitelisted:

```js
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
```

---

# 🧪 Testing the API

### Check auth:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:5000/users/me
```

### Create issue:

```bash
curl -X POST http://localhost:5000/issues \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test", "description":"Demo"}'
```

---

# 🐛 Troubleshooting

### ❗ Premium not showing on frontend?

* Ensure `/users/me` returns `"isPremium": true`
* Verify frontend includes Bearer token
* Check Stripe webhook/payment-success updated DB properly

### ❗ CORS errors?

* Check `CLIENT_URL` in `.env`
* Enable proper CORS configuration

### ❗ Firebase "invalid key format"?

Escape newlines in private key:

```
"-----BEGIN PRIVATE KEY-----\nLINE1\nLINE2\n-----END PRIVATE KEY-----\n"
```

---

# 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes with meaningful messages
4. Create a Pull Request

Coding Guidelines:

* Use async/await
* Keep controllers clean
* Use middleware for auth/validation
* Write modular routes

---

# 👤 Maintainer Info

**Md Jihanur Rahman**
📧 `mdjihanurrahman5@gmail.com`
🔗 LinkedIn: [https://www.linkedin.com/in/md-jihanur-rahman/](https://www.linkedin.com/in/md-jihanur-rahman/)

---

# 🎉 Thank You!

