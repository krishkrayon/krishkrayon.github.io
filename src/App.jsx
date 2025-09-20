import { useEffect, useRef, useState } from "react";

const DEVICE_ID = "esp32-relay-kr-01";
const WS_URL = "wss://broker.hivemq.com:8884/mqtt";

const BASE = `iot/relay/${DEVICE_ID}`;
const T_STATUS = `${BASE}/status`;
const T_STATE  = `${BASE}/state`;
const T_SCHED  = `${BASE}/sched`;
const T_SCHED_SET = `${BASE}/sched/set`;
const T_CMD    = (ch) => `${BASE}/cmd/${ch}`;

const emptySched = () => ([
  { en:false, on:"07:00", off:"22:30" },
  { en:false, on:"07:00", off:"22:30" },
  { en:false, on:"07:00", off:"22:30" },
  { en:false, on:"07:00", off:"22:30" },
]);

export default function App() {
  const clientRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [states, setStates] = useState([0,0,0,0]);
  const [sched, setSched] = useState(emptySched());
  const [log, setLog] = useState([]);
  const addLog = (...a) => setLog((L) => [...L, a.join(" ")]);

  useEffect(() => {
    const mqtt = window.mqtt;
    if (!mqtt) { addLog("MQTT.js not found"); return; }
    const clientId = "web-"+Math.random().toString(16).slice(2);
    addLog("Connecting:", WS_URL, "clientId:", clientId);

    const client = mqtt.connect(WS_URL, {
      clientId, clean:true, connectTimeout:8000, reconnectPeriod:2000
    });
    clientRef.current = client;

    client.on("connect", () => {
      setConnected(true); addLog("Connected");
      client.subscribe([T_STATUS, T_STATE, T_SCHED], (err)=> {
        if (err) addLog("Subscribe error:", err.message);
        else addLog("Subscribed:", T_STATUS, T_STATE, T_SCHED);
      });
    });
    client.on("reconnect", () => addLog("Reconnecting…"));
    client.on("close", () => { setConnected(false); addLog("Closed"); });
    client.on("error", (e) => addLog("Error:", e.message));
    client.on("message", (topic, payloadBuf) => {
      const payload = payloadBuf.toString();
      addLog("RX", topic, payload);
      if (topic === T_STATUS) setDeviceOnline(payload === "online");
      else if (topic === T_STATE) {
        try {
          const j = JSON.parse(payload);
          if (Array.isArray(j.states)) setStates(j.states.map(Number));
          if (Array.isArray(j.timer)) {
            const mapped = j.timer.map(o => ({
              en: !!o.en,
              on: o.on || "07:00",
              off: o.off || "22:00",
            }));
            if (mapped.length === 4) setSched(mapped);
          }
        } catch {}
      } else if (topic === T_SCHED) {
        try {
          const j = JSON.parse(payload);
          if (Array.isArray(j.relays) && j.relays.length === 4) {
            setSched(j.relays.map(o => ({
              en: !!o.en,
              on: o.on || "07:00",
              off: o.off || "22:00",
            })));
          }
        } catch {}
      }
    });

    return () => { try { client.end(true); } catch {} };
  }, []);

  const toggle = (i) => (e) => {
    const v = e.target.checked ? "1" : "0";
    const topic = T_CMD(i);
    clientRef.current?.publish(topic, v, { qos:0, retain:false }, (err) => {
      if (err) addLog("Publish error:", err.message);
      else addLog("TX", topic, v);
    });
  };

  // timer inputs
  const onChangeTime = (i, key) => (e) => {
    const val = e.target.value; // "HH:MM"
    setSched(s => s.map((r,idx) => idx===i ? {...r, [key]:val} : r));
  };
  const onToggleEnable = (i) => (e) => {
    setSched(s => s.map((r,idx) => idx===i ? {...r, en:e.target.checked} : r));
  };
  const saveOne = (i) => () => {
    const payload = { relays: sched }; // send all 4 for simplicity
    const msg = JSON.stringify(payload);
    clientRef.current?.publish(T_SCHED_SET, msg, { qos:0, retain:false }, (err)=>{
      if (err) addLog("Save error:", err.message);
      else addLog("TX", T_SCHED_SET, msg);
    });
  };

  return (
    <div style={{fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,Arial",margin:24}}>
      <h1>Remote Relay Control (React + Timers)</h1>
      <div style={{padding:10,borderRadius:8,marginBottom:16,background:connected?"#e8f5e9":"#ffebee"}}>
        {connected ? "Connected to broker" : "Connecting…"} | Device {deviceOnline ? "online" : "offline"}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{border:"1px solid #ddd",borderRadius:12,padding:16,boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div><b>Relay {i+1}</b></div>
              <label style={{position:"relative",display:"inline-block",width:60,height:32}}>
                <input type="checkbox" checked={!!states[i]} onChange={toggle(i)} style={{display:"none"}}/>
                <span style={{position:"absolute",inset:0,background:states[i]?"#4caf50":"#ccc",transition:".2s",borderRadius:999}}/>
                <span style={{position:"absolute",height:24,width:24,left:states[i]?32:4,top:4,background:"#fff",transition:".2s",borderRadius:"50%",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
              </label>
            </div>
            <div style={{fontSize:12,color:"#555",marginTop:6}}>{states[i] ? "ON" : "OFF"}</div>

            <hr style={{margin:"12px 0"}}/>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:12,marginBottom:4}}>On time</div>
                <input type="time" value={sched[i].on} onChange={onChangeTime(i,"on")} style={{width:"100%"}}/>
              </div>
              <div>
                <div style={{fontSize:12,marginBottom:4}}>Off time</div>
                <input type="time" value={sched[i].off} onChange={onChangeTime(i,"off")} style={{width:"100%"}}/>
              </div>
            </div>

            <label style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
              <input type="checkbox" checked={sched[i].en} onChange={onToggleEnable(i)}/>
              <span>Enable timer</span>
            </label>

            <button onClick={saveOne(i)} style={{marginTop:10,padding:"8px 12px",borderRadius:8,border:"1px solid #ddd",cursor:"pointer"}}>
              Save
            </button>
          </div>
        ))}
      </div>

      <h3>Logs</h3>
      <pre style={{whiteSpace:"pre-wrap",fontFamily:"ui-monospace,Menlo,Consolas,monospace",fontSize:12,background:"#f7f7f7",padding:12,borderRadius:8,marginTop:16}}>
        {log.join("\n")}
      </pre>
    </div>
  );
}
