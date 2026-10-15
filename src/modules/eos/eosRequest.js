/** Bound authentication and network waits without replaying writes automatically. */
export async function boundedEosRequest(operation, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutError = new Error('Request timed out. The save outcome is unknown; your draft is retained. Retry the unchanged draft to safely confirm it, or reload before making different changes.');
  timeoutError.code = 'EOS_TIMEOUT';
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { reject(timeoutError); controller.abort(timeoutError); }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), deadline]); }
  finally { clearTimeout(timer); }
}

export function eosRpc(client, name, args, signal) {
  signal?.throwIfAborted();
  const request = client.rpc(name, args);
  return signal ? request.abortSignal(signal) : request;
}
