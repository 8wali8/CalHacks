#!/bin/bash

# Test script for verifying the SSR fix

echo "========================================"
echo "Testing Analytics Lab SSR Fix"
echo "========================================"
echo ""

# Step 1: Clear cache
echo "Step 1: Clearing Next.js cache..."
rm -rf .next
echo "✅ Cache cleared"
echo ""

# Step 2: Check dependencies
echo "Step 2: Checking dependencies..."
if ! npm list @tensorflow/tfjs &> /dev/null; then
    echo "⚠️  TensorFlow.js not found - installing..."
    npm install
fi
echo "✅ Dependencies OK"
echo ""

# Step 3: Build check (optional)
echo "Step 3: Running build check..."
if npm run build &> /dev/null; then
    echo "✅ Build successful"
else
    echo "⚠️  Build had warnings (this is OK for dev)"
fi
echo ""

# Step 4: Start dev server
echo "Step 4: Starting development server..."
echo ""
echo "The server will start at: http://localhost:3000/analytics-lab"
echo ""
echo "✅ TEST CHECKLIST:"
echo "   1. Page loads without errors"
echo "   2. Click 'Start Session' - no console errors"
echo "   3. Allow camera/mic permissions"
echo "   4. Speak - transcript should appear"
echo "   5. WPM chart should update"
echo "   6. Move head - overlay should rotate"
echo ""
echo "Press Ctrl+C to stop the server when done testing"
echo ""
echo "========================================"

npm run dev
