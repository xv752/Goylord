/*
 * Registry Editor Plugin — Windows registry browser/editor.
 *
 * Exports the standard Goylord plugin ABI:
 *   PluginOnLoad, PluginOnEvent, PluginOnUnload, PluginSetCallback,
 *   PluginGetRuntime  (returns "cpp")
 *
 * Build (Windows / MSVC):
 *   cl /LD /EHsc /O2 plugin.cpp /Fe:regedit-windows-amd64.dll advapi32.lib
 *
 * Build (Windows / MinGW):
 *   x86_64-w64-mingw32-g++ -shared -O2 -o regedit-windows-amd64.dll plugin.cpp -ladvapi32
 */

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#  define EXPORT extern "C" __declspec(dllexport)
#  define WIN32_LEAN_AND_MEAN
#  include <windows.h>
#  include <winreg.h>
#  pragma comment(lib, "advapi32.lib")
BOOL WINAPI DllMain(HINSTANCE hDll, DWORD reason, LPVOID reserved) {
    (void)hDll;
    (void)reason;
    (void)reserved;
    return TRUE;
}
#else
#  define EXPORT extern "C" __attribute__((visibility("default")))
#endif

#ifdef _WIN32
typedef void (__stdcall *host_callback_t)(
    const char *event, uintptr_t eventLen,
    const char *payload, uintptr_t payloadLen);
#else
typedef void (*host_callback_t)(
    uintptr_t ctx,
    const char *event, int eventLen,
    const char *payload, int payloadLen);
#endif

static std::mutex g_mu;
static host_callback_t g_callback = nullptr;
#ifndef _WIN32
static uintptr_t g_callback_ctx = 0;
#endif

static void send_event(const char *event, const std::string &payload) {
    std::lock_guard<std::mutex> lk(g_mu);
    if (!g_callback) return;
#ifdef _WIN32
    g_callback(event, static_cast<uintptr_t>(strlen(event)),
               payload.c_str(), static_cast<uintptr_t>(payload.size()));
#else
    g_callback(g_callback_ctx, event, static_cast<int>(strlen(event)),
               payload.c_str(), static_cast<int>(payload.size()));
#endif
}

static std::string trim(const std::string &s) {
    size_t a = 0;
    while (a < s.size() && std::isspace(static_cast<unsigned char>(s[a]))) a++;
    size_t b = s.size();
    while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) b--;
    return s.substr(a, b - a);
}

static std::string json_escape(const std::string &s) {
    std::string out;
    out.reserve(s.size() + 16);
    for (unsigned char c : s) {
        switch (c) {
        case '\\': out += "\\\\"; break;
        case '"': out += "\\\""; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (c < 0x20) {
                char buf[8];
                std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                out += buf;
            } else {
                out += static_cast<char>(c);
            }
        }
    }
    return out;
}

static std::string ok_payload(const std::string &action, const std::string &extra = "{}") {
    std::string body = extra;
    if (body.empty()) body = "{}";
    if (body.front() == '{') body.erase(body.begin());
    if (!body.empty() && body.back() == '}') body.pop_back();
    std::string out = "{\"ok\":true,\"action\":\"" + json_escape(action) + "\"";
    if (!body.empty()) out += "," + body;
    out += "}";
    return out;
}

static std::string err_payload(const std::string &action, const std::string &error) {
    return "{\"ok\":false,\"action\":\"" + json_escape(action) +
           "\",\"error\":\"" + json_escape(error) + "\"}";
}

static std::string json_string(const char *json, int len, const char *key) {
    if (!json || len <= 0) return "";
    std::string s(json, static_cast<size_t>(len));
    std::string needle = std::string("\"") + key + "\"";
    size_t p = s.find(needle);
    if (p == std::string::npos) return "";
    p = s.find(':', p + needle.size());
    if (p == std::string::npos) return "";
    p++;
    while (p < s.size() && std::isspace(static_cast<unsigned char>(s[p]))) p++;
    if (p >= s.size() || s[p] != '"') return "";
    p++;
    std::string out;
    while (p < s.size()) {
        char c = s[p++];
        if (c == '"') break;
        if (c == '\\' && p < s.size()) {
            char e = s[p++];
            switch (e) {
            case 'n': out += '\n'; break;
            case 'r': out += '\r'; break;
            case 't': out += '\t'; break;
            case 'b': out += '\b'; break;
            case 'f': out += '\f'; break;
            case '\\': out += '\\'; break;
            case '"': out += '"'; break;
            default: out += e; break;
            }
        } else {
            out += c;
        }
    }
    return out;
}

