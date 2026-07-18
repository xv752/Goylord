# Stress Testing

k6-based WebSocket load tests for the Goylord server.

**Version:** 0.0.4

## Directory Layout

```
stress/
├── ws-soak.js                       # Ramping VU soak test (up to 2000 VUs)
├── ws-soak-50k.js                   # 50,000 VU soak test variant
├── ws-flood-10k.js                  # 10,000 connection flood test
├── soak_runner.sh                   # Shell runner for soak tests
└── flood-10k-runner.bat             # Batch runner for flood test
```

## Test Descriptions

### Soak Test (`ws-soak.js`)
- Gradually ramps up virtual users to 2000
- Each VU sends `hello` message + periodic `ping` heartbeats
- Tests server stability under sustained load

### Soak Test 50k (`ws-soak-50k.js`)
- Heavy soak test targeting 50,000 concurrent connections
- Stress tests WebSocket handling and memory usage
- Expected bottleneck: SQLite single-writer, ~1K-5K clients

### Flood Test (`ws-flood-10k.js`)
- Instant 10,000 connection flood
- Tests server behavior under sudden load spikes

## Running

```bash
# Soak test
./stress/soak_runner.sh

# Flood test
stress/flood-10k-runner.bat    # Windows

# Or directly with k6
k6 run stress/ws-soak.js
k6 run stress/ws-flood-10k.js
```

## Scalability Notes

- SQLite single-writer with all client state in-memory `Map<string, ClientInfo>`
- ~100+ in-memory maps in `main-server.ts`
- WebSocket relay is O(viewers) per frame
- RAM stored as text like `"16 GB"` in DB — SQL filter: `CAST(REPLACE(REPLACE(LOWER(...), ' gb', ''), ' mb', '') AS REAL)`
- Hardware filter uses distinct values from DB for CPU/GPU dropdowns
