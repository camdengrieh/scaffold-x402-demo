"use client";

import { useEffect, useRef } from "react";
// Import the SDK types if needed
import type { Player as IVSPlayerType } from "amazon-ivs-player";

export default function IVSPlayer({ playbackUrl }: { playbackUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<IVSPlayerType | null>(null);

  useEffect(() => {
    // Dynamic import to ensure the SDK only loads in the browser
    const initPlayer = async () => {
      const IVSPlayerSDK = (await import("amazon-ivs-player")).default;

      if (IVSPlayerSDK.isPlayerSupported && videoRef.current) {
        const player = IVSPlayerSDK.create({
          wasmWorker: "/amazon-ivs-wasmworker.min.js",
          wasmBinary: "/amazon-ivs-wasmworker.min.wasm",
        });
        playerRef.current = player;

        player.attachHTMLVideoElement(videoRef.current);
        player.load(playbackUrl);
        player.play();
      }
    };

    initPlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.delete();
      }
    };
  }, [playbackUrl]);

  return (
    <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
      <video ref={videoRef} playsInline autoPlay muted style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