#ifdef _WIN32
static std::wstring widen(const std::string &s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring w(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), &w[0], n);
    return w;
}

static std::string narrow(const std::wstring &w) {
    if (w.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
    std::string s(static_cast<size_t>(n), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), static_cast<int>(w.size()), &s[0], n, nullptr, nullptr);
    return s;
}

struct RegPath {
    HKEY root;
    std::wstring subkey;
    std::string root_name;
};

static bool parse_path(const std::string &path_in, RegPath &out, std::string &error) {
    std::string path = trim(path_in);
    std::replace(path.begin(), path.end(), '/', '\\');
    while (!path.empty() && path.back() == '\\') path.pop_back();
    size_t slash = path.find('\\');
    std::string root = slash == std::string::npos ? path : path.substr(0, slash);
    std::string sub = slash == std::string::npos ? "" : path.substr(slash + 1);
    std::string up = root;
    std::transform(up.begin(), up.end(), up.begin(), [](unsigned char c) { return static_cast<char>(std::toupper(c)); });

    if (up == "HKCR" || up == "HKEY_CLASSES_ROOT") {
        out.root = HKEY_CLASSES_ROOT; out.root_name = "HKCR";
    } else if (up == "HKCU" || up == "HKEY_CURRENT_USER") {
        out.root = HKEY_CURRENT_USER; out.root_name = "HKCU";
    } else if (up == "HKLM" || up == "HKEY_LOCAL_MACHINE") {
        out.root = HKEY_LOCAL_MACHINE; out.root_name = "HKLM";
    } else if (up == "HKU" || up == "HKEY_USERS") {
        out.root = HKEY_USERS; out.root_name = "HKU";
    } else if (up == "HKCC" || up == "HKEY_CURRENT_CONFIG") {
        out.root = HKEY_CURRENT_CONFIG; out.root_name = "HKCC";
    } else {
        error = "Unknown root hive: " + root;
        return false;
    }
    out.subkey = widen(sub);
    return true;
}

static std::string full_path(const RegPath &p) {
    std::string s = p.root_name;
    if (!p.subkey.empty()) s += "\\" + narrow(p.subkey);
    return s;
}

static std::string win_error(LSTATUS code) {
    wchar_t *msg = nullptr;
    DWORD flags = FORMAT_MESSAGE_ALLOCATE_BUFFER |
                  FORMAT_MESSAGE_FROM_SYSTEM |
                  FORMAT_MESSAGE_IGNORE_INSERTS;
    DWORD len = FormatMessageW(flags, nullptr, static_cast<DWORD>(code),
                               MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
                               reinterpret_cast<LPWSTR>(&msg), 0, nullptr);
    std::string text;
    if (len && msg) {
        text = narrow(std::wstring(msg, msg + len));
        LocalFree(msg);
        while (!text.empty() && (text.back() == '\r' || text.back() == '\n' || text.back() == ' ')) {
            text.pop_back();
        }
    }
    char buf[64];
    std::snprintf(buf, sizeof(buf), "Windows error %ld", static_cast<long>(code));
    return text.empty() ? std::string(buf) : text + " (" + buf + ")";
}

static const char *type_name(DWORD type) {
    switch (type) {
    case REG_SZ: return "REG_SZ";
    case REG_EXPAND_SZ: return "REG_EXPAND_SZ";
    case REG_DWORD: return "REG_DWORD";
    case REG_QWORD: return "REG_QWORD";
    case REG_BINARY: return "REG_BINARY";
    case REG_MULTI_SZ: return "REG_MULTI_SZ";
    default: return "REG_NONE";
    }
}

static DWORD type_from_name(const std::string &name) {
    if (name == "REG_SZ") return REG_SZ;
    if (name == "REG_EXPAND_SZ") return REG_EXPAND_SZ;
    if (name == "REG_DWORD") return REG_DWORD;
    if (name == "REG_QWORD") return REG_QWORD;
    if (name == "REG_BINARY") return REG_BINARY;
    if (name == "REG_MULTI_SZ") return REG_MULTI_SZ;
    return REG_SZ;
}

