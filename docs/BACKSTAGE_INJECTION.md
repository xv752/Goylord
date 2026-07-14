# BackstageInjection

Windows DLL for **HVNC (Hidden VNC)** functionality. Hooks NT API functions to redirect file system paths at the kernel level, enabling hidden desktop operations.

**Version:** 2.5.3

## Directory Layout

```
BackstageInjection/
├── BackstageInjection.vcxproj       # Visual Studio project (MSVC)
├── src/
│   ├── NtApiHooks.c                 # NT API hook implementations
│   ├── NtApiHooks.h                 # Hook declarations, environment variable reading
│   ├── ReflectiveDll.c              # DLL entry point with reflective loader
│   ├── ReflectiveLoader.c           # Reflective DLL injection loader
│   ├── ReflectiveLoader.h           # Loader header
│   ├── obfstr.h                     # String obfuscation macros
│   └── seh_compat.h                 # SEH compatibility for MinGW
└── Minhook/                         # Embedded MinHook library (function hooking)
    ├── LICENSE
    ├── LICENSE.MinHook
    ├── Include/
    │   └── MinHook.h
    └── Source/
        ├── buffer.c
        ├── buffer.h
        ├── hook.c
        ├── trampoline.c
        └── trampoline.h
```

## How It Works

1. **Injection**: Injected into target processes via reflective DLL injection
2. **Environment Variables**: Reads `RDI_SEARCH_PATH` and `RDI_REPLACE_PATH` to determine file path redirection rules
3. **NT API Hooks** (9 functions intercepted):
   - `NtCreateFile` — Redirect file creation paths
   - `NtOpenFile` — Redirect file open paths
   - `NtDeleteFile` — Redirect file deletion paths
   - `NtSetInformationFile` — Redirect file rename/move operations
   - `NtQueryAttributesFile` — Redirect attribute queries
   - `NtQueryFullAttributesFile` — Redirect full attribute queries
   - `NtQueryDirectoryFile` — Redirect directory listings
   - `NtQueryDirectoryFileEx` — Redirect extended directory listings
   - `CreateProcessW` — Hook to inject BackstageCapture into child processes
4. **Reflective Injection**: The `CreateProcessW` hook automatically injects `BackstageCapture.dll` into any child process created by the hooked process

## v2.5.2 Memory Fix (kdot contribution)

The `backstage_inject_windows.go` file (Go side) was updated to fix environment block memory handling:

- **Before**: Used `GetEnvironmentStrings()` which returned a pointer to a shared memory block that could be freed incorrectly
- **After**: Uses `CreateEnvironmentBlock()` API with proper VirtualAlloc/VirtualFree, with fallback to `GetEnvironmentStrings` if the API fails
- Extracted `readRawEnvironmentBlock()` helper for cleaner code flow

## Purpose

Enables a hidden desktop environment where:
- File operations are transparently redirected
- Processes see a different file system view
- Browser windows on the hidden desktop have their frames captured via DXGI (BackstageCapture)
