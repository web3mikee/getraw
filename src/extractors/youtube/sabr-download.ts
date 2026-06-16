import { SabrStream } from "googlevideo/sabr-stream";
import { buildSabrFormat } from "googlevideo/utils";
import { Innertube, Platform } from "youtubei.js";
import type { Format } from "../../core/types";
import { writeFileSync, appendFileSync, unlinkSync, existsSync } from "fs";

// Bun-native eval for youtubei.js player script execution
Platform.shim.eval = async (data: { output: string }) => {
  const code = data.output + "\nreturn { ...exportedVars };";
  return new Function(code)();
};

let _yt: Awaited<ReturnType<typeof Innertube.create>> | null = null;

async function getYt() {
  if (!_yt) {
    _yt = await Innertube.create();
  }
  return _yt;
}

export interface SabrDownloadResult {
  videoPath: string | null;
  audioPath: string | null;
  selectedVideoItag: number | null;
  selectedAudioItag: number | null;
}

export async function downloadViaSabr(
  videoId: string,
  outputPath: string,
  options: {
    videoQuality?: string;
    onProgress?: (bytes: number, type: "video" | "audio") => void;
  } = {},
): Promise<SabrDownloadResult> {
  const yt = await getYt();
  const info = await yt.getInfo(videoId);

  const streamingUrl = await yt.session.player?.decipher(
    info.streaming_data?.server_abr_streaming_url,
  );

  const uConfig =
    (info as unknown as Record<string, unknown>).page?.[0]?.player_config
      ?.media_common_config?.media_ustreamer_request_config
      ?.video_playback_ustreamer_config;

  if (!streamingUrl) {
    throw new Error("No SABR streaming URL available");
  }

  const sabrFormats =
    info.streaming_data?.adaptive_formats?.map((f: unknown) =>
      buildSabrFormat(f),
    ) ?? [];

  if (sabrFormats.length === 0) {
    throw new Error("No adaptive formats available for SABR");
  }

  const sabr = new SabrStream({
    formats: sabrFormats,
    serverAbrStreamingUrl: streamingUrl,
    videoPlaybackUstreamerConfig: uConfig,
    durationMs: (info.basic_info.duration ?? 0) * 1000,
    clientInfo: {
      clientName: 1,
      clientVersion: yt.session.context.client.clientVersion,
    },
  });

  const { videoStream, audioStream, selectedFormats } = await sabr.start({
    videoQuality: options.videoQuality ?? "720p",
    audioQuality: "AUDIO_QUALITY_MEDIUM",
  });

  const videoPath = outputPath.replace(/\.[^.]+$/, ".video.mp4");
  const audioPath = outputPath.replace(/\.[^.]+$/, ".audio.m4a");

  // Download video stream
  if (existsSync(videoPath)) unlinkSync(videoPath);
  const videoReader = videoStream.getReader();
  let videoBytes = 0;
  while (true) {
    const { done, value } = await videoReader.read();
    if (done) break;
    appendFileSync(videoPath, value);
    videoBytes += value.byteLength;
    options.onProgress?.(videoBytes, "video");
  }

  // Download audio stream
  if (existsSync(audioPath)) unlinkSync(audioPath);
  const audioReader = audioStream.getReader();
  let audioBytes = 0;
  while (true) {
    const { done, value } = await audioReader.read();
    if (done) break;
    appendFileSync(audioPath, value);
    audioBytes += value.byteLength;
    options.onProgress?.(audioBytes, "audio");
  }

  return {
    videoPath: videoBytes > 0 ? videoPath : null,
    audioPath: audioBytes > 0 ? audioPath : null,
    selectedVideoItag: selectedFormats.videoFormat?.itag ?? null,
    selectedAudioItag: selectedFormats.audioFormat?.itag ?? null,
  };
}

export async function getSabrFormats(videoId: string): Promise<Format[]> {
  const yt = await getYt();
  const info = await yt.getInfo(videoId);

  const adaptiveFormats = info.streaming_data?.adaptive_formats ?? [];
  const formats: Format[] = [];

  for (const f of adaptiveFormats) {
    const raw = f as unknown as Record<string, unknown>;
    const mime = String(raw.mime_type ?? "");
    const mimeMatch = mime.match(/^(video|audio)\/(\w+);\s*codecs="([^"]+)"/);
    const ext = mimeMatch?.[2] ?? "mp4";
    const codecs = mimeMatch?.[3] ?? "";
    const isVideo = mime.startsWith("video");
    const isAudio = mime.startsWith("audio");

    formats.push({
      format_id: String(raw.itag ?? ""),
      url: "sabr://requires-sabr-download",
      ext: isAudio && ext === "mp4" ? "m4a" : ext,
      vcodec: isVideo ? codecs.split(",")[0]?.trim() : "none",
      acodec: isAudio
        ? codecs
        : isVideo && codecs.includes(",")
          ? codecs.split(",")[1]?.trim()
          : undefined,
      width: (raw.width as number) ?? undefined,
      height: (raw.height as number) ?? undefined,
      fps: (raw.fps as number) ?? undefined,
      tbr: raw.bitrate
        ? Math.round((raw.bitrate as number) / 1000)
        : undefined,
      filesize: raw.content_length
        ? parseInt(String(raw.content_length), 10)
        : undefined,
      format_note: String(raw.quality_label ?? raw.quality ?? ""),
      audio_channels: (raw.audio_channels as number) ?? undefined,
      protocol: "sabr",
    });
  }

  return formats;
}
