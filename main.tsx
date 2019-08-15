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

type DataConnectionCallbacks = {
  onClose: () => void;
  onRemoteUpdate: (b: number) => void;
};

const lengthUnit = 60;
let resetTimer: (n: number) => unknown;
const App: React.FC<{ peer: Peer }> = ({ peer }) => {
  const lengthMin = 1;
  const [selfURL, setSelfURL] = useState<URL | null>(null);
  const [conn, setConnection] = useState<DataConnection | null>(null);
  const [remoteTime, setRemoteTime] = useState<number | null>(null);
  const [length, setLength] = useState(lengthMin);
  const [lockState, lock] = useState(false);

  useEffect(() => {
    const callbacks: DataConnectionCallbacks = {
      onClose: () => setConnection(null),
      onRemoteUpdate: t => {
        setRemoteTime(t);
      }
    };
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
      bindConnectionEvent(c, callbacks);
      setConnection(c);
      lock(true);
    });
    peer.on("error", console.error);

    // Register connected peer handler
    peer.on("connection", (dataConnection: DataConnection) => {
      console.debug("connection", dataConnection);
      setConnection(dataConnection);
      bindConnectionEvent(dataConnection, callbacks);
    });
  }, []);

  return (
    <>
      {selfURL ? <PeerField peer={selfURL} autoFocus={true} /> : null}
      <Timer
        callback={() => broadcast("Time's Up", conn)}
        tick={t => {
          console.log("tick", t);
          conn && sendMessage({ control: true, body: t }, conn);
        }}
        initialTime={length}
        show={remoteTime}
        lock={lockState}
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
        ) : (
          <LengthField
            value={length}
            onChange={e => {
              const l = parseInt(e.currentTarget.value, 10);
              setLength(l);
              resetTimer(l * lengthUnit);
            }}
          />
        )}
      </footer>
    </>
  );
};

const LengthField: React.FC<{
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ value, onChange }) => {
  return (
    <>
      <input
        type="range"
        value={value}
        min="1"
        max="15"
        onChange={onChange}
        list="tickmarks"
      />
      <datalist id="tickmarks">
        <option value="1" />
        <option value="5" />
        <option value="10" />
        <option value="15" />
      </datalist>
    </>
  );
};

const PeerField: React.FC<{ peer: URL; autoFocus: boolean }> = ({
  autoFocus,
  peer
}) => {
  const inputEl = useRef<HTMLInputElement | null>(null);

  const copy = useCallback(() => {
    if (!inputEl.current) return;
    inputEl.current.select();
    document.execCommand("copy");
  }, [inputEl]);
  const share: (
    o: Partial<{ [K in "url" | "text" | "title"]: string }>
  ) => unknown | null =
    "share" in navigator && (navigator as any).share.bind(navigator);
  return (
    <div>
      peer: <input ref={inputEl} readOnly type="text" value={peer.toString()} />
      <button autoFocus={autoFocus} onClick={copy}>
        {" "}
        Copy{" "}
      </button>
      {share ? (
        <button onClick={() => share({ url: peer.toString() })}>Share</button>
      ) : null}
    </div>
  );
};

const Timer: React.FC<{
  initialTime: number;
  callback: Function;
  tick: (t: number) => void;
  show: number | null;
  lock: boolean;
}> = ({ initialTime, callback, tick, show, lock }) => {
  const len = initialTime * lengthUnit;
  const [currentTime, updateTime] = useState(len);
  const [playing, togglePlaying] = useState(false);
  const reset = (e: React.MouseEvent) => {
    e.preventDefault();
    updateTime(len);
  };
  const toggle = () => {
    console.debug(playing);
    togglePlaying(!playing);
  };

  console.log(initialTime);
  resetTimer = useCallback(x => updateTime(x), []);
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
      disabled={lock}
      onClick={toggle}
      onContextMenu={reset}
      {...useLongPress(reset, 1000)}
      style={{ fontSize: "6em", padding: "5% 20%" }}
    >
      <span>{show || currentTime}</span>
      <span
        style={{ transition: "all 1s", opacity: currentTime % 2 == 0 ? 1 : 0 }}
      >
        .{lock && "🔒"}
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
  { onClose, onRemoteUpdate }: DataConnectionCallbacks
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
