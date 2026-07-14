//go:build windows && cgo

#include "bridge_windows.h"
#include <windows.h>
#include <algorithm>
#include <chrono>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

#include "../../../../third_party/amf/include/core/Factory.h"
#include "../../../../third_party/amf/include/core/Buffer.h"
#include "../../../../third_party/amf/include/components/VideoConverter.h"
#include "../../../../third_party/amf/include/components/VideoEncoderVCE.h"

namespace {

struct AMFEncoder {
    HMODULE runtime = nullptr;
    amf::AMFFactory* factory = nullptr;
    amf::AMFContext* context = nullptr;
    amf::AMFComponent* converter = nullptr;
    amf::AMFComponent* encoder = nullptr;
    std::vector<uint8_t> pending;
};

void set_error(char* dst, int capacity, const std::string& value) {
    if (!dst || capacity <= 0) return;
    const size_t count = std::min(value.size(), static_cast<size_t>(capacity - 1));
    std::memcpy(dst, value.data(), count);
    dst[count] = 0;
}

std::string amf_error(const char* stage, AMF_RESULT result) {
    return std::string(stage) + " failed (AMF_RESULT=" + std::to_string(static_cast<int>(result)) + ")";
}

void destroy(AMFEncoder* state) {
    if (!state) return;
    if (state->encoder) {
        state->encoder->Terminate();
        state->encoder->Release();
    }
    if (state->converter) {
        state->converter->Terminate();
        state->converter->Release();
    }
    if (state->context) {
        state->context->Terminate();
        state->context->Release();
    }
    if (state->runtime) FreeLibrary(state->runtime);
    delete state;
}

HMODULE load_runtime() {
    return LoadLibraryW(sizeof(void*) == 8 ? L"amfrt64.dll" : L"amfrt32.dll");
}

AMF_RESULT query_with_wait(amf::AMFComponent* component, amf::AMFData** data, int timeout_ms) {
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
    AMF_RESULT result = AMF_REPEAT;
    do {
        result = component->QueryOutput(data);
        if (result != AMF_REPEAT && result != AMF_NEED_MORE_INPUT) return result;
        if (*data) return AMF_OK;
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    } while (std::chrono::steady_clock::now() < deadline);
    return result;
}

AMF_RESULT collect_encoder_output(AMFEncoder* state, int timeout_ms) {
    amf::AMFData* data = nullptr;
    AMF_RESULT result = query_with_wait(state->encoder, &data, timeout_ms);
    if (!data) {
        return (result == AMF_REPEAT || result == AMF_NEED_MORE_INPUT) ? AMF_OK : result;
    }
    amf::AMFBufferPtr buffer(data);
    data->Release();
    if (!buffer) return AMF_INVALID_DATA_TYPE;
    const auto* bytes = static_cast<const uint8_t*>(buffer->GetNative());
    const size_t size = static_cast<size_t>(buffer->GetSize());
    if (bytes && size) state->pending.insert(state->pending.end(), bytes, bytes + size);
    return AMF_OK;
}

} // namespace

extern "C" int goylord_amf_probe(char* error_text, int error_capacity) {
    HMODULE runtime = load_runtime();
    if (!runtime) {
        set_error(error_text, error_capacity, "AMF runtime DLL is not installed");
        return 0;
    }
    auto init = reinterpret_cast<AMFInit_Fn>(GetProcAddress(runtime, AMF_INIT_FUNCTION_NAME));
    amf::AMFFactory* factory = nullptr;
    AMF_RESULT result = init ? init(AMF_FULL_VERSION, &factory) : AMF_FAIL;
    FreeLibrary(runtime);
    if (result != AMF_OK || !factory) {
        set_error(error_text, error_capacity, amf_error("AMFInit", result));
        return 0;
    }
    return 1;
}

