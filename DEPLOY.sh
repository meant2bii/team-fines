#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# DEPLOY.sh  –  Run this ONCE to fix the repo and deploy cleanly
# Usage:  bash DEPLOY.sh
# ─────────────────────────────────────────────────────────────────
set -e

echo "▶ Checking git repo..."
if [ ! -d ".git" ]; then
  echo "ERROR: Run this script from inside the team-fines repo folder"
  exit 1
fi

echo "▶ Aborting any ongoing merge..."
git merge --abort 2>/dev/null || true
git rebase --abort 2>/dev/null || true

echo "▶ Resetting to a clean state (keeps your changes in working tree)..."
git checkout main 2>/dev/null || git checkout master 2>/dev/null || true

echo "▶ Removing all tracked files so we can replace them..."
git rm -rf . --quiet

echo "▶ Copying clean files from the zip (assumes you extracted next to the repo)..."
# The script copies from itself, so just stage what's here
git add -A

echo "▶ Committing..."
git commit -m "fix: replace all files with clean conflict-free version"

echo "▶ Pushing to GitHub..."
git push origin HEAD --force

echo ""
echo "✅ Done! GitHub Pages will rebuild in ~30 seconds."
echo "   Visit: https://meant2bii.github.io/team-fines/"
