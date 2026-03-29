# habit. — Next.js + Firebase + PWA

A cross-device habit tracker. Data syncs via Firestore, installs as a PWA on any phone.

---

## Stack

- **Next.js 14** (App Router)
- **Firebase** (Auth + Firestore)
- **next-pwa** (service worker, offline support)
- **Vercel** (deployment)

---

## Setup Guide

### 1. Clone & install

```bash
git clone <your-repo-url>
cd habit-tracker
npm install
```

---

### 2. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `habit-tracker`
3. Disable Google Analytics (not needed) → **Create project**

#### Enable Authentication
1. Left sidebar → **Build → Authentication → Get started**
2. Click **Google** under Sign-in providers
3. Toggle **Enable**, add your support email → **Save**

#### Enable Firestore
1. Left sidebar → **Build → Firestore Database → Create database**
2. Choose **Start in production mode** → pick a region → **Enable**

#### Deploy security rules
The included `firestore.rules` file locks data per user.  
Either paste it in the Firestore **Rules** tab, or run:
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

#### Get your config keys
1. Project Overview → gear icon → **Project settings**
2. Scroll to **Your apps** → **Web** (</> icon) → Register app
3. Copy the `firebaseConfig` values

---

### 3. Set environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and paste your Firebase values:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=habit-tracker-xxxxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=habit-tracker-xxxxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=habit-tracker-xxxxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

### 4. Add PWA icons

Create a folder `public/icons/` and add:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

You can generate these at [realfavicongenerator.net](https://realfavicongenerator.net)  
or use any square image and resize it.

---

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

### 6. Deploy to Vercel

1. Push your project to GitHub (make sure `.env.local` is in `.gitignore` ✓)
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo
3. In **Environment Variables**, add all 6 `NEXT_PUBLIC_FIREBASE_*` keys
4. Click **Deploy**

> Vercel auto-deploys on every push to `main`.

---

### 7. Install as PWA on mobile

**iOS (Safari):**
1. Open your Vercel URL in Safari
2. Tap the Share button → **Add to Home Screen**
3. Tap **Add**

**Android (Chrome):**
1. Open your Vercel URL in Chrome
2. Tap the menu → **Add to Home screen**
3. Or wait for the install prompt

---

## Project Structure

```
habit-tracker/
├── app/
│   ├── layout.js          # Root layout + PWA meta tags
│   ├── page.js            # Auth gate → Login or HabitTracker
│   ├── globals.css        # Design tokens (CSS variables)
│   └── page.module.css    # Splash screen
├── components/
│   ├── HabitTracker.js    # Main app (full UI + logic)
│   ├── HabitTracker.module.css
│   ├── LoginScreen.js     # Google sign-in screen
│   └── LoginScreen.module.css
├── lib/
│   ├── firebase.js        # Firebase init
│   ├── AuthContext.js     # useAuth() hook + provider
│   └── db.js              # Firestore CRUD (replaces IndexedDB)
├── public/
│   ├── manifest.json      # PWA manifest
│   └── icons/             # Add your icons here
├── firestore.rules        # Security rules
├── next.config.js         # next-pwa config
└── .env.local.example     # Template for your keys
```

---

## How data is stored

```
Firestore
└── users/
    └── {uid}/
        ├── habits/
        │   └── {habitId}: { name, color, order }
        └── completions/
            └── {YYYY-MM-DD}: { habitIds: [...] }
```

Each user's data is completely isolated — the Firestore rules enforce this.

---

## Adding more users

Anyone who opens your Vercel URL can sign in with Google and get their own isolated habit data. No extra config needed — Firebase Auth handles it automatically.
