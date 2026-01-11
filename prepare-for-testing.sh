#!/bin/bash

set -e

echo "📦 Preparing package for private testing..."
echo ""

# Run tests first
echo "🧪 Running tests..."
npm test
echo ""

# Build the project
echo "🔨 Building..."
npm run build
echo ""

# Create tarball
echo "📦 Creating tarball..."
npm pack
echo ""

TARBALL=$(ls -t pnpm-dep-grouper-*.tgz | head -1)

echo "✅ Package ready: $TARBALL"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Transfer this file to your work Mac:"
echo "   - Email: Attach $TARBALL"
echo "   - Slack: Upload $TARBALL"
echo "   - USB/Network drive: Copy $TARBALL"
echo ""
echo "2. On your work Mac, in your monorepo root:"
echo "   pnpm add -D /path/to/$TARBALL"
echo ""
echo "3. Create dep-groups.yaml at workspace root"
echo ""
echo "4. Add 'depGroups' to your package.json files"
echo ""
echo "5. Run:"
echo "   pnpm-dep-grouper generate"
echo "   pnpm install"
echo ""
echo "To test locally first, run:"
echo "   ./test-locally.sh"
