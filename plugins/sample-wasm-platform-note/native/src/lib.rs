use std::alloc::{alloc, dealloc, Layout};
use std::ptr;
use std::slice;
use std::str;

extern "C" {
    fn goylord_emit(event: *const u8, event_len: i32, payload: *const u8, payload_len: i32) -> i32;
    fn goylord_host_info(out: *mut u8, out_len: i32) -> i32;
    fn goylord_fs_list(
        bucket: *const u8,
        bucket_len: i32,
        path: *const u8,
        path_len: i32,
        out: *mut u8,
        out_len: i32,
    ) -> i32;
    fn goylord_fs_read(
        bucket: *const u8,
        bucket_len: i32,
        path: *const u8,
        path_len: i32,
        out: *mut u8,
        out_len: i32,
    ) -> i32;
    fn goylord_fs_mkdir(bucket: *const u8, bucket_len: i32, path: *const u8, path_len: i32) -> i32;
    fn goylord_fs_write(
        bucket: *const u8,
        bucket_len: i32,
        path: *const u8,
        path_len: i32,
        data: *const u8,
        data_len: i32,
    ) -> i32;
}

#[no_mangle]
pub extern "C" fn goylord_alloc(size: u32) -> *mut u8 {
    let size = size.max(1) as usize;
    let layout = Layout::from_size_align(size, 8).unwrap();
    unsafe { alloc(layout) }
}

#[no_mangle]
pub extern "C" fn goylord_free(ptr: *mut u8, size: u32) {
    if ptr.is_null() {
        return;
    }
    let layout = Layout::from_size_align((size.max(1)) as usize, 8).unwrap();
    unsafe { dealloc(ptr, layout) };
}