static std::string hex_bytes(const BYTE *data, DWORD bytes) {
    static const char *digits = "0123456789abcdef";
    std::string out;
    for (DWORD i = 0; i < bytes; i++) {
        if (i) out += ' ';
        out += digits[(data[i] >> 4) & 0xf];
        out += digits[data[i] & 0xf];
    }
    return out;
}

static bool parse_hex_bytes(const std::string &text, std::vector<BYTE> &out) {
    std::string h;
    for (unsigned char c : text) {
        if (std::isxdigit(c)) h += static_cast<char>(c);
    }
    if (h.size() % 2 != 0) return false;
    out.clear();
    for (size_t i = 0; i < h.size(); i += 2) {
        unsigned int v = 0;
        std::stringstream ss;
        ss << std::hex << h.substr(i, 2);
        ss >> v;
        out.push_back(static_cast<BYTE>(v & 0xff));
    }
    return true;
}

static std::string value_to_text(DWORD type, const std::vector<BYTE> &data) {
    if (type == REG_DWORD && data.size() >= 4) {
        DWORD v = *reinterpret_cast<const DWORD *>(data.data());
        return std::to_string(v);
    }
    if (type == REG_QWORD && data.size() >= 8) {
        unsigned long long v = *reinterpret_cast<const unsigned long long *>(data.data());
        return std::to_string(v);
    }
    if (type == REG_SZ || type == REG_EXPAND_SZ) {
        const wchar_t *w = reinterpret_cast<const wchar_t *>(data.data());
        size_t chars = data.size() / sizeof(wchar_t);
        if (chars && w[chars - 1] == L'\0') chars--;
        return narrow(std::wstring(w, w + chars));
    }
    if (type == REG_MULTI_SZ) {
        const wchar_t *w = reinterpret_cast<const wchar_t *>(data.data());
        size_t chars = data.size() / sizeof(wchar_t);
        std::string out;
        size_t start = 0;
        for (size_t i = 0; i < chars; i++) {
            if (w[i] == L'\0') {
                if (i == start) break;
                if (!out.empty()) out += "\n";
                out += narrow(std::wstring(w + start, w + i));
                start = i + 1;
            }
        }
        return out;
    }
    return hex_bytes(data.data(), static_cast<DWORD>(data.size()));
}

static bool text_to_value(DWORD type, const std::string &text, std::vector<BYTE> &out, std::string &error) {
    out.clear();
    if (type == REG_DWORD) {
        char *end = nullptr;
        unsigned long v = std::strtoul(text.c_str(), &end, 0);
        if (end == text.c_str()) { error = "Invalid DWORD"; return false; }
        out.resize(4);
        std::memcpy(out.data(), &v, 4);
        return true;
    }
    if (type == REG_QWORD) {
        char *end = nullptr;
        unsigned long long v = std::strtoull(text.c_str(), &end, 0);
        if (end == text.c_str()) { error = "Invalid QWORD"; return false; }
        out.resize(8);
        std::memcpy(out.data(), &v, 8);
        return true;
    }
    if (type == REG_BINARY) {
        if (!parse_hex_bytes(text, out)) { error = "Invalid binary hex"; return false; }
        return true;
    }
    if (type == REG_MULTI_SZ) {
        std::wstring all;
        std::stringstream ss(text);
        std::string line;
        while (std::getline(ss, line)) {
            std::wstring w = widen(line);
            all.append(w);
            all.push_back(L'\0');
        }
        all.push_back(L'\0');
        out.resize(all.size() * sizeof(wchar_t));
        std::memcpy(out.data(), all.data(), out.size());
        return true;
    }
    std::wstring w = widen(text);
    w.push_back(L'\0');
    out.resize(w.size() * sizeof(wchar_t));
    std::memcpy(out.data(), w.data(), out.size());
    return true;
}

static std::string reg_quote(const std::string &s) {
    std::string out = "\"";
    for (char c : s) {
        if (c == '\\' || c == '"') out += '\\';
        out += c;
    }
    out += "\"";
    return out;
}

