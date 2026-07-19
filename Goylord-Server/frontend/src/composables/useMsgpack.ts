import { encode, decode } from "@msgpack/msgpack";

export function encodeMsgpack(msg: unknown): Uint8Array {
  return encode(msg);
}

export function decodeMsgpack<T = unknown>(raw: Uint8Array | ArrayBuffer): T {
  const buf = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
  return decode(buf) as T;
}
