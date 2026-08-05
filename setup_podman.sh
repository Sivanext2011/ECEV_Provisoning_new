#!/bin/bash
# Setup podman storage to use /tmp (local disk, not NFS)
mkdir -p ~/.config/containers
cat > ~/.config/containers/storage.conf << 'HEREDOC'
[storage]
driver = "overlay"
runroot = "/tmp/podman-run"
graphroot = "/tmp/podman-storage"
[storage.options.overlay]
mount_program = "/usr/bin/fuse-overlayfs"
HEREDOC

rm -rf /tmp/podman-run /tmp/podman-storage
rm -rf ~/.local/share/containers/storage
echo "Storage config:"
cat ~/.config/containers/storage.conf
echo ""
echo "Building backend..."
cd ~/ECEV_Provisoning_new/backend && podman build -t ecev-backend:v2 .
echo ""
echo "Building frontend..."
cd ~/ECEV_Provisoning_new/frontend && podman build -t ecev-frontend:v2 .
echo ""
echo "Images:"
podman images
