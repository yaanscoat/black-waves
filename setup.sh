#!/bin/bash
# Blackwaves server setup for Debian/Ubuntu.
# Usage: CADDY_EMAIL=you@example.com sh setup.sh

info() {
  printf "\033[1;36m[INFO]\033[0m %s\n" "$1"
}

success() {
  printf "\033[1;32m[SUCCESS]\033[0m %s\n" "$1"
}

error() {
  printf "\033[1;31m[ERROR]\033[0m %s\n" "$1"
}

highlight() {
  printf "\033[1;37m%s\033[0m\n" "$1"
}

separator() {
  printf "\033[1;30m---------------------------------------------\033[0m\n"
}

clear

highlight "  ~~~  ~~~  ~~~  ~~~  ~~~  ~~~  ~~~  ~~~"
highlight "   b l a c k w a v e s"
highlight "  ~~~  ~~~  ~~~  ~~~  ~~~  ~~~  ~~~  ~~~"

separator
info "Starting the setup process..."
separator

if [ -z "$CADDY_EMAIL" ]; then
  printf "Email for HTTPS certificates (Let's Encrypt): "
  read -r CADDY_EMAIL
fi
if [ -z "$CADDY_EMAIL" ]; then
  error "An email is required for HTTPS certificates. Re-run with CADDY_EMAIL=you@example.com."
  exit 1
fi

info "Checking if Node.js and npm are installed..."
if ! command -v node > /dev/null 2>&1; then
  info "Node.js not found. Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - > /dev/null 2>&1
  sudo apt install -y nodejs > /dev/null 2>&1
  success "Node.js installed."
else
  success "Node.js $(node -v) is already installed."
fi
separator

info "Checking if Caddy is installed..."
if ! command -v caddy > /dev/null 2>&1; then
  info "Caddy not found. Installing..."
  sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https > /dev/null 2>&1
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg > /dev/null 2>&1
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/deb.debian.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt update -y > /dev/null 2>&1
  sudo apt install -y caddy > /dev/null 2>&1
  success "Caddy installed successfully."
else
  success "Caddy is already installed."
fi
separator

info "Creating Caddyfile..."
cat <<EOF | sudo tee /etc/caddy/Caddyfile > /dev/null
{
    email $CADDY_EMAIL
}

:443 {
    tls {
        on_demand
    }

    reverse_proxy http://localhost:3000
    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
    }
}
EOF
separator

info "Testing Caddy configuration..."
if sudo caddy validate --config /etc/caddy/Caddyfile > /dev/null 2>&1; then
  success "Caddyfile is valid."
else
  error "Caddyfile test failed. Exiting."
  exit 1
fi

info "Starting Caddy..."
if ! sudo systemctl restart caddy > /dev/null 2>&1; then
  error "Failed to start Caddy."
  exit 1
fi
success "Caddy started."
separator

info "Checking if PM2 is installed..."
if command -v pm2 > /dev/null 2>&1; then
  success "PM2 is already installed."
else
  info "PM2 not found. Installing..."
  if sudo npm install -g pm2 > /dev/null 2>&1; then
    success "PM2 installed successfully."
  else
    error "Failed to install PM2."
    exit 1
  fi
fi
separator

info "Installing dependencies..."
npm install > /dev/null 2>&1
success "Dependencies installed."
separator

info "Starting the server with PM2..."
pm2 start index.mjs --name blackwaves > /dev/null 2>&1
pm2 save > /dev/null 2>&1
success "Server started and saved with PM2."
separator

info "Setting up Git auto-update (checks every minute)..."
nohup bash -c "
while true; do
    git fetch origin > /dev/null 2>&1
    LOCAL=\$(git rev-parse main)
    REMOTE=\$(git rev-parse origin/main)

    if [ \$LOCAL != \$REMOTE ]; then
        git pull origin main > /dev/null 2>&1
        npm install > /dev/null 2>&1
        pm2 restart blackwaves > /dev/null 2>&1
        pm2 save > /dev/null 2>&1
    fi
    sleep 60
done
" > /dev/null 2>&1 &
success "Git auto-update setup completed."
separator

success "Setup completed. Point your domain's A record at this server and visit it over HTTPS."
separator
