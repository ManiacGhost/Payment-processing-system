# Cloudflare Pages Deployment Guide

## Prerequisites
- A Cloudflare account
- Git repository connected to your Cloudflare account

## Deployment Steps

### 1. Connect Your Repository
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** > **Create application** > **Pages**
3. Connect to your Git provider (GitHub, GitLab, or Bitbucket)
4. Select your repository

### 2. Configure Build Settings

Use the following build configuration:

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** `client`

### 3. Environment Variables

Add the following environment variable in Cloudflare Pages settings:

| Variable Name | Value |
|--------------|-------|
| `VITE_API_BASE_URL` | `https://payment-processing-system-backend.onrender.com/api` |

> **Note:** Environment variables are set in your project's **Settings** > **Environment Variables** section.

### 4. Deploy

Click **Save and Deploy**. Cloudflare Pages will:
- Install dependencies
- Build your application
- Deploy to a global CDN

### 5. Custom Domain (Optional)

After deployment, you can add a custom domain:
1. Go to your project settings
2. Click **Custom domains**
3. Add your domain and configure DNS as instructed

## Local Development

### Install Dependencies
```bash
cd client
npm install
```

### Run Development Server
```bash
npm run dev
```

The development server will run on `http://localhost:5173` and proxy API requests to `localhost:3001`.

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Environment Configuration

The application uses environment-specific `.env` files:

- `.env.development` - Used during `npm run dev`
- `.env.production` - Used during `npm run build`
- `.env.example` - Template for environment variables

**Backend API URL:**
- Development: Uses Vite proxy (`/api` → `http://localhost:3001`)
- Production: Points directly to Render backend

## Troubleshooting

### CORS Issues
If you encounter CORS errors, ensure your backend (Render) has the correct CORS configuration allowing requests from your Cloudflare Pages domain.

### API Connection Failed
1. Verify the `VITE_API_BASE_URL` environment variable in Cloudflare Pages settings
2. Ensure the backend URL is correct and accessible
3. Check browser console for specific error messages

### Build Failures
1. Check build logs in Cloudflare Pages dashboard
2. Verify all dependencies are listed in `package.json`
3. Ensure TypeScript compilation succeeds locally first

## Production URLs

- **Backend API:** https://payment-processing-system-backend.onrender.com
- **Frontend:** Will be provided by Cloudflare after deployment
  - Format: `https://[project-name].pages.dev`
  - Custom domain can be configured after deployment
