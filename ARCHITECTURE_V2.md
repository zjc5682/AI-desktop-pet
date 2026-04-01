# AI Companion Architecture V2

This document maps the new package layout onto the existing repository.

## Goals

- Keep the current desktop pet app running while introducing a cleaner architecture.
- Separate product orchestration from ML runtimes and native system access.
- Provide clear extension points for voice, memory, perception, tools, and policy.

## Package map

- `packages/core`
  - Conversation orchestration and event dispatch.
- `packages/memory`
  - Short-term and long-term memory contracts.
- `packages/providers`
  - Chat, STT, TTS, OCR, search, and embedding providers.
- `packages/stage`
  - Live2D stage contracts, mood, motion, lip sync, and mode switching.
- `packages/policy`
  - Permissions, safe mode, and approval checks.
- `packages/plugins`
  - Tool registry and plugin execution contracts.
- `packages/character`
  - Persona, big-five profile, affinity, and prompt building.
- `packages/realtime`
  - Full duplex voice session contract.
- `packages/perception`
  - Camera, mic, OCR, scene, and gesture interfaces.

## Compatibility strategy

- `packages/ai-core` now re-exports `@table-pet/core`.
- `packages/live2d` now re-exports `@table-pet/stage`.
- `apps/pet` gets a bootstrap helper at
  `apps/pet/src/companion/createDesktopCompanionCore.ts`.

## Migration path

1. Move business logic from `apps/pet/src/stores` and `apps/pet/src/composables`
   into the new packages incrementally.
2. Replace the in-memory implementations with SQLite, DuckDB, and provider-backed
   implementations.
3. Move Python AI services into provider adapters and perception runtimes.
4. Keep Rust/Tauri focused on native host capabilities and permissions.