#[no_mangle]
pub extern "C" fn goylord_on_load(_host: *const u8, _host_len: u32) -> i32 {
    emit("ready", br#"{"sample":"platform-note"}"#);
    0
}

#[no_mangle]
pub extern "C" fn goylord_on_event(
    event: *const u8,
    event_len: u32,
    _payload: *const u8,
    _payload_len: u32,
) -> i32 {
    let event = unsafe { slice::from_raw_parts(event, event_len as usize) };
    if event != b"write_note" {
        return 0;
    }

    let mut host = [0u8; 1024];
    let host_len = unsafe { goylord_host_info(host.as_mut_ptr(), host.len() as i32) };
    let host = if host_len > 0 {
        str::from_utf8(&host[..host_len as usize]).unwrap_or("")
    } else {
        ""
    };

    let os = if host.contains(r#""os":"windows""#) {
        "windows"
    } else if host.contains(r#""os":"darwin""#) {
        "darwin"
    } else if host.contains(r#""os":"linux""#) {
        "linux"
    } else {
        "unknown"
    };

    let arch = if host.contains(r#""arch":"arm64""#) {
        "arm64"
    } else if host.contains(r#""arch":"amd64""#) {
        "amd64"
    } else if host.contains(r#""arch":"386""#) {
        "386"
    } else {
        "unknown"
    };

    let bucket = "pluginData";
    let dir = "platform";
    let file = format!("platform/{os}-{arch}.txt");
    let note = format!("single WASM plugin running on os={os} arch={arch}\n");

    let mkdir_result = unsafe {
        goylord_fs_mkdir(
            bucket.as_ptr(),
            bucket.len() as i32,
            dir.as_ptr(),
            dir.len() as i32,
        )
    };
    let write_result = unsafe {
        goylord_fs_write(
            bucket.as_ptr(),
            bucket.len() as i32,
            file.as_ptr(),
            file.len() as i32,
            note.as_ptr(),
            note.len() as i32,
        )
    };
    let desktop = probe_desktop(host);

    let response = format!(
        r#"{{"os":"{os}","arch":"{arch}","mkdir":{mkdir_result},"write":{write_result},"desktopList":{},"desktopRead":{},"desktopFile":"{}","desktopSize":{}}}"#,
        desktop.list_result,
        desktop.read_result,
        json_escape(&desktop.file),
        desktop.size,
    );
    emit("platform_note", response.as_bytes());
    0
}

#[no_mangle]
pub extern "C" fn goylord_on_unload() {}

fn emit(event: &str, payload: &[u8]) {
    unsafe {
        goylord_emit(
            event.as_ptr(),
            event.len() as i32,
            payload.as_ptr(),
            payload.len() as i32,
        );
    }
}

struct DesktopProbe {
    file: String,
    size: i64,
    list_result: i32,
    read_result: i32,
}

fn probe_desktop(seed: &str) -> DesktopProbe {
    let bucket = "desktop";
    let path = "";
    let mut listing = Vec::new();
    let mut list_result = -4;
    for size in [8 * 1024, 64 * 1024, 256 * 1024, 1024 * 1024] {
        listing.resize(size, 0);
        list_result = unsafe {
            goylord_fs_list(
                bucket.as_ptr(),
                bucket.len() as i32,
                path.as_ptr(),
                path.len() as i32,
                listing.as_mut_ptr(),
                listing.len() as i32,
            )
        };
        if list_result != -4 {
            break;
        }
    }
    if list_result <= 0 {
        return DesktopProbe {
            file: String::new(),
            size: -1,
            list_result,
            read_result: -3,
        };
    }

    let listing = str::from_utf8(&listing[..list_result as usize]).unwrap_or("");
    let files = desktop_files_from_listing(listing);
    if files.is_empty() {
        return DesktopProbe {
            file: String::new(),
            size: -1,
            list_result,
            read_result: -3,
        };
    }

    let seed_sum = seed.bytes().fold(0usize, |acc, b| acc.wrapping_add(b as usize));
    let selected = &files[seed_sum % files.len()];
    let mut buf = [0u8; 128];
    let read_result = unsafe {
        goylord_fs_read(
            bucket.as_ptr(),
            bucket.len() as i32,
            selected.path.as_ptr(),
            selected.path.len() as i32,
            buf.as_mut_ptr(),
            buf.len() as i32,
        )
    };

    DesktopProbe {
        file: selected.path.clone(),
        size: selected.size,
        list_result,
        read_result,
    }
}

struct DesktopFile {
    path: String,
    size: i64,
}

fn desktop_files_from_listing(listing: &str) -> Vec<DesktopFile> {
    let mut files = Vec::new();
    let mut rest = listing;
    while let Some(path_key) = rest.find(r#""path":"#) {
        rest = &rest[path_key + 7..];
        let Some((path, after_path)) = parse_json_string(rest) else {
            break;
        };
        rest = after_path;
        let next_path = rest.find(r#""path":"#).unwrap_or(rest.len());
        let entry = &rest[..next_path];
        if !entry.contains(r#""isDir":false"#) {
            continue;
        }
        let size = parse_json_i64_after(entry, r#""size":"#).unwrap_or(-1);
        files.push(DesktopFile { path, size });
    }
    files
}

fn parse_json_string(input: &str) -> Option<(String, &str)> {
    let input = input.strip_prefix('"')?;
    let mut out = String::new();
    let mut escaped = false;
    for (idx, ch) in input.char_indices() {
        if escaped {
            match ch {
                '"' => out.push('"'),
                '\\' => out.push('\\'),
                '/' => out.push('/'),
                'b' => out.push('\u{0008}'),
                'f' => out.push('\u{000c}'),
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                other => out.push(other),
            }
            escaped = false;
            continue;
        }
        match ch {
            '\\' => escaped = true,
            '"' => return Some((out, &input[idx + 1..])),
            other => out.push(other),
        }
    }
    None
}

fn parse_json_i64_after(input: &str, key: &str) -> Option<i64> {
    let start = input.find(key)? + key.len();
    let bytes = input.as_bytes();
    let mut end = start;
    while end < bytes.len() && (bytes[end].is_ascii_digit() || bytes[end] == b'-') {
        end += 1;
    }
    input[start..end].parse().ok()
}

fn json_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out
}

#[no_mangle]
pub extern "C" fn memset(dest: *mut u8, value: i32, len: usize) -> *mut u8 {
    unsafe { ptr::write_bytes(dest, value as u8, len) };
    dest
}
