#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 v2.0.5"
    exit 1
fi

VERSION="$1"
# Strip 'v' prefix if present for package.json
VERSION_NUM="${VERSION#v}"

echo "Bumping version to $VERSION_NUM..."

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Update package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION_NUM\"/" package.json
echo "✓ Updated package.json"

# Update package-lock.json
npm install --package-lock-only --silent
echo "✓ Updated package-lock.json"

# Update AUR PKGBUILDs
for file in aur/PKGBUILD aur/PKGBUILD-source nikode-aur/PKGBUILD nikode-bin/PKGBUILD; do
    if [ -f "$file" ]; then
        sed -i "s/^pkgver=.*/pkgver=$VERSION_NUM/" "$file"
        echo "✓ Updated $file"
    fi
done

# Update .SRCINFO files
for file in aur/.SRCINFO nikode-aur/.SRCINFO nikode-bin/.SRCINFO; do
    if [ -f "$file" ]; then
        sed -i "s/pkgver = .*/pkgver = $VERSION_NUM/" "$file"
        sed -i "s/$VERSION_NUM\.tar\.gz/$VERSION_NUM.tar.gz/g" "$file"
        sed -i "s/v[0-9]\+\.[0-9]\+\.[0-9]\+/v$VERSION_NUM/g" "$file"
        sed -i "s/Nikode-[0-9]\+\.[0-9]\+\.[0-9]\+/Nikode-$VERSION_NUM/g" "$file"
        sed -i "s/nikode-bin-[0-9]\+\.[0-9]\+\.[0-9]\+/nikode-bin-$VERSION_NUM/g" "$file"
        sed -i "s/nikode-[0-9]\+\.[0-9]\+\.[0-9]\+\.tar/nikode-$VERSION_NUM.tar/g" "$file"
        echo "✓ Updated $file"
    fi
done

# Commit submodules first
for submodule in nikode-aur nikode-bin; do
    if [ -d "$submodule" ] && [ -d "$submodule/.git" ]; then
        cd "$submodule"
        if [ -n "$(git status --porcelain)" ]; then
            git add -A
            git commit -m "Version bump to $VERSION_NUM"
            echo "✓ Committed $submodule"
        fi
        cd "$PROJECT_ROOT"
    fi
done

# Commit main repo
git add package.json package-lock.json aur/ nikode-aur nikode-bin
git commit -m "Version bump to $VERSION_NUM"
echo "✓ Committed main repo"

# Create tag
git tag "v$VERSION_NUM"
echo "✓ Created tag v$VERSION_NUM"

echo ""
echo "Version $VERSION_NUM ready!"
echo ""

# Ask to push main repo and tag
read -p "Push main repo and tag v$VERSION_NUM to origin? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin main
    git push origin "v$VERSION_NUM"
    echo "✓ Pushed main repo and tag"
fi

# Ask to push submodules
read -p "Push AUR submodules to origin? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd "$PROJECT_ROOT/nikode-aur"
    git push origin master
    echo "✓ Pushed nikode-aur"

    sleep 2

    cd "$PROJECT_ROOT/nikode-bin"
    git push origin master
    echo "✓ Pushed nikode-bin"

    cd "$PROJECT_ROOT"
fi

echo ""
echo "Done!"