extern "C" int goylord_amf_create(void* d3d11_device, int input_width, int input_height,
                                     int encode_width, int encode_height, int fps,
                                     uint32_t dxgi_format, int bitrate,
                                     goylord_amf_encoder* output,
                                     char* error_text, int error_capacity) {
    if (!output || !d3d11_device) {
        set_error(error_text, error_capacity, "invalid AMF create arguments");
        return 0;
    }
    *output = nullptr;
    auto* state = new AMFEncoder();
    state->runtime = load_runtime();
    if (!state->runtime) {
        set_error(error_text, error_capacity, "AMF runtime DLL is not installed");
        destroy(state);
        return 0;
    }
    auto init = reinterpret_cast<AMFInit_Fn>(GetProcAddress(state->runtime, AMF_INIT_FUNCTION_NAME));
    AMF_RESULT result = init ? init(AMF_FULL_VERSION, &state->factory) : AMF_FAIL;
    if (result != AMF_OK || !state->factory) goto fail_init;
    result = state->factory->CreateContext(&state->context);
    if (result != AMF_OK || !state->context) goto fail_context;
    result = state->context->InitDX11(d3d11_device, amf::AMF_DX11_0);
    if (result != AMF_OK) goto fail_dx11;
    result = state->factory->CreateComponent(state->context, AMFVideoConverter, &state->converter);
    if (result != AMF_OK || !state->converter) goto fail_converter;
    state->converter->SetProperty(AMF_VIDEO_CONVERTER_OUTPUT_FORMAT, static_cast<amf_int64>(amf::AMF_SURFACE_NV12));
    state->converter->SetProperty(AMF_VIDEO_CONVERTER_MEMORY_TYPE, static_cast<amf_int64>(amf::AMF_MEMORY_DX11));
    state->converter->SetProperty(AMF_VIDEO_CONVERTER_OUTPUT_SIZE, AMFConstructSize(encode_width, encode_height));
    {
        const amf::AMF_SURFACE_FORMAT input_format = dxgi_format == 28 ? amf::AMF_SURFACE_RGBA : amf::AMF_SURFACE_BGRA;
        result = state->converter->Init(input_format, input_width, input_height);
    }
    if (result != AMF_OK) goto fail_converter_init;
    result = state->factory->CreateComponent(state->context, AMFVideoEncoderVCE_AVC, &state->encoder);
    if (result != AMF_OK || !state->encoder) goto fail_encoder;
    state->encoder->SetProperty(AMF_VIDEO_ENCODER_USAGE, static_cast<amf_int64>(AMF_VIDEO_ENCODER_USAGE_ULTRA_LOW_LATENCY));
    state->encoder->SetProperty(AMF_VIDEO_ENCODER_PROFILE, static_cast<amf_int64>(AMF_VIDEO_ENCODER_PROFILE_MAIN));
    state->encoder->SetProperty(AMF_VIDEO_ENCODER_FRAMESIZE, AMFConstructSize(encode_width, encode_height));
    state->encoder->SetProperty(AMF_VIDEO_ENCODER_FRAMERATE, AMFConstructRate(fps, 1));
    state->encoder->SetProperty(AMF_VIDEO_ENCODER_TARGET_BITRATE, static_cast<amf_int64>(bitrate));
    state->encoder->SetProperty(AMF_VIDEO_ENCODER_B_PIC_PATTERN, static_cast<amf_int64>(0));
    state->encoder->SetProperty(AMF_VIDEO_ENCODER_LOWLATENCY_MODE, true);
    state->encoder->SetProperty(AMF_VIDEO_ENCODER_HEADER_INSERTION_SPACING, static_cast<amf_int64>(60));
    result = state->encoder->Init(amf::AMF_SURFACE_NV12, encode_width, encode_height);
    if (result != AMF_OK) goto fail_encoder_init;
    *output = state;
    return 1;

fail_encoder_init: set_error(error_text, error_capacity, amf_error("H.264 encoder Init", result)); destroy(state); return 0;
fail_encoder: set_error(error_text, error_capacity, amf_error("CreateComponent encoder", result)); destroy(state); return 0;
fail_converter_init: set_error(error_text, error_capacity, amf_error("video converter Init", result)); destroy(state); return 0;
fail_converter: set_error(error_text, error_capacity, amf_error("CreateComponent converter", result)); destroy(state); return 0;
fail_dx11: set_error(error_text, error_capacity, amf_error("InitDX11", result)); destroy(state); return 0;
fail_context: set_error(error_text, error_capacity, amf_error("CreateContext", result)); destroy(state); return 0;
fail_init: set_error(error_text, error_capacity, amf_error("AMFInit", result)); destroy(state); return 0;
}

extern "C" int goylord_amf_encode(goylord_amf_encoder opaque, void* d3d11_texture,
                                     int force_idr, uint8_t* output, int output_capacity,
                                     int* output_size, char* error_text, int error_capacity) {
    auto* state = static_cast<AMFEncoder*>(opaque);
    if (!state || !d3d11_texture || !output_size) return 0;
    *output_size = 0;
    if (!state->pending.empty()) {
        *output_size = static_cast<int>(state->pending.size());
        if (output_capacity < *output_size || !output) return 2;
        std::memcpy(output, state->pending.data(), state->pending.size());
        state->pending.clear();
        return 1;
    }
    amf::AMFSurface* source = nullptr;
    AMF_RESULT result = state->context->CreateSurfaceFromDX11Native(d3d11_texture, &source, nullptr);
    if (result != AMF_OK || !source) goto fail_source;
    result = state->converter->SubmitInput(source);
    source->Release();
    if (result != AMF_OK) goto fail_converter_submit;
    {
        amf::AMFData* converted_data = nullptr;
        result = query_with_wait(state->converter, &converted_data, 100);
        if (result != AMF_OK || !converted_data) goto fail_converter_output;
        amf::AMFSurfacePtr converted(converted_data);
        converted_data->Release();
        if (!converted) { result = AMF_INVALID_DATA_TYPE; goto fail_converter_output; }
        if (force_idr) {
            converted->SetProperty(AMF_VIDEO_ENCODER_FORCE_PICTURE_TYPE, static_cast<amf_int64>(AMF_VIDEO_ENCODER_PICTURE_TYPE_IDR));
            converted->SetProperty(AMF_VIDEO_ENCODER_INSERT_SPS, true);
            converted->SetProperty(AMF_VIDEO_ENCODER_INSERT_PPS, true);
        }
        result = state->encoder->SubmitInput(converted);
        if (result != AMF_OK) goto fail_encoder_submit;
    }
    result = collect_encoder_output(state, 20);
    if (result != AMF_OK) goto fail_encoder_output;
    if (!state->pending.empty()) {
        *output_size = static_cast<int>(state->pending.size());
        if (output_capacity < *output_size || !output) return 2;
        std::memcpy(output, state->pending.data(), state->pending.size());
        state->pending.clear();
    }
    return 1;

fail_encoder_output: set_error(error_text, error_capacity, amf_error("encoder QueryOutput", result)); return 0;
fail_encoder_submit: set_error(error_text, error_capacity, amf_error("encoder SubmitInput", result)); return 0;
fail_converter_output: set_error(error_text, error_capacity, amf_error("converter QueryOutput", result)); return 0;
fail_converter_submit: set_error(error_text, error_capacity, amf_error("converter SubmitInput", result)); return 0;
fail_source: set_error(error_text, error_capacity, amf_error("CreateSurfaceFromDX11Native", result)); return 0;
}

extern "C" void goylord_amf_destroy(goylord_amf_encoder encoder) {
    destroy(static_cast<AMFEncoder*>(encoder));
}
