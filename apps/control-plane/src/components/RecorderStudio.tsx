"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Pane, Btn, ErrorState } from "./ui";

/**
 * In-dashboard recorder: capture a screen or talking-head clip with MediaRecorder,
 * trim it with ffmpeg.wasm (loaded lazily, single-threaded core so no COOP/COEP),
 * and download. Self-contained — no server, no external framework. The same web
 * primitives Builder's agent-native uses, minus the whole stack.
 */

type Mode = "idle" | "recording" | "recorded";
type Source = "screen" | "camera";

function pickMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function RecorderStudio() {
  const [mode, setMode] = useState<Mode>("idle");
  const [source, setSource] = useState<Source>("screen");
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const [trimMsg, setTrimMsg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const playbackRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    stopStream();
    if (timerRef.current) clearInterval(timerRef.current);
    blobRef.current = null;
    chunksRef.current = [];
    setBlobUrl(null);
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setElapsed(0);
    setTrimMsg("");
    setError(null);
    setMode("idle");
  }, [blobUrl, stopStream]);

  useEffect(() => () => reset(), []); // cleanup on unmount

  const start = async (src: Source) => {
    setError(null);
    setSource(src);
    try {
      const stream =
        src === "screen"
          ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
          : await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.muted = true;
        await previewRef.current.play().catch(() => {});
      }
      // If the user ends the screen share from the browser chrome, stop cleanly.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stop());

      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setMode("recorded");
        stopStream();
      };
      recorderRef.current = rec;
      rec.start();
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      setMode("recording");
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permission denied. Allow screen/camera access to record."
          : e instanceof Error
            ? e.message
            : String(e),
      );
      stopStream();
      setMode("idle");
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
  };

  const onLoaded = () => {
    const v = playbackRef.current;
    if (!v) return;
    // WebM from MediaRecorder can report Infinity duration until seeked.
    const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!d) {
      v.currentTime = 1e7;
      v.addEventListener(
        "timeupdate",
        function once() {
          v.currentTime = 0;
          const dd = isFinite(v.duration) ? v.duration : 0;
          setDuration(dd);
          setTrimEnd(dd);
          v.removeEventListener("timeupdate", once);
        },
        { once: true },
      );
      return;
    }
    setDuration(d);
    setTrimEnd(d);
  };

  const trim = async () => {
    if (!blobRef.current || trimming) return;
    if (trimEnd - trimStart < 0.2) {
      setError("Trim range is too short.");
      return;
    }
    setTrimming(true);
    setError(null);
    setTrimMsg("Loading the trimmer (first run downloads ~30 MB)…");
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      });
      setTrimMsg("Trimming…");
      await ffmpeg.writeFile("in.webm", await fetchFile(blobRef.current));
      await ffmpeg.exec(["-ss", String(trimStart), "-to", String(trimEnd), "-i", "in.webm", "-c", "copy", "out.webm"]);
      const data = (await ffmpeg.readFile("out.webm")) as Uint8Array;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/webm" });
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setDuration(trimEnd - trimStart);
      setTrimStart(0);
      setTrimEnd(trimEnd - trimStart);
      setTrimMsg("Trimmed ✓");
    } catch (e) {
      setError(`Trim failed: ${e instanceof Error ? e.message : String(e)}`);
      setTrimMsg("");
    } finally {
      setTrimming(false);
    }
  };

  const download = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `clip-${source}-${Date.now()}.webm`;
    a.click();
  };

  const sliderStyle = { width: "100%", accentColor: "var(--teal)" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 880 }}>
      <Pane title="Record" accent="var(--teal)" label="SCREEN · CAMERA">
        {error && <div style={{ marginBottom: 14 }}><ErrorState title="Recorder" reasons={[error]} /></div>}

        {mode === "idle" && (
          <div>
            <p style={{ color: "var(--fg-dim)", fontSize: "var(--t-sm)", margin: "0 0 16px" }}>
              Capture a screen walkthrough or a talking-head clip, trim it, and download — all in the browser. Nothing is uploaded.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Btn kind="primary" icon="post" onClick={() => start("screen")}>
                Record screen
              </Btn>
              <Btn kind="solid" icon="video" onClick={() => start("camera")}>
                Record camera
              </Btn>
            </div>
          </div>
        )}

        {mode === "recording" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--danger)", boxShadow: "0 0 8px var(--danger)", animation: "pulse-dot 1.4s infinite" }} />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--t-md)" }}>Recording {source}</span>
              <span className="mono tnum" style={{ marginLeft: "auto", color: "var(--fg-dim)" }}>{fmt(elapsed)}</span>
            </div>
            <video ref={previewRef} playsInline muted style={{ width: "100%", borderRadius: "var(--r-md)", background: "#000", maxHeight: 420 }} />
            <div style={{ marginTop: 12 }}>
              <Btn kind="danger" icon="ban" onClick={stop}>
                Stop recording
              </Btn>
            </div>
          </div>
        )}

        {mode === "recorded" && blobUrl && (
          <div>
            <video ref={playbackRef} src={blobUrl} controls onLoadedMetadata={onLoaded} style={{ width: "100%", borderRadius: "var(--r-md)", background: "#000", maxHeight: 420 }} />
            <div style={{ marginTop: 14, padding: 14, background: "var(--ink-900)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-xs)", color: "var(--muted)", marginBottom: 6 }}>
                <span>Trim · {fmt(trimStart)} → {fmt(trimEnd)}</span>
                <span>length {fmt(duration)}</span>
              </div>
              <label style={{ display: "block", fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>START</label>
              <input type="range" min={0} max={duration || 0} step={0.1} value={trimStart} onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.2))} style={sliderStyle} />
              <label style={{ display: "block", fontSize: 10, color: "var(--muted)", margin: "8px 0 2px" }}>END</label>
              <input type="range" min={0} max={duration || 0} step={0.1} value={trimEnd} onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.2))} style={sliderStyle} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <Btn kind="solid" icon="clip" onClick={trim} disabled={trimming || (trimStart === 0 && Math.abs(trimEnd - duration) < 0.15)}>
                {trimming ? "Trimming…" : "Trim to selection"}
              </Btn>
              <Btn kind="primary" icon="send" onClick={download}>
                Download
              </Btn>
              <Btn kind="ghost" icon="refresh" onClick={reset}>
                New recording
              </Btn>
              {trimMsg && <span style={{ fontSize: "var(--t-xs)", color: "var(--fg-dim)" }}>{trimMsg}</span>}
            </div>
          </div>
        )}
      </Pane>

      <Pane title="Notes" pad>
        <ul style={{ color: "var(--fg-dim)", fontSize: "var(--t-sm)", lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
          <li>Recording runs entirely in your browser — clips never leave your machine unless you download them.</li>
          <li>Output is WebM. For TikTok you can drop the WebM straight into CapCut/the TikTok app, which transcodes to MP4.</li>
          <li>Trimming downloads the ffmpeg core (~30&nbsp;MB) the first time, then caches it.</li>
          <li>Screen capture grabs system audio; camera mode grabs your mic.</li>
        </ul>
      </Pane>
    </div>
  );
}
