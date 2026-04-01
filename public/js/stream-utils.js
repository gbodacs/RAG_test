export function createStreamState() {
  return {
    abortController: null,
    reader: null,
    isStreaming: false
  };
}

export function setStreaming(state, sendButton, stopButton, active) {
  state.isStreaming = active;
  sendButton.disabled = active;
  stopButton.disabled = !active;
}

export function stopStream(state) {
  if (!state.isStreaming) return;
  state.abortController?.abort();
  if (state.reader) {
    state.reader.cancel().catch(() => {});
  }
  state.abortController = null;
  state.reader = null;
  state.isStreaming = false;
}

export async function fetchStream(url, requestInit, state, callbacks = {}) {
  state.abortController = new AbortController();
  state.reader = null;
  state.isStreaming = true;

  const response = await fetch(url, {
    ...requestInit,
    signal: state.abortController.signal
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || 'Stream request failed');
  }

  const reader = response.body.getReader();
  state.reader = reader;
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;

        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.type === 'status') {
          callbacks.onStatus?.(event.text || '');
        } else if (event.type === 'partial') {
          callbacks.onPartial?.(event.text || '');
        } else if (event.type === 'final') {
          callbacks.onFinal?.(event.text || '');
        } else if (event.type === 'error') {
          callbacks.onError?.(event.text || '');
        }
      }
    }
  } finally {
    state.reader = null;
    state.abortController = null;
    state.isStreaming = false;
  }
}
