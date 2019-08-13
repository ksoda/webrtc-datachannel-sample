import "./style.css";
import Peer, { DataConnection } from "skyway-js";
import * as React from "react";
import { useCallback, useState, useEffect, useRef } from "react";
import { render } from "react-dom";
import qs from "qs";

type PeerId = string;
type Payload = string;
const peer = new Peer({
  key: process.env.SKYWAY_KEY!,
  debug: 3
});

const PeerField: React.FC<{ peer: URL }> = ({ peer }) => {
  const inputEl = useRef<HTMLInputElement | null>(null);

  const copy = useCallback(() => {
    if (!inputEl.current) return;
    inputEl.current.select();
    document.execCommand("copy");
  }, [inputEl]);
  return (
    <div>
      peer: <input ref={inputEl} readOnly type="text" value={peer.toString()} />
      <button onClick={copy}> Copy </button>
    </div>
  );
};

const App: React.FC<{ peer: Peer }> = () => {
  const [selfURL, setSelfURL] = useState<URL | null>(null);
  const [conn, setConnection] = useState<DataConnection | null>(null);
  useEffect(() => {
    peer.once("open", (id: PeerId) => {
      console.info(id);
      const selfURL = new URL(location.toString());
      selfURL.search = qs.stringify({ remote: id }, { addQueryPrefix: true });
      setSelfURL(selfURL);
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

    const { remote } = qs.parse(location.search, { ignoreQueryPrefix: true });
    console.log("remote", remote, peer);
    if (!remote) return;
    setTimeout(() => {
      // Wait peer
      if (!peer) console.error("Failed to Initialize Peer");
      const c = dataConnection(peer, remote);
      console.log("conn", c);
      if (c === undefined) return;
      bindConnectionEvent(c, { onClose: () => setConnection(null) });
      setConnection(c);
    }, 500);
  }, []);

  return (
    <>
      {selfURL ? <PeerField peer={selfURL} /> : null}
      <div>
        <button
          disabled={!conn}
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
  if (
    Notification.permission !== "granted" &&
    Notification.permission !== "denied"
  )
    notify("Hello");
  if (notificationSupported()) {
    console.log("Service Worker and Push is supported");

    navigator.serviceWorker
      .register("sw.js")
      .then(function(swReg) {
        console.log("Service Worker is registered", swReg);
      })
      .catch(function(error) {
        console.error("Service Worker Error", error);
      });
  } else {
    console.warn("Push messaging is not supported");
  }
});

function notify(msg: string) {
  if (process.env.__DEV__) return console.log(msg);
  if (!notificationSupported()) return alert(msg);
  switch (Notification.permission) {
    case "denied":
      alert(msg);
      break;
    case "granted":
      navigator.serviceWorker.ready.then(function(registration) {
        registration.showNotification(msg);
      });
      break;
    case "default":
      Notification.requestPermission(function(permission) {
        if (permission === "granted") notify(msg);
      });
      break;
  }
}

function notificationSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}
