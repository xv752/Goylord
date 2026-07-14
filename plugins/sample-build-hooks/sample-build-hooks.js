const output = document.getElementById("sample-build-hooks-output");
const refreshButton = document.getElementById("sample-build-hooks-refresh");

async function callRpc(method, params) {
  const res = await fetch("/api/plugins/sample-build-hooks/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "RPC failed");
  return data.result;
}

async function refresh() {
  output.textContent = "Loading...";
  try {
    const result = await callRpc("recent");
    output.textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    output.textContent = `Error: ${err.message || err}`;
  }
}

refreshButton?.addEventListener("click", refresh);
refresh();