static std::string reg_hex_list(const BYTE *data, DWORD size) {
    static const char *digits = "0123456789abcdef";
    std::string out;
    for (DWORD i = 0; i < size; i++) {
        if (i) out += ",";
        out += digits[(data[i] >> 4) & 0xf];
        out += digits[data[i] & 0xf];
    }
    return out;
}

static std::string value_to_reg_line(const std::string &name, DWORD type, const std::vector<BYTE> &data) {
    std::string left = name.empty() ? "@" : reg_quote(name);
    if (type == REG_DWORD && data.size() >= 4) {
        DWORD v = *reinterpret_cast<const DWORD *>(data.data());
        char buf[32];
        std::snprintf(buf, sizeof(buf), "dword:%08lx", static_cast<unsigned long>(v));
        return left + "=" + buf + "\r\n";
    }
    if (type == REG_SZ) return left + "=" + reg_quote(value_to_text(type, data)) + "\r\n";
    if (type == REG_EXPAND_SZ) return left + "=hex(2):" + reg_hex_list(data.data(), static_cast<DWORD>(data.size())) + "\r\n";
    if (type == REG_MULTI_SZ) return left + "=hex(7):" + reg_hex_list(data.data(), static_cast<DWORD>(data.size())) + "\r\n";
    if (type == REG_QWORD) return left + "=hex(b):" + reg_hex_list(data.data(), static_cast<DWORD>(data.size())) + "\r\n";
    return left + "=hex:" + reg_hex_list(data.data(), static_cast<DWORD>(data.size())) + "\r\n";
}

static bool open_key(const std::string &path, REGSAM access, HKEY &key, RegPath *parsed, std::string &error) {
    RegPath rp;
    if (!parse_path(path, rp, error)) return false;
    LSTATUS st = RegOpenKeyExW(rp.root, rp.subkey.empty() ? nullptr : rp.subkey.c_str(), 0, access, &key);
    if (st != ERROR_SUCCESS) {
        error = win_error(st);
        return false;
    }
    if (parsed) *parsed = rp;
    return true;
}

