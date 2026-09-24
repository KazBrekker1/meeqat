# syntax=docker/dockerfile:1

FROM golang:1.27 AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /together . && \
    mkdir -p /pb_data

FROM gcr.io/distroless/static:nonroot

COPY --from=build /together /together
# Distroless has no shell to `mkdir`/`chown` at runtime, and an anonymous
# volume mounted over an empty path defaults to root-owned - which the
# nonroot user can't write to. Priming /pb_data here (owned by nonroot)
# means Docker seeds a freshly created volume with the same ownership.
COPY --from=build --chown=nonroot:nonroot /pb_data /pb_data

VOLUME /pb_data
EXPOSE 8090

# PocketBase applies any pending registered migrations automatically on
# `serve`, so there is no separate migrate step here. --dev=false keeps the
# container quiet (no per-query SQL logging) in production.
CMD ["/together", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data", "--dev=false"]
