#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void* goylord_amf_encoder;

int goylord_amf_probe(char* error_text, int error_capacity);
int goylord_amf_create(void* d3d11_device, int input_width, int input_height,
                        int encode_width, int encode_height, int fps,
                        uint32_t dxgi_format, int bitrate,
                        goylord_amf_encoder* encoder,
                        char* error_text, int error_capacity);
int goylord_amf_encode(goylord_amf_encoder encoder, void* d3d11_texture,
                        int force_idr, uint8_t* output, int output_capacity,
                        int* output_size, char* error_text, int error_capacity);
void goylord_amf_destroy(goylord_amf_encoder encoder);

#ifdef __cplusplus
}
#endif
