# Build Goylord agent binaries for multiple OS/architectures
FROM golang:1.26-bookworm AS builder

WORKDIR /src/Goylord-Client

# Disable CGO to keep builds fully static and portable
ENV CGO_ENABLED=0

# Pre-fetch modules for faster incremental builds
COPY Goylord-Client/go.mod Goylord-Client/go.sum ./
RUN go mod download

# Bring in the full source
COPY Goylord-Client/ ./

# Default build matrix and output path (override via environment)
ENV TARGETS="windows/amd64 windows/386 windows/arm64 linux/amd64 linux/arm64 linux/arm/v7 darwin/amd64 darwin/arm64"
ENV OUT_DIR=/out

