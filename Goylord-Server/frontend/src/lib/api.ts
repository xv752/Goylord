async function request<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers as Record<string, string> },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function rawFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(url, { credentials: "include", ...opts });
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  put: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),

  downloadBlob: async (url: string, _filename?: string): Promise<Blob> => {
    const res = await rawFetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || body.message || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  upload: async <T>(url: string, file: File, fieldName = "file"): Promise<T> => {
    const form = new FormData();
    form.append(fieldName, file);
    const res = await rawFetch(url, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || body.message || `HTTP ${res.status}`);
    }
    return res.json();
  },
};
