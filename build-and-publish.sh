#!/bin/bash

echo "🚀 Building Nest-Scramble v2.1.1..."
npm run build

echo "📦 Publishing to npm..."
npm publish

echo "✅ Done!"
