# Environment Variables Setup Guide

## Overview
This app now uses environment variables for configuration. This allows you to:
- Keep sensitive values out of your code
- Use different configurations for dev/staging/production
- Easily update values without changing code

## Local Development Setup

### Step 1: Create .env file
1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. The `.env` file is already in `.gitignore`, so it won't be committed to Git.

### Step 2: Update .env with your values
Open `.env` and verify/update the values:
```env
VITE_REGION=us-east-1
VITE_USER_POOL_ID=us-east-1_H0an9OqvV
VITE_USER_POOL_CLIENT_ID=3ra797d8odf24l9jlbuc6h04o0
VITE_IDENTITY_POOL_ID=us-east-1:6b3db9ae-94b3-40f1-b6f9-4527fdefcfeb
VITE_BUCKET_NAME=blog-media-assets
VITE_API_URL=https://ha7fh2cfyc.execute-api.us-east-1.amazonaws.com/dev
```

### Step 3: Restart your dev server
After creating/updating `.env`, restart your Vite dev server:
```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

**Note**: Vite requires the `VITE_` prefix for environment variables to be exposed to the client.

## AWS Amplify Setup

### Step 1: Go to Amplify Console
1. Open your app in AWS Amplify Console
2. Go to "App settings" → "Environment variables"

### Step 2: Add Environment Variables
Add each variable:

| Variable Name | Value |
|--------------|-------|
| `VITE_REGION` | `us-east-1` |
| `VITE_USER_POOL_ID` | `us-east-1_H0an9OqvV` |
| `VITE_USER_POOL_CLIENT_ID` | `3ra797d8odf24l9jlbuc6h04o0` |
| `VITE_IDENTITY_POOL_ID` | `us-east-1:6b3db9ae-94b3-40f1-b6f9-4527fdefcfeb` |
| `VITE_BUCKET_NAME` | `blog-media-assets` |
| `VITE_API_URL` | `https://ha7fh2cfyc.execute-api.us-east-1.amazonaws.com/dev` |

### Step 3: Redeploy
After adding variables, Amplify will automatically trigger a new build, or you can manually redeploy.

## How It Works

- **Local**: Reads from `.env` file (not committed to Git)
- **Production**: Reads from Amplify environment variables
- **Fallback**: If environment variable is missing, uses hardcoded default (for backward compatibility)

## Security Notes

✅ **DO:**
- Keep `.env` in `.gitignore` (already done)
- Use environment variables in production
- Share `.env.example` with team (safe to commit)

❌ **DON'T:**
- Commit `.env` to Git
- Share `.env` file publicly
- Hardcode sensitive values in code

## Troubleshooting

**Variables not working?**
1. Make sure they start with `VITE_` prefix
2. Restart dev server after creating/updating `.env`
3. Check browser console for errors
4. Verify variable names match exactly (case-sensitive)

**In Amplify:**
1. Variables must start with `VITE_`
2. Redeploy after adding variables
3. Check build logs for errors

