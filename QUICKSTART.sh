#!/bin/bash

# Analytics Lab - Quick Start Script
# Run this to set up and test the application

set -e

echo "============================================"
echo "Analytics Lab - Quick Start"
echo "============================================"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "✓ npm found: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Dependencies installed!"
echo ""

# Start dev server
echo "🚀 Starting development server..."
echo ""
echo "   The app will open at:"
echo "   → http://localhost:3000/analytics-lab"
echo ""
echo "   Press Ctrl+C to stop the server"
echo ""
echo "============================================"
echo ""

npm run dev
