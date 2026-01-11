#!/bin/bash

set -e

echo "🧪 Testing pnpm-dep-grouper locally..."
echo ""

# Build the project
echo "📦 Building..."
npm run build
echo ""

# Go to example directory
cd example

echo "🧹 Resetting example packages..."
# Reset vue-app
cat > packages/vue-app/package.json << 'EOF'
{
  "name": "vue-app",
  "version": "1.0.0",
  "depGroups": [
    "vue",
    "vite",
    "testing"
  ],
  "dependencies": {
  },
  "devDependencies": {
  }
}
EOF

# Reset react-app (keep react-router-dom as custom dep)
cat > packages/react-app/package.json << 'EOF'
{
  "name": "react-app",
  "version": "1.0.0",
  "depGroups": [
    "react",
    "webpack"
  ],
  "dependencies": {
    "react-router-dom": "^6.20.0"
  },
  "devDependencies": {
  }
}
EOF

echo "✅ Reset complete"
echo ""

echo "🚀 Running generator..."
node ../dist/cli.js generate
echo ""

echo "📄 Vue app package.json:"
cat packages/vue-app/package.json
echo ""

echo "📄 React app package.json:"
cat packages/react-app/package.json
echo ""

echo "📦 Installing dependencies with pnpm..."
pnpm install
echo ""

echo "✅ Checking installed packages..."
echo "Vue packages:"
find node_modules/.pnpm -name "vue@*" -type d 2>/dev/null || echo "Not found"
echo ""
echo "React packages:"
find node_modules/.pnpm -name "react@*" -type d 2>/dev/null || echo "Not found"
echo ""
echo "Webpack packages:"
find node_modules/.pnpm -name "webpack@*" -type d 2>/dev/null || echo "Not found"
echo ""

echo "✅ Test complete! Check the output above."
echo ""
echo "To clean up: rm -rf example/node_modules example/pnpm-lock.yaml"
