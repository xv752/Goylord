# BackstageCapture

Windows DLL for **HVNC frame capture**. Hooks `IDXGISwapChain::Present` to intercept rendered frames from browser processes on the hidden desktop.

**Version:** 0.0.4

## Directory Layout

```
BackstageCapture/
├── BackstageCapture.vcxproj         # Visual Studio project (MSVC)
├── src/
│   ├── DXGICapture.c                # DXGI Present hook implementation
│   ├── DXGICapture.h                # Hook declarations, shared memory setup
│   ├── ReflectiveDll.c              # DLL entry point
│   ├── ReflectiveLoader.c           # Reflective loader
│   └── ReflectiveLoader.h           # Loader header
└── Minhook/                         # Embedded MinHook library
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

1. **Injection**: Loaded into browser processes via reflective DLL injection (triggered by BackstageInjection's `CreateProcessW` hook)
2. **DXGI Hook**: Intercepts `IDXGISwapChain::Present` calls to capture rendered frames
3. **Shared Memory**: Writes captured frames to named shared memory sections (`Local\hvnc_frame_{pid}`)
4. **Event Signaling**: Uses named events for frame-ready signaling
5. **Format**: Supports B8G8R8A8_UNORM pixel format, up to 7680x4320 resolution
6. **Frame Delivery**: Frames are read from shared memory by the agent process and sent to the server

## Role in HVNC Pipeline

```
BackstageInjection (hooks NT API + CreateProcessW)
    → Injects BackstageCapture into child processes
    → BackstageCapture hooks DXGI Present
    → Captures frames → Shared memory
    → Agent reads shared memory → Sends to server
```

## Exit Check Fix (v2.5.3, kdot contribution)

The reflective injection exit check in the Go side was changed from:
- **Before**: `>= 0xC0000000` (only catchesNTSTATUS error codes, misses other failure modes)
- **After**: `== 0` (only fails if VirtualAlloc returns NULL)

This ensures the injection is considered successful unless the memory allocation itself fails, which is more correct for the reflective injection flow.
