import "./style.css";
import Peer, { DataConnection } from "skyway-js";
import * as React from "react";
import { useCallback, useState, useEffect, useRef } from "react";
import { render } from "react-dom";

type PeerId = string;
type Payload = string;
const peer = new Peer({
  key: process.env.SKYWAY_KEY!,
  debug: 3
});

const PeerField: React.FC<{ peer: PeerId }> = ({ peer }) => {
  const inputEl = useRef<HTMLInputElement | null>(null);

  const copy = useCallback(() => {
    if (!inputEl.current) return;
    inputEl.current.select();
    document.execCommand("copy");
  }, [inputEl]);
  return (
    <div>
      peer: <input ref={inputEl} readOnly type="text" value={peer} />
      <button onClick={copy}> Copy </button>
    </div>
  );
};

const App: React.FC<{ peer: Peer }> = () => {
  const [peerId, setPeerId] = useState<PeerId | null>(null);
  const [conn, setConnection] = useState<DataConnection | null>(null);
  useEffect(() => {
    peer.once("open", (id: PeerId) => {
      console.info(id);
      setPeerId(id);
    });
    peer.on("error", console.error);

    // Register connected peer handler
    peer.on("connection", (dataConnection: DataConnection) => {
      console.debug("connection", dataConnection);
      setConnection(dataConnection);
      bindConnectionEvent(dataConnection, {
        onClose: () => setConnection(null)
      });
    });
  }, []);
  const updateConnection = useCallback(e => {
    if (!!conn) return;
    if (e.currentTarget.value.length === 0) return;
    const c = dataConnection(peer, e.currentTarget.value);
    if (c === undefined) return;
    bindConnectionEvent(c, { onClose: () => setConnection(null) });
    setConnection(c);
  }, []);

  return (
    <>
      {peerId ? <PeerField peer={peerId} /> : null}
      remote: <input type="text" readOnly={!!conn} onBlur={updateConnection} />
      <div>
        <button
          onClick={() => conn && sendMessage(conn)}
          style={{ fontSize: "xx-large", padding: ".5em 1em" }}
        >
          Send
        </button>
      </div>
      <footer>
        {conn ? (
          <button
            onClick={() => {
              conn.close();
              // if success
              setConnection(null);
            }}
            style={{ margin: "1em" }}
          >
            Close
          </button>
        ) : null}
      </footer>
    </>
  );
};

function dataConnection(
  peer: Peer,
  peerId: PeerId
): DataConnection | undefined {
  // Note that you need to ensure the peer has connected to signaling server
  // before using methods of peer instance.
  if (!peer.open) {
    return;
  }
  return peer.connect(peerId);
}

function bindConnectionEvent(
  dataConnection: DataConnection,
  { onClose }: { onClose: Function }
) {
  dataConnection.once("open", () => {
    console.info("DataConnection has been opened");
  });

  dataConnection.on("data", (data: Payload) => {
    console.debug(`Remote: ${data}`);
    notify(data);
  });

  dataConnection.once("close", x => {
    console.info("DataConnection has been closed");
    onClose(x);
  });
}

function sendMessage(dataConnection: DataConnection) {
  const data: Payload = "Ping";
  dataConnection.send(data);
  console.debug(`You: ${data}`);
}

document.addEventListener("DOMContentLoaded", () => {
  render(<App peer={peer} />, document.querySelector("main"));
});

window.addEventListener("load", () => {
  notify("Hello");
});

function notify(msg: string) {
  if (process.env.__DEV__) return console.log(msg);
  if (!("Notification" in window)) {
    alert("Unsupported Browser");
  } else if (Notification.permission === "granted") {
    new Notification(msg);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission(function(permission) {
      if (permission === "granted") {
        notify(msg);
      }
    });
  }
}
