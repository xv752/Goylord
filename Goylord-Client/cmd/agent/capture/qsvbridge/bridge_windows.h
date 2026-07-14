#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif
typedef void* goylord_qsv_encoder;
int goylord_qsv_probe(char*, int);
int goylord_qsv_create(void*, int, int, int, int, int, uint32_t, int,
                        goylord_qsv_encoder*, char*, int);
int goylord_qsv_encode(goylord_qsv_encoder, void*, int, uint8_t*, int, int*, char*, int);
void goylord_qsv_destroy(goylord_qsv_encoder);
#ifdef __cplusplus
}
#endif
