const HEARTBEAT_MS = 25_000;
const CONNECT_TIMEOUT_MS = 10_000;

export function createRealtimeConnection({url, publicKey, makeSocket = address => new WebSocket(address)}) {
  const address = new URL(url.replace(/^http/, 'ws') + '/realtime/v1/websocket');
  address.searchParams.set('apikey', publicKey);
  address.searchParams.set('vsn', '1.0.0');
  let current = null;

  function disconnect(owner) {
    if (!current || (owner && current.owner !== owner)) return;
    const previous = current;
    current = null;
    clearTimeout(previous.connectionTimeout);
    clearInterval(previous.heartbeat);
    previous.ws.close();
  }

  function connect({owner, token, topics, onUpdate}) {
    if (current?.owner === owner && current.token === token) return;
    disconnect();

    const ws = makeSocket(address.href);
    const state = {owner, token, ws, ready: new Set(), heartbeatRef: null};
    current = state;
    let ref = 0;
    function send(topic, event, payload) {
      const id = String(++ref);
      ws.send(JSON.stringify({topic, event, payload, ref: id}));
      return id;
    }

    state.connectionTimeout = setTimeout(() => {
      if (current === state) disconnect(owner);
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (current !== state) return;
      clearTimeout(state.connectionTimeout);
      for (const {topic, changes = [], isPrivate = false} of topics) {
        send(topic, 'phx_join', {
          config: {
            broadcast: {ack: false, self: false},
            presence: {key: ''},
            postgres_changes: changes,
            private: isPrivate
          },
          access_token: token
        });
      }
      state.heartbeat = setInterval(() => {
        if (current !== state) return;
        if (state.heartbeatRef !== null) {
          disconnect(owner);
          return;
        }
        state.heartbeatRef = send('phoenix', 'heartbeat', {});
      }, HEARTBEAT_MS);
    };

    ws.onmessage = ({data}) => {
      if (current !== state) return;
      let message;
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (message?.topic === 'phoenix' && message.event === 'phx_reply') {
        if (message.ref === state.heartbeatRef) state.heartbeatRef = null;
        return;
      }
      const joined = topics.find(({topic}) => topic === message?.topic);
      if (!joined) return;

      if (message.event === 'phx_reply' && message.payload?.status === 'ok') {
        if (state.ready.has(message.topic)) return;
        state.ready.add(message.topic);
        onUpdate();
      } else if (message.event === 'postgres_changes' || message.event === 'broadcast') {
        onUpdate();
      } else if (message.event === 'phx_close' || message.event === 'phx_error') {
        if (state.ready.delete(message.topic)) disconnect(owner);
      }
    };

    ws.onclose = () => {
      if (current === state) {
        clearTimeout(state.connectionTimeout);
        clearInterval(state.heartbeat);
        current = null;
      }
    };
    ws.onerror = () => {
      if (current === state) disconnect(owner);
    };
  }

  function isReady(owner, topic) {
    if (current?.owner !== owner) return false;
    return topic ? current.ready.has(topic) : current.ready.size > 0;
  }

  return {connect, disconnect, isReady};
}
