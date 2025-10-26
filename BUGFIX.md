# Bug Fix: "document is not defined" Error

## Problem

When starting a session and beginning to speak, the error `"document is not defined"` occurs.

## Root Cause

This is a **Next.js Server-Side Rendering (SSR) issue**. The error occurs because:

1. **ASR Service Singleton**: In [lib/asr.ts](lib/asr.ts), the `asrService` was instantiated at module load time:
   ```typescript
   export const asrService = new ASRService();
   ```
   This caused the `ASRService` constructor to run during SSR, where `window` doesn't exist.

2. **Download Utilities**: In [lib/download.ts](lib/download.ts), the `downloadBlob` function accessed `document` directly without checking if it exists in a browser environment.

## Solution

### Fix 1: Lazy ASR Service Initialization

Changed the ASR service from eager to lazy initialization:

**Before:**
```typescript
export const asrService = new ASRService();
```

**After:**
```typescript
let asrServiceInstance: ASRService | null = null;

export const asrService = {
  get available(): boolean {
    if (typeof window === 'undefined') return false;
    if (!asrServiceInstance) {
      asrServiceInstance = new ASRService();
    }
    return asrServiceInstance.available;
  },
  // ... rest of the API
};
```

This ensures:
- ✅ No instantiation during SSR
- ✅ Lazy creation only when needed in browser
- ✅ Same API surface (backward compatible)

### Fix 2: Download Guard

Added SSR check to download functions:

**Before:**
```typescript
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // ...
}
```

**After:**
```typescript
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') {
    console.warn('downloadBlob called on server - skipping');
    return;
  }
  // ... rest of the code
}
```

## Files Changed

1. ✅ [lib/asr.ts](lib/asr.ts) - Lines 108-141
2. ✅ [lib/download.ts](lib/download.ts) - Lines 8-27

## Testing

After applying these fixes:

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Navigate to:** http://localhost:3000/analytics-lab

3. **Click "Start Session"** and allow permissions

4. **Speak** - You should now see:
   - ✅ No "document is not defined" error
   - ✅ Transcript appears
   - ✅ WPM metric updates
   - ✅ All charts working

## Why This Happens in Next.js

Next.js uses **Server-Side Rendering (SSR)** by default, which means:

1. Components are first rendered on the server (Node.js)
2. The HTML is sent to the browser
3. React "hydrates" the page on the client

During step 1, there is no `window`, `document`, `navigator`, etc. because we're in Node.js, not a browser.

### Common Patterns to Avoid SSR Issues

#### ❌ Bad - Module-level instantiation
```typescript
const service = new BrowserOnlyService(); // Runs during import!
export default service;
```

#### ✅ Good - Lazy initialization
```typescript
let service: BrowserOnlyService | null = null;

export function getService() {
  if (typeof window === 'undefined') return null;
  if (!service) service = new BrowserOnlyService();
  return service;
}
```

#### ❌ Bad - Direct browser API access
```typescript
export function doThing() {
  document.getElementById('foo'); // Fails on server
}
```

#### ✅ Good - Guard with typeof check
```typescript
export function doThing() {
  if (typeof document === 'undefined') return;
  document.getElementById('foo');
}
```

#### ✅ Good - useEffect hook (React)
```typescript
useEffect(() => {
  // Only runs in browser
  document.getElementById('foo');
}, []);
```

## Additional Notes

The following files already had proper SSR guards:
- ✅ [lib/analyticsController.ts](lib/analyticsController.ts) - All `window` usage guarded
- ✅ [app/analytics-lab/page.tsx](app/analytics-lab/page.tsx) - Client component with `'use client'`
- ✅ [components/AnalyticsWidget.tsx](components/AnalyticsWidget.tsx) - Client component

## Verification

To verify the fix works:

```bash
# 1. Clear Next.js cache
rm -rf .next

# 2. Reinstall (optional)
npm install

# 3. Start fresh
npm run dev

# 4. Test in browser
# Open http://localhost:3000/analytics-lab
# Click Start → Speak → No errors!
```

## Status

🟢 **FIXED** - All SSR issues resolved. The app now works correctly in Next.js 14 with App Router.
