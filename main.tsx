import "./style.css";
import Peer, { DataConnection } from "skyway-js";
import * as React from "react";
import { useCallback, useState, useEffect, useRef } from "react";
import { render } from "react-dom";
import qs from "qs";

type PeerId = string;
type Payload =
  | { control: false; body: string }
  | { control: true; body: number };

const App: React.FC<{ peer: Peer }> = ({ peer }) => {
  const [selfURL, setSelfURL] = useState<URL | null>(null);
  const [conn, setConnection] = useState<DataConnection | null>(null);
  const [remoteTime, setRemoteTime] = useState<number | null>(null);
  useEffect(() => {
    peer.once("open", (id: PeerId) => {
      console.info(id);
      const selfURL = new URL(location.toString());
      selfURL.search = qs.stringify({ remote: id }, { addQueryPrefix: true });
      setSelfURL(selfURL);

      const { remote } = qs.parse(location.search, { ignoreQueryPrefix: true });
      if (!remote) {
        console.info("Failed to Initialize Peer");
        return;
      }
      const c = peer.connect(remote);
      bindConnectionEvent(c, {
        onClose: () => setConnection(null),
        onRemoteUpdate: t => {
          setRemoteTime(t);
        }
      });
      setConnection(c);
    });
    peer.on("error", console.error);

    // Register connected peer handler
    peer.on("connection", (dataConnection: DataConnection) => {
      console.debug("connection", dataConnection);
      setConnection(dataConnection);
      bindConnectionEvent(dataConnection, {
        onClose: () => setConnection(null),
        onRemoteUpdate: t => {
          setRemoteTime(t);
        }
      });
    });
  }, []);

  return (
    <>
      {selfURL ? <PeerField peer={selfURL} /> : null}
      <Timer
        callback={() => broadcast("Time's Up", conn)}
        tick={t => {
          console.log("tick", t);
          conn && sendMessage({ control: true, body: t }, conn);
        }}
        initialTime={5}
        show={remoteTime}
      />
      <footer>
        {conn ? (
          <button
            onClick={() => {
              conn.close();
              setConnection(null);
            }}
            style={{ margin: "1em" }}
          >
            Close Connection
          </button>
        ) : null}
      </footer>
    </>
  );
};

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

const Timer: React.FC<{
  initialTime: number;
  callback: Function;
  tick: (t: number) => void;
  show: number | null;
}> = ({ initialTime, callback, tick, show }) => {
  const [currentTime, updateTime] = useState(initialTime);
  const [playing, togglePlaying] = useState(false);
  const reset = (e: React.MouseEvent) => {
    e.preventDefault();
    updateTime(initialTime);
  };
  const toggle = () => {
    console.debug(playing);
    togglePlaying(!playing);
  };

  useEffect(() => {
    tick(currentTime);
    if (currentTime == 0) callback();
    if (currentTime < 1) return;
    if (!playing) return;
    const timerId = setInterval(() => {
      updateTime(currentTime - 1);
    }, 1000);

    return function cleanup() {
      clearInterval(timerId);
    };
  }, [currentTime, playing]);

  return (
    <button
      onClick={toggle}
      onContextMenu={reset}
      {...useLongPress(reset, 1000)}
      style={{ fontSize: "6em", padding: "5% 20%" }}
    >
      <span>{show || currentTime}</span>
      <span
        style={{ transition: "all 1s", opacity: currentTime % 2 == 0 ? 1 : 0 }}
      >
        .
      </span>
    </button>
  );
};

function broadcast(msg: string, conn: DataConnection | null) {
  notify(msg);
  if (conn) sendMessage({ control: false, body: msg }, conn);
}

function bindConnectionEvent(
  dataConnection: DataConnection,
  {
    onClose,
    onRemoteUpdate
  }: { onClose: () => void; onRemoteUpdate: (b: number) => void }
) {
  dataConnection.once("open", () => {
    console.info("DataConnection has been opened");
  });

  dataConnection.on("data", (data: Payload) => {
    console.debug(`Remote: ${data}`);
    if (!data.control) notify(data.body);
    else onRemoteUpdate(data.body);
  });

  dataConnection.once("close", () => {
    console.info("DataConnection has been closed");
    onClose();
  });
}

function sendMessage(msg: Payload, dataConnection: DataConnection) {
  dataConnection.send(msg);
  console.debug(`You: ${msg}`);
}

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

function useLongPress(callback: Function, ms = 1000) {
  const [startLongPress, setStartLongPress] = useState(false);

  useEffect(() => {
    const timerId = startLongPress ? setTimeout(callback, ms) : null;
    return function cleanup() {
      timerId && clearTimeout(timerId);
    };
  }, [startLongPress]);

  return {
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false)
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const peer = new Peer({
    key: process.env.SKYWAY_KEY!,
    debug: 3
  });
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
