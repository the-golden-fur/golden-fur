import { useEffect, useRef, useState } from 'react';

interface ReplayableGif {
  /** The address to show the GIF from while it is playing; null when it is
   * not playing (or when there is no GIF at all). */
  src: string | null;
  /** True for `durationMs` after each play(), even when there is no GIF -
   * lets the caller run a stand-in animation for that long instead. */
  isPlaying: boolean;
  /** Starts downloading the GIF's data ahead of the first play(). */
  preload: () => void;
  /** Plays the GIF from its first frame for `durationMs`. Calling it again
   * while it is still playing restarts it. */
  play: () => void;
}

/**
 * Plays a GIF from its FIRST frame, once per play() call, for a fixed time.
 *
 * A browser keeps one running animation per image address, so showing the
 * same address again carries on from wherever that animation had got to
 * instead of restarting. Each play() therefore hands out a brand-new address
 * (an object URL) for the same already-downloaded GIF data - which always
 * starts at frame one, and costs no extra download. The data is fetched once,
 * on preload() or the first play(); until it has arrived, play() falls back
 * to the GIF's plain address.
 */
export function useReplayableGif(
  gifUrl: string | null,
  durationMs: number
): ReplayableGif {
  const [src, setSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const dataRef = useRef<Blob | null>(null);
  const isLoadingRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  function preload() {
    if (!gifUrl || dataRef.current || isLoadingRef.current) return;

    isLoadingRef.current = true;
    fetch(gifUrl)
      .then((response) =>
        response.ok ? response.blob() : Promise.reject(new Error('failed'))
      )
      .then((data) => {
        dataRef.current = data;
      })
      .catch(() => {
        // Not fatal: play() falls back to the GIF's plain address.
        isLoadingRef.current = false;
      });
  }

  function play() {
    preload();

    const previousObjectUrl = objectUrlRef.current;
    objectUrlRef.current = dataRef.current
      ? URL.createObjectURL(dataRef.current)
      : null;

    setSrc(objectUrlRef.current ?? gifUrl);
    setIsPlaying(true);
    if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setSrc(null);
      setIsPlaying(false);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    }, durationMs);
  }

  return { src, isPlaying, preload, play };
}

/**
 * A still picture of a GIF's first frame (as a data URL), for showing an
 * animated GIF at rest. Null until the GIF has loaded, when there is no GIF,
 * or where a canvas isn't available - the caller then shows the GIF itself.
 */
export function useGifStillFrame(gifUrl: string | null): string | null {
  const [still, setStill] = useState<string | null>(null);

  useEffect(() => {
    if (!gifUrl) return;

    let isCurrent = true;
    const image = new Image();

    image.onload = () => {
      if (!isCurrent) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        // Drawing a just-loaded GIF paints its first frame.
        canvas.getContext('2d')?.drawImage(image, 0, 0);
        setStill(canvas.toDataURL('image/png'));
      } catch {
        // No canvas support - keep showing the GIF itself.
      }
    };
    image.src = gifUrl;

    return () => {
      isCurrent = false;
    };
  }, [gifUrl]);

  return gifUrl ? still : null;
}