static void handle_list_key(const std::string &path) {
    HKEY key = nullptr;
    RegPath rp;
    std::string error;
    REGSAM list_access = KEY_QUERY_VALUE | KEY_ENUMERATE_SUB_KEYS;
    if (!open_key(path, list_access, key, &rp, error)) {
        send_event("registry_result",
                   err_payload("list_key",
                               "Cannot open " + path + ": " + error));
        return;
    }

    DWORD sub_count = 0, max_sub = 0, val_count = 0, max_val = 0, max_data = 0;
    RegQueryInfoKeyW(key, nullptr, nullptr, nullptr, &sub_count, &max_sub, nullptr,
                     &val_count, &max_val, &max_data, nullptr, nullptr);

    std::ostringstream subkeys;
    subkeys << "[";
    for (DWORD i = 0; i < sub_count; i++) {
        std::wstring name(max_sub + 2, L'\0');
        DWORD len = static_cast<DWORD>(name.size());
        if (RegEnumKeyExW(key, i, &name[0], &len, nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS) {
            if (i) subkeys << ",";
            subkeys << "\"" << json_escape(narrow(std::wstring(name.c_str(), len))) << "\"";
        }
    }
    subkeys << "]";

    std::ostringstream values;
    values << "[";
    bool first = true;
    for (DWORD i = 0; i < val_count; i++) {
        std::wstring name(max_val + 2, L'\0');
        DWORD name_len = static_cast<DWORD>(name.size());
        DWORD type = 0;
        DWORD data_len = max_data + 2;
        std::vector<BYTE> data(data_len ? data_len : 2);
        LSTATUS st = RegEnumValueW(key, i, &name[0], &name_len, nullptr, &type, data.data(), &data_len);
        if (st == ERROR_MORE_DATA) {
            data.resize(data_len);
            name_len = static_cast<DWORD>(name.size());
            st = RegEnumValueW(key, i, &name[0], &name_len, nullptr, &type, data.data(), &data_len);
        }
        if (st == ERROR_SUCCESS) {
            data.resize(data_len);
            if (!first) values << ",";
            first = false;
            values << "{\"name\":\"" << json_escape(narrow(std::wstring(name.c_str(), name_len)))
                   << "\",\"type\":\"" << type_name(type)
                   << "\",\"data\":\"" << json_escape(value_to_text(type, data)) << "\"}";
        }
    }
    values << "]";
    RegCloseKey(key);

    send_event("registry_result",
               ok_payload("list_key", "{\"path\":\"" + json_escape(full_path(rp)) +
                                      "\",\"subkeys\":" + subkeys.str() +
                                      ",\"values\":" + values.str() + "}"));
}

static void handle_create_key(const std::string &path) {
    RegPath rp;
    std::string error;
    if (!parse_path(path, rp, error)) {
        send_event("registry_result", err_payload("create_key", error));
        return;
    }
    HKEY key = nullptr;
    DWORD disp = 0;
    LSTATUS st = RegCreateKeyExW(rp.root, rp.subkey.c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &key, &disp);
    if (st == ERROR_SUCCESS) {
        RegCloseKey(key);
        send_event("registry_result", ok_payload("create_key"));
    } else {
        send_event("registry_result", err_payload("create_key", win_error(st)));
    }
}

static void handle_delete_key(const std::string &path) {
    RegPath rp;
    std::string error;
    if (!parse_path(path, rp, error)) {
        send_event("registry_result", err_payload("delete_key", error));
        return;
    }
    if (rp.subkey.empty()) {
        send_event("registry_result", err_payload("delete_key", "Root hives cannot be deleted"));
        return;
    }
    LSTATUS st = RegDeleteTreeW(rp.root, rp.subkey.c_str());
    if (st == ERROR_SUCCESS) send_event("registry_result", ok_payload("delete_key"));
    else send_event("registry_result", err_payload("delete_key", win_error(st)));
}

static void handle_set_value(const char *payload, int payloadLen) {
    std::string path = json_string(payload, payloadLen, "path");
    std::string name = json_string(payload, payloadLen, "name");
    std::string old_name = json_string(payload, payloadLen, "oldName");
    std::string type_s = json_string(payload, payloadLen, "type");
    std::string data_s = json_string(payload, payloadLen, "data");
    HKEY key = nullptr;
    std::string error;
    if (!open_key(path, KEY_SET_VALUE, key, nullptr, error)) {
        send_event("registry_result", err_payload("set_value", error));
        return;
    }
    if (old_name != name && !old_name.empty()) {
        RegDeleteValueW(key, widen(old_name).c_str());
    }
    DWORD type = type_from_name(type_s);
    std::vector<BYTE> data;
    if (!text_to_value(type, data_s, data, error)) {
        RegCloseKey(key);
        send_event("registry_result", err_payload("set_value", error));
        return;
    }
    std::wstring wname = widen(name);
    LSTATUS st = RegSetValueExW(key, name.empty() ? nullptr : wname.c_str(), 0, type,
                                data.empty() ? nullptr : data.data(), static_cast<DWORD>(data.size()));
    RegCloseKey(key);
    if (st == ERROR_SUCCESS) send_event("registry_result", ok_payload("set_value"));
    else send_event("registry_result", err_payload("set_value", win_error(st)));
}

static void handle_delete_value(const std::string &path, const std::string &name) {
    HKEY key = nullptr;
    std::string error;
    if (!open_key(path, KEY_SET_VALUE, key, nullptr, error)) {
        send_event("registry_result", err_payload("delete_value", error));
        return;
    }
    std::wstring wname = widen(name);
    LSTATUS st = RegDeleteValueW(key, name.empty() ? nullptr : wname.c_str());
    RegCloseKey(key);
    if (st == ERROR_SUCCESS) send_event("registry_result", ok_payload("delete_value"));
    else send_event("registry_result", err_payload("delete_value", win_error(st)));
}

static bool export_key_recursive(const std::string &path, std::string &out, std::string &error) {
    HKEY key = nullptr;
    RegPath rp;
    if (!open_key(path, KEY_READ, key, &rp, error)) return false;
    out += "\r\n[" + full_path(rp) + "]\r\n";

    DWORD sub_count = 0, max_sub = 0, val_count = 0, max_val = 0, max_data = 0;
    RegQueryInfoKeyW(key, nullptr, nullptr, nullptr, &sub_count, &max_sub, nullptr,
                     &val_count, &max_val, &max_data, nullptr, nullptr);
    for (DWORD i = 0; i < val_count; i++) {
        std::wstring name(max_val + 2, L'\0');
        DWORD name_len = static_cast<DWORD>(name.size());
        DWORD type = 0;
        DWORD data_len = max_data + 2;
        std::vector<BYTE> data(data_len ? data_len : 2);
        if (RegEnumValueW(key, i, &name[0], &name_len, nullptr, &type, data.data(), &data_len) == ERROR_SUCCESS) {
            data.resize(data_len);
            out += value_to_reg_line(narrow(std::wstring(name.c_str(), name_len)), type, data);
        }
    }
    std::vector<std::string> subs;
    for (DWORD i = 0; i < sub_count; i++) {
        std::wstring name(max_sub + 2, L'\0');
        DWORD len = static_cast<DWORD>(name.size());
        if (RegEnumKeyExW(key, i, &name[0], &len, nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS) {
            subs.push_back(narrow(std::wstring(name.c_str(), len)));
        }
    }
    RegCloseKey(key);
    for (const auto &sub : subs) {
        if (!export_key_recursive(path + "\\" + sub, out, error)) return false;
    }
    return true;
}

static void handle_export_key(const std::string &path) {
    std::string content = "Windows Registry Editor Version 5.00\r\n";
    std::string error;
    if (!export_key_recursive(path, content, error)) {
        send_event("registry_result", err_payload("export_key", error));
        return;
    }
    send_event("registry_result",
               ok_payload("export_key", "{\"path\":\"" + json_escape(path) +
                                        "\",\"content\":\"" + json_escape(content) + "\"}"));
}

static std::string unquote_reg(const std::string &s) {
    std::string t = trim(s);
    if (t.size() >= 2 && t.front() == '"' && t.back() == '"') t = t.substr(1, t.size() - 2);
    std::string out;
    for (size_t i = 0; i < t.size(); i++) {
        if (t[i] == '\\' && i + 1 < t.size()) out += t[++i];
        else out += t[i];
    }
    return out;
}

static bool import_value_line(HKEY key, const std::string &line, std::string &error) {
    size_t eq = line.find('=');
    if (eq == std::string::npos) return true;
    std::string left = trim(line.substr(0, eq));
    std::string right = trim(line.substr(eq + 1));
    std::string name = left == "@" ? "" : unquote_reg(left);
    std::wstring wname = widen(name);

    DWORD type = REG_SZ;
    std::vector<BYTE> data;
    if (right == "-") {
        RegDeleteValueW(key, name.empty() ? nullptr : wname.c_str());
        return true;
    }
    if (right.rfind("dword:", 0) == 0) {
        type = REG_DWORD;
        DWORD v = static_cast<DWORD>(std::strtoul(right.substr(6).c_str(), nullptr, 16));
        data.resize(4);
        std::memcpy(data.data(), &v, 4);
    } else if (right.rfind("hex(b):", 0) == 0) {
        type = REG_QWORD;
        if (!parse_hex_bytes(right.substr(7), data)) { error = "Invalid hex(b) value"; return false; }
    } else if (right.rfind("hex(7):", 0) == 0) {
        type = REG_MULTI_SZ;
        if (!parse_hex_bytes(right.substr(7), data)) { error = "Invalid hex(7) value"; return false; }
    } else if (right.rfind("hex(2):", 0) == 0) {
        type = REG_EXPAND_SZ;
        if (!parse_hex_bytes(right.substr(7), data)) { error = "Invalid hex(2) value"; return false; }
    } else if (right.rfind("hex:", 0) == 0) {
        type = REG_BINARY;
        if (!parse_hex_bytes(right.substr(4), data)) { error = "Invalid hex value"; return false; }
    } else {
        type = REG_SZ;
        std::wstring w = widen(unquote_reg(right));
        w.push_back(L'\0');
        data.resize(w.size() * sizeof(wchar_t));
        std::memcpy(data.data(), w.data(), data.size());
    }
    LSTATUS st = RegSetValueExW(key, name.empty() ? nullptr : wname.c_str(), 0, type,
                                data.empty() ? nullptr : data.data(), static_cast<DWORD>(data.size()));
    if (st != ERROR_SUCCESS) {
        error = win_error(st);
        return false;
    }
    return true;
}

static void handle_import_reg(const std::string &content) {
    std::stringstream ss(content);
    std::string raw, current_path, pending;
    HKEY current = nullptr;
    int changed = 0;
    std::string error;

    auto close_current = [&]() {
        if (current) RegCloseKey(current);
        current = nullptr;
    };

    while (std::getline(ss, raw)) {
        if (!raw.empty() && raw.back() == '\r') raw.pop_back();
        std::string line = trim(raw);
        if (line.empty() || line[0] == ';') continue;
        if (!line.empty() && line.back() == '\\') {
            pending += line.substr(0, line.size() - 1);
            continue;
        }
        if (!pending.empty()) {
            line = pending + line;
            pending.clear();
        }
        if (line.rfind("Windows Registry Editor", 0) == 0 || line.rfind("REGEDIT4", 0) == 0) continue;
        if (line.front() == '[' && line.back() == ']') {
            close_current();
            current_path = line.substr(1, line.size() - 2);
            if (!current_path.empty() && current_path[0] == '-') {
                RegPath del;
                if (parse_path(current_path.substr(1), del, error) && !del.subkey.empty()) {
                    RegDeleteTreeW(del.root, del.subkey.c_str());
                    changed++;
                }
                current_path.clear();
                continue;
            }
            RegPath rp;
            if (!parse_path(current_path, rp, error)) break;
            LSTATUS st = RegCreateKeyExW(rp.root, rp.subkey.c_str(), 0, nullptr, 0, KEY_SET_VALUE, nullptr, &current, nullptr);
            if (st != ERROR_SUCCESS) { error = win_error(st); break; }
            changed++;
            continue;
        }
        if (current) {
            if (!import_value_line(current, line, error)) break;
            changed++;
        }
    }
    close_current();
    if (!error.empty()) send_event("registry_result", err_payload("import_reg", error));
    else send_event("registry_result", ok_payload("import_reg", "{\"changed\":" + std::to_string(changed) + "}"));
}
#endif

EXPORT const char *PluginGetRuntime() {
    return "cpp";
}

#ifdef _WIN32
EXPORT void PluginSetCallback(uint64_t cb) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_callback = reinterpret_cast<host_callback_t>(static_cast<uintptr_t>(cb));
}

EXPORT int PluginOnLoad(const char *hostInfo, int hostInfoLen, uint64_t cb) {
    (void)hostInfo;
    (void)hostInfoLen;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        g_callback = reinterpret_cast<host_callback_t>(static_cast<uintptr_t>(cb));
    }
#else
EXPORT int PluginOnLoad(const char *hostInfo, int hostInfoLen, uintptr_t cb, uintptr_t ctx) {
    (void)hostInfo;
    (void)hostInfoLen;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        g_callback = reinterpret_cast<host_callback_t>(cb);
        g_callback_ctx = ctx;
    }
#endif
    send_event("ready", "{\"message\":\"registry editor plugin ready\"}");
    return 0;
}

