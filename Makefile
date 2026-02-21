.PHONY: dev build build-pacman build-pacman-local build-pacman-stage install install-dev install-pacman install-pacman-local install-pacman-stage uninstall clean help

APP_NAME := nikode
DESKTOP_FILE := $(HOME)/.local/share/applications/$(APP_NAME).desktop
DESKTOP_FILE_DEV := $(HOME)/.local/share/applications/$(APP_NAME)-dev.desktop
INSTALL_DIR := $(HOME)/.local/share/$(APP_NAME)
BIN_LINK := $(HOME)/.local/bin/$(APP_NAME)
PROJECT_DIR := $(shell pwd)

# Run in development mode
dev:
	npm run electron:dev

# Build all production targets
build:
	npm run electron:build

# Build only pacman package
build-pacman:
	npx ng build --configuration production --base-href ./ && npx electron-builder --linux pacman

# Build pacman package for local (localhost)
build-pacman-local:
	npx ng build --configuration local --base-href ./ && npx electron-builder --linux pacman

# Build pacman package for stage
build-pacman-stage:
	npx ng build --configuration stage --base-href ./ && \
	echo '{"apiBaseUrl":"https://staging.nikode.dimitrije.dev/api/v1"}' > electron/build-config.json && \
	npx electron-builder --linux pacman && \
	rm -f electron/build-config.json

# Install development protocol handler (for npm run electron:dev)
install-dev:
	@echo "Installing development protocol handler..."
	@mkdir -p $(HOME)/.local/share/applications
	@echo '[Desktop Entry]' > $(DESKTOP_FILE_DEV)
	@echo 'Name=Nikode (Dev)' >> $(DESKTOP_FILE_DEV)
	@echo 'Exec=env NODE_ENV=development $(PROJECT_DIR)/node_modules/.bin/electron $(PROJECT_DIR) %u' >> $(DESKTOP_FILE_DEV)
	@echo 'Type=Application' >> $(DESKTOP_FILE_DEV)
	@echo 'Terminal=false' >> $(DESKTOP_FILE_DEV)
	@echo 'MimeType=x-scheme-handler/nikode;' >> $(DESKTOP_FILE_DEV)
	@echo 'NoDisplay=true' >> $(DESKTOP_FILE_DEV)
	@update-desktop-database $(HOME)/.local/share/applications/
	@xdg-mime default $(APP_NAME)-dev.desktop x-scheme-handler/nikode
	@echo "Development protocol handler installed."
	@echo "Restart your browser for changes to take effect."

