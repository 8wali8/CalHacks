# SSR "document is not defined" Fix Instructions

## Quick Diagnosis

To find exactly where the error is occurring:

1. **Check browser console** - Look for the full error stack trace
2. **Look for the file and line number** in the error message

## Common Causes

The error happens when browser-only code runs during server-side rendering. In your case, it's likely one of these:

1. ✅ **FIXED**: ASR service initialization - Already fixed with lazy loading
2. ✅ **FIXED**: Download functions - Already added guards
3. ❓ **POSSIBLE**: Chart.js initialization
4. ❓ **POSSIBLE**: TensorFlow.js or MediaPipe imports

## Step-by-Step Fix

### Step 1: Clear Cache and Rebuild

```bash
cd analytics-lab
rm -rf .next
npm run dev
```

### Step 2: Check the Browser Console

Open http://localhost:3000/analytics-lab in your browser and:
1. Open DevTools (F12 or Cmd+Option+I)
2. Check the Console tab
3. Find the error message - it should show something like:

```
ReferenceError: document is not defined
    at <file>:<line>:<column>
```

### Step 3: Dynamic Import Solution

If the error persists, we need to use dynamic imports for browser-only libraries.

**Option A: Dynamic Component Import**

Edit `app/analytics-lab/page.tsx` and change the imports:

```typescript
// Instead of:
import { LiveCharts } from '../../components/LiveCharts';

// Use:
import dynamic from 'next/dynamic';

const LiveCharts = dynamic(() => import('../../components/LiveCharts').then(mod => ({ default: mod.LiveCharts })), {
  ssr: false,
  loading: () => <div>Loading charts...</div>
});
```

**Option B: UseEffect Guard**

Wrap the initialization in useEffect:

```typescript
const [controller, setController] = useState<AnalyticsController | null>(null);

useEffect(() => {
  // Only runs in browser
  if (typeof window !== 'undefined') {
    setController(createAnalyticsController());
  }
}, []);
```

### Step 4: Specific Fixes

#### If error is in Chart.js:

Add to `components/LiveCharts.tsx`:

```typescript
'use client';

import dynamic from 'next/dynamic';

// Dynamically import Chart.js
if (typeof window !== 'undefined') {
  import('chart.js').then((ChartJS) => {
    ChartJS.Chart.register(
      ChartJS.CategoryScale,
      ChartJS.LinearScale,
      // ... rest of components
    );
  });
}
```

#### If error is in Face Worker:

The face worker uses dynamic import already, but ensure it's only created client-side.

#### If error is in Download functions:

Already fixed - but double-check [lib/download.ts](lib/download.ts) has the guard.

---

## Nuclear Option: Force Everything Client-Side

If you're still having issues, create a new file:

**analytics-lab/app/analytics-lab-client.tsx**

```typescript
'use client';

// All your imports here
import React, { useRef, useState, useEffect, useCallback } from 'react';
// ... etc

export default function AnalyticsLabClient() {
  // All your component code here - EXACTLY as it is now
}
```

**analytics-lab/app/analytics-lab/page.tsx**

```typescript
import dynamic from 'next/dynamic';

const AnalyticsLabClient = dynamic(() => import('../analytics-lab-client'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Loading Analytics Lab...</h1>
        <p className="text-gray-600">Initializing browser environment</p>
      </div>
    </div>
  ),
});

export default function AnalyticsLabPage() {
  return <AnalyticsLabClient />;
}
```

This **guarantees** nothing runs on the server.

---

## Test After Fix

1. Clear cache: `rm -rf .next`
2. Restart server: `npm run dev`
3. Open browser
4. Click "Start Session"
5. Speak - should work!

---

## If You Share the Error Message

If you can paste the **exact error message with stack trace** from your console, I can pinpoint the exact fix needed!

Look for something like:

```
ReferenceError: document is not defined
    at ASRService (webpack-internal:///(ssr)/./lib/asr.ts:26:15)
    at Module.<anonymous> (webpack-internal:///(ssr)/./lib/asr.ts:109:24)
    ...
```

This tells us the exact file and line causing the issue.
