'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Headphones,
} from 'lucide-react';

interface InteractiveAudioPlayerProps {
  taskId: string;
  fileName?: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onTimeUpdate?: (seconds: number) => void;
}

export function InteractiveAudioPlayer({
  taskId,
  fileName,
  audioRef,
  onTimeUpdate,
}: InteractiveAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);

  // High-precision (60fps) audio time synchronization during playback
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastTime = -1;

    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        const cur = audioRef.current.currentTime;
        if (Math.abs(cur - lastTime) >= 0.025) {
          lastTime = cur;
          setCurrentTime(cur);
          onTimeUpdate?.(cur);
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, onTimeUpdate, audioRef]);

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '00:00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      onTimeUpdate?.(newTime);
    }
  };

  const jumpSeconds = (delta: number) => {
    if (!audioRef.current) return;
    const target = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta));
    audioRef.current.currentTime = target;
    setCurrentTime(target);
    onTimeUpdate?.(target);
  };

  const changePlaybackRate = (rate: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      if (val === 0) {
        setIsMuted(true);
      } else if (isMuted) {
        setIsMuted(false);
      }
    }
  };

  return (
    <div
      className="p-4 rounded-2xl border space-y-3 transition-all shadow-sm"
      style={{
        backgroundColor: 'var(--bg-input)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Hidden audio element streaming from Range 206 endpoint */}
      <audio
        ref={audioRef}
        src={`/api/tasks/${taskId}/audio`}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onSeeked={() => {
          if (audioRef.current) {
            const cur = audioRef.current.currentTime;
            setCurrentTime(cur);
            onTimeUpdate?.(cur);
          }
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            const cur = audioRef.current.currentTime;
            setCurrentTime(cur);
            onTimeUpdate?.(cur);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
          }
        }}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Top Header: Track Name & Status */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 truncate font-medium" style={{ color: 'var(--text-main)' }}>
          <Headphones className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />
          <span className="truncate">{fileName || '原聲音檔播放'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--primary)' }} className="font-semibold">
            {formatSeconds(currentTime)}
          </span>
          <span>/</span>
          <span>{formatSeconds(duration)}</span>
        </div>
      </div>

      {/* Timeline Slider */}
      <div className="relative flex items-center">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-2 rounded-lg cursor-pointer accent-[var(--primary)]"
          style={{
            backgroundColor: 'var(--border)',
            accentColor: 'var(--primary)',
          }}
        />
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Playback & Jump Controls */}
        <div className="flex items-center gap-2">
          {/* Jump -5s */}
          <button
            type="button"
            onClick={() => jumpSeconds(-5)}
            className="p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-main)',
            }}
            title="倒退 5 秒"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[10px]">-5s</span>
          </button>

          {/* Main Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-md transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-fg)',
            }}
            title={isPlaying ? '暫停播放' : '播放音訊'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Jump +5s */}
          <button
            type="button"
            onClick={() => jumpSeconds(5)}
            className="p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-main)',
            }}
            title="快轉 5 秒"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px]">+5s</span>
          </button>
        </div>

        {/* Speed Rate Selectors */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] mr-1 hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
            倍速:
          </span>
          {[1.0, 1.25, 1.5, 2.0].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => changePlaybackRate(rate)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                playbackRate === rate ? 'shadow-sm font-bold' : 'opacity-70 hover:opacity-100'
              }`}
              style={{
                backgroundColor: playbackRate === rate ? 'var(--primary)' : 'var(--bg-card)',
                color: playbackRate === rate ? 'var(--primary-fg)' : 'var(--text-main)',
                border: playbackRate === rate ? 'none' : '1px solid var(--border)',
              }}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Volume & Link */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-lg hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
            title={isMuted ? '解除靜音' : '靜音'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1.5 rounded cursor-pointer accent-[var(--primary)]"
            style={{
              backgroundColor: 'var(--border)',
              accentColor: 'var(--primary)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