# Install pacman package (stage)
install-pacman-stage: build-pacman-stage
	@echo "Installing Nikode (stage) via pacman..."
	@PKGFILE=$$(ls -t dist-electron/*.pacman 2>/dev/null | head -1); \
	if [ -n "$$PKGFILE" ]; then \
		sudo pacman -U "$$PKGFILE"; \
	else \
		echo "No pacman package found. Run 'make build-pacman-stage' first."; \
		exit 1; \
	fi

# Install pacman package
install-pacman: build-pacman
	@echo "Installing Nikode via pacman..."
	@PKGFILE=$$(ls -t dist-electron/*.pacman 2>/dev/null | head -1); \
	if [ -n "$$PKGFILE" ]; then \
		sudo pacman -U "$$PKGFILE"; \
	else \
		echo "No pacman package found. Run 'make build-pacman' first."; \
		exit 1; \
	fi

# Install pacman package (local/localhost)
install-pacman-local: build-pacman-local
	@echo "Installing Nikode (local) via pacman..."
	@PKGFILE=$$(ls -t dist-electron/*.pacman 2>/dev/null | head -1); \
	if [ -n "$$PKGFILE" ]; then \
		sudo pacman -U "$$PKGFILE"; \
	else \
		echo "No pacman package found. Run 'make build-pacman-local' first."; \
		exit 1; \
	fi

# Install production app from AppImage (requires FUSE)
install-appimage: build
	@echo "Installing Nikode AppImage..."
	@mkdir -p $(HOME)/.local/share/applications
	@mkdir -p $(HOME)/.local/bin
	@mkdir -p $(INSTALL_DIR)
	@APPIMAGE=$$(ls -t dist-electron/*.AppImage 2>/dev/null | head -1); \
	if [ -n "$$APPIMAGE" ]; then \
		cp "$$APPIMAGE" $(INSTALL_DIR)/$(APP_NAME).AppImage; \
		chmod +x $(INSTALL_DIR)/$(APP_NAME).AppImage; \
		ln -sf $(INSTALL_DIR)/$(APP_NAME).AppImage $(BIN_LINK); \
		echo "AppImage installed to $(INSTALL_DIR)"; \
	else \
		echo "No AppImage found. Run 'make build' first."; \
		exit 1; \
	fi
	@echo '[Desktop Entry]' > $(DESKTOP_FILE)
	@echo 'Name=Nikode' >> $(DESKTOP_FILE)
	@echo 'Comment=A modern API client for developers' >> $(DESKTOP_FILE)
	@echo 'Exec=$(INSTALL_DIR)/$(APP_NAME).AppImage %u' >> $(DESKTOP_FILE)
	@echo 'Type=Application' >> $(DESKTOP_FILE)
	@echo 'Terminal=false' >> $(DESKTOP_FILE)
	@echo 'Categories=Development;' >> $(DESKTOP_FILE)
	@echo 'MimeType=x-scheme-handler/nikode;' >> $(DESKTOP_FILE)
	@echo 'StartupWMClass=Nikode' >> $(DESKTOP_FILE)
	@update-desktop-database $(HOME)/.local/share/applications/
	@xdg-mime default $(APP_NAME).desktop x-scheme-handler/nikode
	@echo "Nikode installed successfully."
	@echo "Restart your browser for protocol handler to take effect."

# Uninstall pacman package
uninstall-pacman:
	sudo pacman -R nikode || true

# Uninstall AppImage
uninstall-appimage:
	@echo "Uninstalling Nikode AppImage..."
	@rm -f $(DESKTOP_FILE)
	@rm -f $(BIN_LINK)
	@rm -rf $(INSTALL_DIR)
	@update-desktop-database $(HOME)/.local/share/applications/ 2>/dev/null || true
	@echo "Nikode AppImage uninstalled."

# Uninstall dev handler
uninstall-dev:
	@rm -f $(DESKTOP_FILE_DEV)
	@update-desktop-database $(HOME)/.local/share/applications/ 2>/dev/null || true
	@echo "Dev protocol handler removed."

# Clean build artifacts
clean:
	rm -rf dist-electron
	rm -rf dist

# Show help
help:
	@echo "Nikode Makefile"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Run in development mode"
	@echo "  make install-dev    - Install protocol handler for dev mode"
	@echo "  make uninstall-dev  - Remove dev protocol handler"
	@echo ""
	@echo "Production (Arch Linux):"
	@echo "  make build-pacman   - Build pacman package"
	@echo "  make install-pacman - Build and install via pacman"
	@echo "  make uninstall-pacman - Remove pacman package"
	@echo ""
	@echo "Stage (Arch Linux):"
	@echo "  make build-pacman-stage   - Build pacman package (stage)"
	@echo "  make install-pacman-stage - Build and install via pacman (stage)"
	@echo ""
	@echo "Local (Arch Linux - localhost:8080):"
	@echo "  make build-pacman-local   - Build pacman package (localhost)"
	@echo "  make install-pacman-local - Build and install via pacman (localhost)"
	@echo ""
	@echo "Production (AppImage - requires FUSE):"
	@echo "  make build          - Build all targets (AppImage, deb, pacman)"
	@echo "  make install-appimage - Install AppImage locally"
	@echo "  make uninstall-appimage - Remove AppImage"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Remove build artifacts"
