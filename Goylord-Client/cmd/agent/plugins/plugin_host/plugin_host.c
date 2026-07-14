/*
 * plugin_host — subprocess shim that dlopen()s a plugin .so on behalf of a
 * statically-linked parent agent.
 *
 * Build (amd64, glibc):   cc  -O2 -o plugin_host_amd64 plugin_host.c -ldl
 * Build (arm64, musl):    aarch64-linux-musl-gcc -O2 -o plugin_host_arm64 plugin_host.c -ldl
 * Build (armv7, musl):    armv7l-linux-musleabihf-gcc -O2 -o plugin_host_arm plugin_host.c -ldl
 *
 * This file is compiled at agent-build time by build-process.ts and embedded
 * into the agent via //go:embed.  It is NOT committed as a binary.
 *
 * Protocol (framed over a Unix socketpair):
 *   Each message: [4-byte LE total-payload-len][1-byte type][payload...]
 *
 *   Agent → Host:
 *     0x01 MSG_LOAD    payload = raw hostInfo bytes
 *     0x02 MSG_EVENT   payload = [u16le eventLen][event][u32le payloadLen][payload]
 *     0x03 MSG_UNLOAD  payload = (empty)
 *
 *   Host → Agent:
 *     0x10 MSG_CALLBACK    payload = [u16le eventLen][event][u32le payloadLen][payload]
 *     0x11 MSG_READY       payload = runtime string (e.g. "c", "rust")
 *     0x12 MSG_ERR         payload = error string (sent instead of READY on failure)
 *     0x13 MSG_LOAD_RESULT payload = [u8: 0=ok, 1=err]
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <dlfcn.h>

#define MSG_LOAD        0x01
#define MSG_EVENT       0x02
#define MSG_UNLOAD      0x03
#define MSG_CALLBACK    0x10
#define MSG_READY       0x11
#define MSG_ERR         0x12
#define MSG_LOAD_RESULT 0x13

static int g_sock = -1;

static int read_exact(int fd, void *buf, size_t n) {
    char *p = (char *)buf;
    while (n > 0) {
        ssize_t r = read(fd, p, n);
        if (r <= 0) return -1;
        p += r; n -= (size_t)r;
    }
    return 0;
}

static int write_exact(int fd, const void *buf, size_t n) {
    const char *p = (const char *)buf;
    while (n > 0) {
        ssize_t w = write(fd, p, n);
        if (w <= 0) return -1;
        p += w; n -= (size_t)w;
    }
    return 0;
}

static int send_msg(uint8_t type, const void *payload, uint32_t len) {
    uint32_t total = 1 + len;
    uint8_t hdr[4] = {
        (uint8_t)(total),
        (uint8_t)(total >> 8),
        (uint8_t)(total >> 16),
        (uint8_t)(total >> 24)
    };
    if (write_exact(g_sock, hdr, 4) < 0) return -1;
    if (write_exact(g_sock, &type, 1) < 0) return -1;
    if (len > 0 && write_exact(g_sock, payload, len) < 0) return -1;
    return 0;
}

static int recv_msg(uint8_t *type, uint8_t **payload, uint32_t *len) {
    uint8_t hdr[4];
    if (read_exact(g_sock, hdr, 4) < 0) return -1;
    uint32_t total = (uint32_t)hdr[0] | ((uint32_t)hdr[1] << 8)
                   | ((uint32_t)hdr[2] << 16) | ((uint32_t)hdr[3] << 24);
    if (total == 0) return -1;
    *type = 0;
    if (read_exact(g_sock, type, 1) < 0) return -1;
    *len = total - 1;
    *payload = NULL;
    if (*len > 0) {
        *payload = malloc(*len);
        if (!*payload) return -1;
        if (read_exact(g_sock, *payload, *len) < 0) { free(*payload); *payload = NULL; return -1; }
    }
    return 0;
}

/* Forwarded to the plugin as the host callback. */
static void plugin_callback(uintptr_t ctx,
                            const char *event, int eventLen,
                            const char *payload, int payloadLen) {
    (void)ctx;
    uint32_t msgLen = 2 + (uint32_t)eventLen + 4 + (uint32_t)payloadLen;
    uint8_t *buf = (uint8_t *)malloc(msgLen);
    if (!buf) return;

    buf[0] = (uint8_t)(eventLen);
    buf[1] = (uint8_t)(eventLen >> 8);
    memcpy(buf + 2, event, eventLen);

    uint32_t pl = (uint32_t)payloadLen;
    buf[2 + eventLen + 0] = (uint8_t)(pl);
    buf[2 + eventLen + 1] = (uint8_t)(pl >> 8);
    buf[2 + eventLen + 2] = (uint8_t)(pl >> 16);
    buf[2 + eventLen + 3] = (uint8_t)(pl >> 24);
    if (payloadLen > 0) memcpy(buf + 2 + eventLen + 4, payload, payloadLen);

    send_msg(MSG_CALLBACK, buf, msgLen);
    free(buf);
}

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "usage: plugin_host <so_fd> <sock_fd>\n");
        return 1;
    }
    int soFd  = atoi(argv[1]);
    g_sock    = atoi(argv[2]);

    /* dlopen the .so via its memfd path. */
    char soPath[64];
    snprintf(soPath, sizeof(soPath), "/proc/self/fd/%d", soFd);

    void *handle = dlopen(soPath, RTLD_NOW | RTLD_LOCAL);
    close(soFd);

    if (!handle) {
        const char *err = dlerror();
        if (!err) err = "dlopen failed";
        send_msg(MSG_ERR, err, (uint32_t)strlen(err));
        return 1;
    }

    void *onLoadFn  = dlsym(handle, "PluginOnLoad");
    void *onEventFn = dlsym(handle, "PluginOnEvent");
    void *onUnloadFn = dlsym(handle, "PluginOnUnload");

    if (!onLoadFn || !onEventFn || !onUnloadFn) {
        const char *err = "missing required plugin exports";
        send_msg(MSG_ERR, err, (uint32_t)strlen(err));
        dlclose(handle);
        return 1;
    }

    /* Detect runtime. */
    const char *runtime = "c";
    void *getRtFn = dlsym(handle, "PluginGetRuntime");
    if (getRtFn) {
        typedef const char *(*fn_t)(void);
        const char *r = ((fn_t)getRtFn)();
        if (r && *r) runtime = r;
    }

    /* Send READY with the runtime string. */
    send_msg(MSG_READY, runtime, (uint32_t)strlen(runtime));

    /* Main message loop. */
    while (1) {
        uint8_t type;
        uint8_t *payload;
        uint32_t payloadLen;
        if (recv_msg(&type, &payload, &payloadLen) < 0) break;

        if (type == MSG_LOAD) {
            typedef int (*fn_t)(const char *, int, uintptr_t, uintptr_t);
            int ret = ((fn_t)onLoadFn)(
                (const char *)payload, (int)payloadLen,
                (uintptr_t)plugin_callback, (uintptr_t)0);
            uint8_t result = (ret == 0) ? 0 : 1;
            send_msg(MSG_LOAD_RESULT, &result, 1);
            free(payload);

        } else if (type == MSG_EVENT) {
            if (payloadLen < 6) { free(payload); continue; }
            uint16_t evLen = (uint16_t)(payload[0] | (payload[1] << 8));
            if (payloadLen < (uint32_t)(2 + evLen + 4)) { free(payload); continue; }
            uint32_t plLen = (uint32_t)payload[2+evLen]
                           | ((uint32_t)payload[2+evLen+1] << 8)
                           | ((uint32_t)payload[2+evLen+2] << 16)
                           | ((uint32_t)payload[2+evLen+3] << 24);
            typedef int (*fn_t)(const char *, int, const char *, int);
            ((fn_t)onEventFn)(
                (const char *)(payload + 2), (int)evLen,
                (const char *)(payload + 2 + evLen + 4), (int)plLen);
            free(payload);

        } else if (type == MSG_UNLOAD) {
            free(payload);
            typedef void (*fn_t)(void);
            ((fn_t)onUnloadFn)();
            if (strcmp(runtime, "go") != 0) dlclose(handle);
            break;

        } else {
            free(payload);
        }
    }
    return 0;
}
