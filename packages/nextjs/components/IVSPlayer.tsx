"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Import the SDK types if needed
import type { Player as IVSPlayerType } from "amazon-ivs-player";

export default function IVSPlayer({ playbackUrl }: { playbackUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<IVSPlayerType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isMuted, setIsMuted] = useState(true); // Start muted for autoplay to work
  const [error, setError] = useState<string | null>(null);

  // Format time helper
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Hide controls after delay
  const hideControlsAfterDelay = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying]);

  // Show controls
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    hideControlsAfterDelay();
  }, [hideControlsAfterDelay]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pause();
      } else {
        playerRef.current.play();
      }
    }
  }, [isPlaying]);

  // Handle seek
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number.parseFloat(e.target.value);
    if (playerRef.current) {
      playerRef.current.seekTo(newTime);
      setCurrentTime(newTime);
    }
  }, []);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number.parseFloat(e.target.value);
    if (playerRef.current) {
      playerRef.current.setVolume(newVolume);
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (playerRef.current) {
      if (isMuted) {
        playerRef.current.setVolume(volume || 0.5);
        setIsMuted(false);
      } else {
        playerRef.current.setVolume(0);
        setIsMuted(true);
      }
    }
  }, [isMuted, volume]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if ((containerRef.current as any).webkitRequestFullscreen) {
        (containerRef.current as any).webkitRequestFullscreen();
      } else if ((containerRef.current as any).msRequestFullscreen) {
        (containerRef.current as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  }, [isFullscreen]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).msFullscreenElement
        ),
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("msfullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    let timeUpdateInterval: NodeJS.Timeout | null = null;
    let errorCheckInterval: NodeJS.Timeout | null = null;
    let handleStateChange: ((state: any) => void) | null = null;
    let handlePlayerError: ((error: any) => void) | null = null;
    let cleanupVideoListeners: (() => void) | null = null;

    // Dynamic import to ensure the SDK only loads in the browser
    const initPlayer = async () => {
      try {
        setError(null);
        const IVSPlayerSDK = (await import("amazon-ivs-player")).default;

        if (!IVSPlayerSDK.isPlayerSupported) {
          setError("IVS Player is not supported in this browser");
          return;
        }

        if (!videoRef.current) {
          setError("Video element not available");
          return;
        }

        const player = IVSPlayerSDK.create({
          wasmWorker: "/amazon-ivs-wasmworker.min.js",
          wasmBinary: "/amazon-ivs-wasmworker.min.wasm",
        });
        playerRef.current = player;

        player.attachHTMLVideoElement(videoRef.current);

        // Set up event listeners
        handleStateChange = (state: any) => {
          if (state === "playing" || state === "PLAYING") {
            setIsPlaying(true);
          } else if (
            state === "paused" ||
            state === "PAUSED" ||
            state === "idle" ||
            state === "IDLE" ||
            state === "buffering" ||
            state === "BUFFERING"
          ) {
            setIsPlaying(false);
          }
        };

        // Listen to PlayerState events - using video element events as primary
        // IVS Player events may vary by SDK version
        try {
          player.addEventListener("PlayerState" as any, handleStateChange);
        } catch {
          // Fallback to video element events if PlayerState event doesn't work
          console.warn("Could not add PlayerState listener, using video element events");
        }

        // Listen to IVS Player error events
        handlePlayerError = (error: any) => {
          console.error("IVS Player error:", error);
          let errorMessage = "Failed to load video stream";

          // Parse error details
          if (
            error?.code === 404 ||
            error?.message?.includes("404") ||
            error?.message?.includes("Failed to load playlist")
          ) {
            errorMessage = "Stream not available (404). The stream may be offline or the URL is incorrect.";
          } else if (error?.code === 403 || error?.message?.includes("403")) {
            errorMessage = "Access denied (403). You may not have permission to view this stream.";
          } else if (error?.code === "ErrorNotAvailable") {
            errorMessage = "Stream is not available. The stream may be offline.";
          } else if (error?.message) {
            errorMessage = `Stream error: ${error.message}`;
          }

          setError(errorMessage);
          setIsPlaying(false);
        };

        // Try to listen to IVS player error events
        try {
          // IVS Player may have different error event names depending on version
          player.addEventListener("Error" as any, handlePlayerError);
          player.addEventListener("ErrorEvent" as any, handlePlayerError);
          player.addEventListener("error" as any, handlePlayerError);
        } catch {
          console.warn("Could not add IVS Player error listener");
        }

        // Also listen to video element events as fallback
        if (videoRef.current) {
          const handlePlay = () => setIsPlaying(true);
          const handlePause = () => setIsPlaying(false);
          const handleTimeUpdate = () => {
            if (playerRef.current && videoRef.current) {
              const time = playerRef.current.getPosition();
              if (time !== null && !isNaN(time)) {
                setCurrentTime(time);
              }
            }
          };
          const handleLoadedMetadata = () => {
            if (playerRef.current) {
              const dur = playerRef.current.getDuration();
              if (dur !== null && !isNaN(dur)) {
                setDuration(dur);
              }
            }
          };
          const handleError = (e: Event) => {
            console.error("Video element error:", e);
            const videoError = videoRef.current?.error;
            let errorMessage = "Failed to load video stream";

            if (videoError) {
              switch (videoError.code) {
                case videoError.MEDIA_ERR_ABORTED:
                  errorMessage = "Video loading was aborted";
                  break;
                case videoError.MEDIA_ERR_NETWORK:
                  errorMessage = "Network error while loading video";
                  break;
                case videoError.MEDIA_ERR_DECODE:
                  errorMessage = "Error decoding video";
                  break;
                case videoError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                  errorMessage = "Video format not supported";
                  break;
              }
            }

            setError(errorMessage);
          };

          videoRef.current.addEventListener("play", handlePlay);
          videoRef.current.addEventListener("pause", handlePause);
          videoRef.current.addEventListener("timeupdate", handleTimeUpdate);
          videoRef.current.addEventListener("loadedmetadata", handleLoadedMetadata);
          videoRef.current.addEventListener("error", handleError);

          // Store cleanup functions
          cleanupVideoListeners = () => {
            if (videoRef.current) {
              videoRef.current.removeEventListener("play", handlePlay);
              videoRef.current.removeEventListener("pause", handlePause);
              videoRef.current.removeEventListener("timeupdate", handleTimeUpdate);
              videoRef.current.removeEventListener("loadedmetadata", handleLoadedMetadata);
              videoRef.current.removeEventListener("error", handleError);
            }
          };

          // Update current time and duration periodically
          timeUpdateInterval = setInterval(() => {
            if (playerRef.current) {
              const time = playerRef.current.getPosition();
              if (time !== null && !isNaN(time)) {
                setCurrentTime(time);
              }
              const dur = playerRef.current.getDuration();
              if (dur !== null && !isNaN(dur) && dur > 0) {
                setDuration(dur);
              }
            }
          }, 100);

          // Validate URL before loading
          if (!playbackUrl || playbackUrl.trim() === "") {
            setError("No playback URL provided");
            return;
          }

          // Load the stream and wait for it to be ready before playing
          try {
            player.load(playbackUrl);
          } catch (err) {
            console.error("Failed to load stream:", err);
            setError(`Failed to load stream: ${err instanceof Error ? err.message : "Unknown error"}`);
            return;
          }

          // Wait for the player to be ready before playing
          const tryPlay = () => {
            if (playerRef.current && videoRef.current) {
              try {
                playerRef.current.play();
              } catch (err) {
                console.error("Play failed:", err);
                setError("Failed to start playback. Try clicking the play button.");
              }
            }
          };

          // Monitor for playback stopping due to errors
          let lastState: string | null = null;

          const checkForErrors = () => {
            if (playerRef.current && videoRef.current) {
              const currentState = String(playerRef.current.getState?.() || "");
              // If player was playing but now stopped unexpectedly
              // Note: We check videoRef.current directly instead of isPlaying state
              // to avoid dependency issues
              if (lastState === "playing" && currentState === "idle" && !videoRef.current.paused) {
                // Check if there's an error
                const videoError = videoRef.current.error;
                if (videoError) {
                  setError("Playback stopped due to an error. The stream may be unavailable.");
                }
              }
              lastState = currentState;
            }
          };

          // Try to play immediately, but also set up a listener for when the stream is ready
          const readyState = videoRef.current.readyState;
          if (readyState >= 2) {
            // HAVE_CURRENT_DATA or higher
            tryPlay();
          } else {
            videoRef.current.addEventListener("canplay", tryPlay, { once: true });
            videoRef.current.addEventListener("loadeddata", tryPlay, { once: true });
          }

          // Check for errors periodically (only if getState is available)
          if (playerRef.current && typeof playerRef.current.getState === "function") {
            errorCheckInterval = setInterval(checkForErrors, 1000);
          }
        }
      } catch (err) {
        console.error("Failed to initialize IVS player:", err);
        setError(`Failed to initialize player: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };

    initPlayer();

    return () => {
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
      }
      if (errorCheckInterval) {
        clearInterval(errorCheckInterval);
      }
      if (cleanupVideoListeners) {
        cleanupVideoListeners();
      }
      if (playerRef.current) {
        if (handleStateChange) {
          try {
            playerRef.current.removeEventListener("PlayerState" as any, handleStateChange);
          } catch {
            // Ignore if event listener wasn't added
          }
        }
        if (handlePlayerError) {
          try {
            playerRef.current.removeEventListener("Error" as any, handlePlayerError);
            playerRef.current.removeEventListener("ErrorEvent" as any, handlePlayerError);
            playerRef.current.removeEventListener("error" as any, handlePlayerError);
          } catch {
            // Ignore if event listener wasn't added
          }
        }
        playerRef.current.delete();
        playerRef.current = null;
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [playbackUrl]);

  // Auto-hide controls when playing
  useEffect(() => {
    if (isPlaying) {
      hideControlsAfterDelay();
    } else {
      setShowControls(true);
    }
  }, [isPlaying, hideControlsAfterDelay]);

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black group"
      style={{ aspectRatio: "16/9" }}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={isMuted}
        className="w-full h-full block"
        onClick={togglePlayPause}
      />

      {/* Error message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
          <div className="text-center p-4">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={togglePlayPause} className="btn btn-primary">
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-end">
          <button
            onClick={toggleFullscreen}
            className="btn btn-ghost btn-sm text-white hover:bg-white/20"
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          {/* Progress bar */}
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #00ff41 0%, #00ff41 ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.2) ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.2) 100%)`,
            }}
          />

          <div className="flex items-center gap-4">
            {/* Play/Pause button */}
            <button
              onClick={togglePlayPause}
              className="btn btn-ghost btn-sm text-white hover:bg-white/20"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Volume control */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="btn btn-ghost btn-sm text-white hover:bg-white/20"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                    />
                  </svg>
                ) : volume < 0.5 ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #00ff41 0%, #00ff41 ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) 100%)`,
                }}
              />
            </div>

            {/* Time display */}
            <div className="text-white text-sm font-mono ml-auto">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #00ff41;
          cursor: pointer;
        }

        input[type="range"]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #00ff41;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