EXPORT int PluginOnEvent(const char *event, int eventLen, const char *payload, int payloadLen) {
    std::string ev(event ? event : "", eventLen > 0 ? static_cast<size_t>(eventLen) : 0u);
#ifndef _WIN32
    (void)payload;
    (void)payloadLen;
    send_event("registry_result", err_payload(ev, "Registry editor is Windows-only"));
    return 0;
#else
    if (ev == "list_key") handle_list_key(json_string(payload, payloadLen, "path"));
    else if (ev == "create_key") handle_create_key(json_string(payload, payloadLen, "path"));
    else if (ev == "delete_key") handle_delete_key(json_string(payload, payloadLen, "path"));
    else if (ev == "set_value") handle_set_value(payload, payloadLen);
    else if (ev == "delete_value") handle_delete_value(json_string(payload, payloadLen, "path"),
                                                        json_string(payload, payloadLen, "name"));
    else if (ev == "export_key") handle_export_key(json_string(payload, payloadLen, "path"));
    else if (ev == "import_reg") handle_import_reg(json_string(payload, payloadLen, "content"));
    else send_event("registry_result", err_payload(ev, "Unknown event"));
    return 0;
#endif
}

EXPORT void PluginOnUnload() {
    std::lock_guard<std::mutex> lk(g_mu);
    g_callback = nullptr;
#ifndef _WIN32
    g_callback_ctx = 0;
#endif
}
