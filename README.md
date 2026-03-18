# Crypto Grid Bot Calculator

AI-powered grid bot configurator for Pionex & Webot. Supports Claude, Gemini, Grok, and OpenAI.

---

## Deploy to Vercel (Step-by-Step)

### Step 1 — Create a GitHub repo

1. Go to github.com → click **New repository**
2. Name it `crypto-grid-bot`
3. Set to **Private**
4. Click **Create repository**

### Step 2 — Push this code to GitHub

Open your terminal and run these commands one at a time:

```bash
cd path/to/crypto-grid-bot       # navigate to this folder
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/crypto-grid-bot.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 3 — Deploy on Vercel

1. Go to **vercel.com** and sign in with GitHub
2. Click **Add New → Project**
3. Find `crypto-grid-bot` and click **Import**
4. Leave all settings as default
5. Click **Deploy**

Vercel will build and deploy automatically. You'll get a URL like `crypto-grid-bot.vercel.app`.

### Step 4 — Add your API keys

1. In Vercel, go to your project → **Settings → Environment Variables**
2. Add at least ONE of these (you only need the ones you want to use):

| Variable Name | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GEMINI_API_KEY` | aistudio.google.com/app/apikey |
| `GROK_API_KEY` | console.x.ai |
| `OPENAI_API_KEY` | platform.openai.com/api-keys |

3. After adding keys, go to **Deployments → click the 3 dots → Redeploy**

---

## Making Changes

Whenever you want to update the app:

1. Come back to Claude and describe what you want changed
2. Claude edits the files
3. You replace the files in your local folder
4. Run:
```bash
git add .
git commit -m "Update description"
git push
```
5. Vercel auto-deploys in ~30 seconds

---

## Estimated API Costs

| Action | API Calls | Est. Cost |
|---|---|---|
| Generate Config | 2 | ~$0.04 |
| Goal Finder | 2 | ~$0.06 |
| Allocator | 1 | ~$0.02 |

$10 credit = ~200 full runs. Claude Sonnet is the default — switch to Gemini (free tier) to reduce costs further.

---

## Project Structure

```
crypto-grid-bot/
├── app/
│   ├── page.tsx          ← Main UI (edit this for visual changes)
│   ├── layout.tsx        ← App wrapper + fonts
│   ├── globals.css       ← Global styles
│   └── api/ai/
│       └── route.ts      ← Server-side AI proxy (all providers)
├── lib/
│   └── prompts.ts        ← All AI prompts (edit for behavior changes)
├── .env.local.example    ← Copy to .env.local for local dev
├── package.json
└── README.md
```

## Local Development

```bash
npm install
cp .env.local.example .env.local
# Fill in at least one API key in .env.local
npm run dev
# Open http://localhost:3000
```
