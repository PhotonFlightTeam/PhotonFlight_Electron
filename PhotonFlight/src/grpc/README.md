# Electron main-process gRPC connection

`main.js` creates `CoreConnection` before starting the JVM. The supervisor selects
an IPv4 loopback port for each launch; the client uses that endpoint rather than
a fixed port. Both generated service clients share one gRPC channel.

The connection waits up to 30 seconds for the channel and `GetStatus` to report
`CORE_STATE_READY`. Individual handshake status calls have a two-second deadline.
Core must report API version `1` and a nonempty instance ID. The child process's
JSON readiness message is buffered across stdout chunks and checked against the
selected endpoint and RPC identity. That message verifies process ownership;
it does not select or discover the port. Unsupported versions, wrong identities,
and startup timeouts fail the handshake and close the channel. Restart Core to
retry a failed handshake.

Main-process callers can use:

```ts
connection.getProcessStatus();    // OS process, PID, generation, selected endpoint
connection.getConnectionStatus(); // Handshake state and verified identity/version
await connection.getCoreStatus(); // Fresh, deadline-bound GetStatus RPC
connection.getClients();          // Typed control/points clients, only when ready
```

Connection states are `disconnected`, `connecting`, `ready`, and `failed`. The
`status` event reports transitions; main logs readiness and handshake failures.
Core stop/exit/restart cancels pending handshakes, closes the old shared channel,
and clears its recorded identity. A late result from an old process generation
cannot mark a new session ready. `ready` records a successful handshake, not an
ongoing health monitor.

`core:get-status` and `window.electronAPI.core.getStatus()` retain their existing
process-status behavior. This step does not add renderer RPC channels, subscribe
to Core events, or change file import/rendering. Graceful Shutdown RPC integration
and the renderer bridge are subsequent steps; OS termination remains the current
supervisor stop mechanism.

## Contract and types

Runtime loading uses `application/application.proto` from the Electron app's
`proto` submodule. Forge copies only `proto/application` into packaged resources
as `resources/application`, without repository metadata. Core's distribution
and Java runtime packaging remain separate work.
The main-process Vite build keeps grpc-js and proto-loader external so their Node
dependencies and internal resource paths are preserved in the installed packages.

Run `npm run generate:core-types` from the Electron project after updating the
`proto` submodule. Generated files live in `generated/`; do not edit them manually.
`types/` provides compatibility exports pointing to the generated definitions.
The older duplicate draft in `src/css/grpc` is not used by the application.

Generation and runtime loading share these options: `keepCase`, `longs: String`,
`enums: String`, `defaults`, and `oneofs`. Output uint64 values stay decimal strings
to avoid JavaScript precision loss. Generated `__Output` types describe decoded
responses; input types accept protobuf defaults. Generated service clients retain
grpc-js's callback/stream interfaces; `CoreRpcClient.getStatus()` is a Promise
wrapper. Oneof fields are top-level message fields with a string discriminator,
not nested `{ kind, ... }` objects.
