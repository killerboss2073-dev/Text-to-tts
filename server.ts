import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { GoogleGenAI } from "@google/genai";
import { Communicate } from "edge-tts-universal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Microsoft Edge TTS Voice Profiles
const EDGE_VOICE_MAP: Record<string, { voice: string; defaultRate: number; defaultPitch: number }> = {
  thiha: { voice: "my-MM-ThihaNeural", defaultRate: 0, defaultPitch: 0 },       // သီဟ - Original Microsoft Edge Thiha Neural MALE
  nilar: { voice: "my-MM-NilarNeural", defaultRate: 0, defaultPitch: 0 },       // နီလာ - Original Microsoft Edge Nilar Neural FEMALE
  mgkyawthu: { voice: "it-IT-GiuseppeMultilingualNeural", defaultRate: 30, defaultPitch: 2 }, // မောင်ကျော်သူ (Giuseppe Fast Vibe ⚡ - Speed 1.3)
  mgthuta: { voice: "fr-FR-RemyMultilingualNeural", defaultRate: 30, defaultPitch: 0 },       // မောင်သုတ (Remy Fast Reviewer ⚡ - Speed 1.3)
  masumyatt: { voice: "en-US-AvaMultilingualNeural", defaultRate: 30, defaultPitch: 0 },      // မဆုမြတ် (Ava Fast Narrator ⚡ - Speed 1.3)
  koaungkyaw: { voice: "en-US-BrianMultilingualNeural", defaultRate: 60, defaultPitch: 0 },   // ကိုအောင်ကျော် (Brian Hyper Epic ⚡ - Speed 1.6)
  saicsai: { voice: "my-MM-ThihaNeural", defaultRate: 6, defaultPitch: 2 },    // ကိုစိုင်းစိုင်း - MALE
  mafoofoo: { voice: "my-MM-NilarNeural", defaultRate: -3, defaultPitch: 4 },  // မဖူးဖူး - FEMALE
  koneye: { voice: "my-MM-ThihaNeural", defaultRate: -2, defaultPitch: -5 },   // ကိုနေတိုး - MALE
  kqaung: { voice: "my-MM-ThihaNeural", defaultRate: 3, defaultPitch: -2 },    // ကိုအောင်ရဲလင်း - MALE
  komyint: { voice: "my-MM-ThihaNeural", defaultRate: 4, defaultPitch: -4 },   // ကိုမြင့်မြတ် - MALE
  mawathsu: { voice: "my-MM-NilarNeural", defaultRate: -2, defaultPitch: 2 },  // မဝတ်မှုံရွှေရည် - FEMALE
};

interface WordBoundaryItem {
  offset: number;
  duration: number;
  text: string;
}

interface SubtitleCue {
  id: number;
  startMs: number;
  endMs: number;
  startTime: string;
  endTime: string;
  text: string;
}

function formatSrtTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "," +
    String(milliseconds).padStart(3, "0")
  );
}

function getMp3ExactDurationMs(buf: Buffer): Promise<number> {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-f", "mp3",
      "-i", "pipe:0",
      "-f", "null",
      "-"
    ]);
    let stderr = "";
    ff.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    ff.on("close", () => {
      const matches = [...stderr.matchAll(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/g)];
      if (matches.length > 0) {
        const last = matches[matches.length - 1];
        const h = parseInt(last[1], 10);
        const m = parseInt(last[2], 10);
        const s = parseInt(last[3], 10);
        const ms = parseInt((last[4] || "0").padEnd(3, "0").slice(0, 3), 10);
        resolve(h * 3600000 + m * 60000 + s * 1000 + ms);
      } else {
        resolve(0);
      }
    });
    ff.on("error", () => resolve(0));
    ff.stdin.write(buf);
    ff.stdin.end();
  });
}

function generateSrtFromBoundaries(
  boundaries: WordBoundaryItem[],
  fullText: string,
  totalAudioDurationMs: number = 0
): { 
  srt: string; 
  singleLineSrt: string; 
  twoLineSrt: string; 
  wordSrt: string; 
  cues: SubtitleCue[];
  singleLineCues: SubtitleCue[];
  twoLineCues: SubtitleCue[];
} {
  // 1. Word-level exact SRT
  const wordCues: SubtitleCue[] = (boundaries || []).map((item, idx) => {
    const startMs = Math.round(item.offset / 10000);
    const endMs = Math.round((item.offset + item.duration) / 10000);
    return {
      id: idx + 1,
      startMs,
      endMs,
      startTime: formatSrtTimestamp(startMs),
      endTime: formatSrtTimestamp(endMs),
      text: item.text,
    };
  });

  const wordSrt = wordCues
    .map((c) => `${c.id}\n${c.startTime} --> ${c.endTime}\n${c.text}`)
    .join("\n\n") + "\n";

  const singleLineCues: SubtitleCue[] = [];

  if (boundaries && boundaries.length > 0) {
    let currentGroup: WordBoundaryItem[] = [];

    for (let i = 0; i < boundaries.length; i++) {
      const item = boundaries[i];
      currentGroup.push(item);

      const txt = item.text.trim();
      const groupText = currentGroup.map((w) => w.text.trim()).join(" ");
      const groupLen = groupText.length;
      const groupStartMs = Math.round(currentGroup[0].offset / 10000);
      const itemEndMs = Math.round((item.offset + item.duration) / 10000);
      const groupDurMs = itemEndMs - groupStartMs;

      const nextItem = boundaries[i + 1];
      const isPunct = /[၊။,\.\?!]/.test(txt);
      const isConnector =
        /(ပြီး|ပြီးတော့|ဒါပေမဲ့|ဒါကြောင့်|အခါ|တယ်|ဘူး|သည်|ပါ|လိုက်တယ်|တာ|မှာ|က|ကို|ရဲ့|လို့|ချိန်မှာပဲ|တဲ့အတွက်|အနေနဲ့|ဆုံးဖြတ်လိုက်တယ်|မေးလိုက်တယ်|ခေါ်လိုက်တယ်|ရတယ်|ပါဘူး|တယ်လို့|သွားတယ်|ဖြစ်လာတယ်|ဖြစ်လာမယ်|မဟုတ်တော့|ချစ်ပါ့မလား|နှင်ထုတ်လိုက်တယ်|မစဉ်းစားရသေးဘူး|အားကိုးရတော့မယ်|ကြည့်ဖို့|အောက်မှာနှိပ်ပါ|နှိပ်ပါ|နှိပ်ပြီး|သွားပါမယ်|ကောင်းပါသေးတယ်|ရှိနေကြပြီ|ရလာတဲ့အခါ|အကြောင်း|တွေးမိသွားတယ်|ခွဲပေးရမလဲဆိုတာ|ဆုံးဖြတ်ဖို့အတွက်|ဟန်ဆောင်ပြီး|ကောင်းရဲ့လားဆိုတာ|ရူးနေတာလား|တောင်းတာပါ။|ငွေချေးမလဲ|အင်္ကျီကို|ဝတ်လိုက်|စိတ်ဓာတ်မမာကျောပါဘူး|ကြည့်ကြတာပေါ့|နေရာလား|ဝင်သွားရအောင်|ဘာလုပ်နေတာလဲ|လာရောင်းတာလား|သွားပါ။|ရှာနေတာပါ|ပြောနေတာလား|မိဘတွေလား|လယ်သမားတွေပါ။|ခေါ်နေပါတယ်။|ရောက်နေတယ်။|ပြောနေကြတယ်ခင်ဗျ|ပြောတယ်|မဝင်နဲ့တဲ့|ဘာလဲ|တင်တဲ့ဟာလေ|ဖြစ်ရမယ်|လွှတ်လိုက်တာလဲ|ပွင့်လင်းလွန်းနေတာလဲ|ဘာအနံ့လဲ|လာတွေ့တာ|အရင်မပြောထားတာလဲ|မကိုင်ဘူး|ဘာတွေသယ်လာတာလဲ|သယ်လာတာလဲ|ထင်ကုန်တော့မယ်|သယ်လာတာ|ထားခဲ့လိုက်ပါ|သန့်ရှင်းရေးလုပ်ထားတာ|အဝင်ခံပါဦး|ခဏလေးပါ|အရမ်းညစ်ပတ်နေတယ်|စောင့်ဦး|ဝတ်ထား|ပေးလိုက်စမ်းပါ|ရေလေးသောက်ဦး|ဆေးထားတာ|ကွဲကုန်ပါဦးမယ်|လာတွေ့တာလဲ|တွေ့ပြီးပြီလေ|နေကောင်းပါတယ်|ပြန်ကြပါတော့|ခုမှ|ရောက်တာလေ|ရောက်လာတာ|ပြင်ဆင်မထားဘူး|မရှိဘူး|အိပ်မယ်|ကျေးလက်မဟုတ်ဘူး|အပူပေးစနစ်နဲ့|ဘယ်သူလျော်မှာလဲ|အိပ်ကြမယ်|ပြန်ကြလိမ့်မယ်|နေချင်တာလေ|နေပါစေ|ထမင်းလာကျွေးရမှာ|အဆင်မပြေဘူး|ပြန်ခိုင်းလိုက်|ထိခိုက်ကုန်မယ်|တိုင်ပင်စရာ|ရှိလို့|လာတာ|ပြိုကျသွားတယ်|အက်နေတယ်|ချေးမလို့|ဒါပေမဲ့|သုံးရမှာပဲ|မရှိဘူး|ချေးရမှာလား|လာရတာလဲ|သိတယ်|မချေးကြဘူး|ရှိတယ်|ရှင်အရူးလား|တောင်း|တောင်းဦးမလား|မဟုတ်ပါဘူး|စုပြီးပြီပဲ|မွေးနေ့လေ|ဘာပေးမလဲ|မပေးနဲ့တော့|အလုပ်လုပ်နေတယ်|ပြန်လာခဲ့လိုက်မယ်|အား|မရှိဘူးလို့ပြောထားတာကို|ပြောခဲ့တာပဲ|ကုန်သွားပြီလေ|ဝယ်လိုက်လို့|တကယ်လား|လွှဲပေးလိုက်မယ်|ပြောလိုက်တယ်နော်|အလုပ်အတွက်လေ|ဘာမှမဆိုင်ဘူး|ဝယ်နိုင်ပြီး|မချေးနိုင်ဘူးလား|တွက်မနေနဲ့တော့|သုံးတာပဲ|သွားတော့မယ်|မချစ်တော့ဘူး|မွေးလာတာ|ပညာသင်ပေးခဲ့တာ|လုပ်ရက်တယ်နော်|သွားကြမယ်|နေတာ|အဝေးကြီးပဲ|ရောက်သွားတော့)$/.test(
          txt
        );
      const isPause =
        nextItem &&
        nextItem.offset - (item.offset + item.duration) > 1500000; // 150ms pause

      // Conditions to break cue for short, crisp single line (စာတန်းထိုးတစ်ကြောင်း: max 16-22 chars / 1 spoken phrase)
      const shouldBreak =
        isPunct ||
        isPause ||
        currentGroup.length >= 2 ||
        groupLen >= 20 ||
        groupDurMs >= 1600 ||
        (currentGroup.length >= 1 && (isPunct || isConnector || groupLen >= 14));

      if (shouldBreak || i === boundaries.length - 1) {
        if (groupText.trim()) {
          singleLineCues.push({
            id: singleLineCues.length + 1,
            startMs: groupStartMs,
            endMs: itemEndMs,
            startTime: formatSrtTimestamp(groupStartMs),
            endTime: formatSrtTimestamp(itemEndMs),
            text: groupText.trim(),
          });
        }
        currentGroup = [];
      }
    }
  }

  // Fallback if no boundaries were captured
  if (singleLineCues.length === 0) {
    const rawParts = fullText
      .split(/([၊။\n\.\?!]+)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let curTime = 45;
    for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i];
      if (!part) continue;
      // If part is still too long (>24 chars), break it into smaller sub-clauses
      if (part.length > 24) {
        const words = part.split(/\s+/);
        let subGroup: string[] = [];
        for (const w of words) {
          subGroup.push(w);
          const subText = subGroup.join(" ");
          if (subText.length >= 18 || subGroup.length >= 2) {
            const startMs = curTime;
            const endMs = startMs + Math.max(650, subText.length * 105);
            curTime = endMs + 35;
            singleLineCues.push({
              id: singleLineCues.length + 1,
              startMs,
              endMs,
              startTime: formatSrtTimestamp(startMs),
              endTime: formatSrtTimestamp(endMs),
              text: subText,
            });
            subGroup = [];
          }
        }
        if (subGroup.length > 0) {
          const subText = subGroup.join(" ");
          const startMs = curTime;
          const endMs = startMs + Math.max(650, subText.length * 105);
          curTime = endMs + 35;
          singleLineCues.push({
            id: singleLineCues.length + 1,
            startMs,
            endMs,
            startTime: formatSrtTimestamp(startMs),
            endTime: formatSrtTimestamp(endMs),
            text: subText,
          });
        }
      } else {
        const startMs = curTime;
        const endMs = startMs + Math.max(650, part.length * 105);
        curTime = endMs + 35;
        singleLineCues.push({
          id: singleLineCues.length + 1,
          startMs,
          endMs,
          startTime: formatSrtTimestamp(startMs),
          endTime: formatSrtTimestamp(endMs),
          text: part,
        });
      }
    }
  }

  // 2. Two Line Cues (စာတန်းထိုးနှစ်ကြောင်း: ALWAYS strictly 2 balanced lines per cue)
  const twoLineCues: SubtitleCue[] = [];
  for (let i = 0; i < singleLineCues.length; i += 2) {
    const c1 = singleLineCues[i];
    const c2 = singleLineCues[i + 1];
    if (c2) {
      twoLineCues.push({
        id: twoLineCues.length + 1,
        startMs: c1.startMs,
        endMs: c2.endMs,
        startTime: c1.startTime,
        endTime: c2.endTime,
        text: `${c1.text}\n${c2.text}`,
      });
    } else {
      // If single line remains, split into 2 lines if possible so 2-line mode ALWAYS has 2 lines
      if (c1.text.length >= 14 && c1.text.includes(" ")) {
        const mid = Math.floor(c1.text.length / 2);
        const spIdx = c1.text.indexOf(" ", mid - 4);
        if (spIdx !== -1 && spIdx < mid + 8) {
          const l1 = c1.text.slice(0, spIdx).trim();
          const l2 = c1.text.slice(spIdx).trim();
          twoLineCues.push({
            id: twoLineCues.length + 1,
            startMs: c1.startMs,
            endMs: c1.endMs,
            startTime: c1.startTime,
            endTime: c1.endTime,
            text: `${l1}\n${l2}`,
          });
        } else {
          twoLineCues.push({
            id: twoLineCues.length + 1,
            startMs: c1.startMs,
            endMs: c1.endMs,
            startTime: c1.startTime,
            endTime: c1.endTime,
            text: `${c1.text}\n`,
          });
        }
      } else {
        twoLineCues.push({
          id: twoLineCues.length + 1,
          startMs: c1.startMs,
          endMs: c1.endMs,
          startTime: c1.startTime,
          endTime: c1.endTime,
          text: `${c1.text}\n`,
        });
      }
    }
  }

  // Align final cues to total audio duration to ensure perfect 100% sync in CapCut/Premiere
  if (totalAudioDurationMs > 0) {
    if (singleLineCues.length > 0) {
      const last = singleLineCues[singleLineCues.length - 1];
      if (totalAudioDurationMs > last.startMs) {
        last.endMs = Math.max(last.endMs, totalAudioDurationMs - 120);
        last.endTime = formatSrtTimestamp(last.endMs);
      }
    }
    if (twoLineCues.length > 0) {
      const last = twoLineCues[twoLineCues.length - 1];
      if (totalAudioDurationMs > last.startMs) {
        last.endMs = Math.max(last.endMs, totalAudioDurationMs - 120);
        last.endTime = formatSrtTimestamp(last.endMs);
      }
    }
  }

  const singleLineSrt =
    singleLineCues
      .map((c) => `${c.id}\n${c.startTime} --> ${c.endTime}\n${c.text}`)
      .join("\n\n") + "\n";

  const twoLineSrt =
    twoLineCues
      .map((c) => `${c.id}\n${c.startTime} --> ${c.endTime}\n${c.text}`)
      .join("\n\n") + "\n";

  return {
    srt: singleLineSrt,
    singleLineSrt,
    twoLineSrt,
    wordSrt,
    cues: singleLineCues,
    singleLineCues,
    twoLineCues,
  };
}

// Generate authentic speech & exact word boundary cues using Microsoft Edge TTS
// Supports unlimited text length (including 5000+ characters) via smooth chunking & exact audio duration synchronization
async function generateEdgeTtsAudioWithBoundaries(
  text: string,
  voiceName: string = "my-MM-ThihaNeural",
  rateStr: string = "+0%",
  pitchStr: string = "+0Hz"
): Promise<{ audioBuffer: Buffer; wordBoundaries: WordBoundaryItem[]; totalAudioDurationMs: number }> {
  // If text is short (<= 500 chars), process directly in one pass
  if (text.length <= 500) {
    const comm = new Communicate(text, {
      voice: voiceName,
      rate: rateStr,
      pitch: pitchStr,
    });

    const chunks: Buffer[] = [];
    const wordBoundaries: WordBoundaryItem[] = [];

    for await (const chunk of comm.stream()) {
      if (chunk.type === "audio" && chunk.data) {
        chunks.push(Buffer.from(chunk.data));
      } else if (chunk.type === "WordBoundary") {
        wordBoundaries.push({
          offset: (chunk as any).offset || 0,
          duration: (chunk as any).duration || 0,
          text: (chunk as any).text || "",
        });
      }
    }

    const combined = Buffer.concat(chunks);
    if (!combined || combined.length === 0) {
      throw new Error("Edge TTS returned empty audio buffer");
    }
    const totalAudioDurationMs = await getMp3ExactDurationMs(combined);
    return { audioBuffer: combined, wordBoundaries, totalAudioDurationMs };
  }

  // For long text (> 500 chars, up to 10,000+ chars), split into natural phrase/sentence chunks
  const rawChunks = splitTextIntoChunks(text, 380);
  const audioChunks: Buffer[] = [];
  const allBoundaries: WordBoundaryItem[] = [];
  let totalOffsetTicks = 0;

  for (const chunkText of rawChunks) {
    if (!chunkText.trim()) continue;

    const comm = new Communicate(chunkText.trim(), {
      voice: voiceName,
      rate: rateStr,
      pitch: pitchStr,
    });

    const chunkBoundaries: WordBoundaryItem[] = [];
    const chunkAudio: Buffer[] = [];

    for await (const chunk of comm.stream()) {
      if (chunk.type === "audio" && chunk.data) {
        chunkAudio.push(Buffer.from(chunk.data));
      } else if (chunk.type === "WordBoundary") {
        const offset = ((chunk as any).offset || 0) + totalOffsetTicks;
        const duration = (chunk as any).duration || 0;
        const bText = (chunk as any).text || "";
        chunkBoundaries.push({ offset, duration, text: bText });
      }
    }

    const chunkBuf = Buffer.concat(chunkAudio);
    if (chunkBuf.length > 0) {
      audioChunks.push(chunkBuf);
      allBoundaries.push(...chunkBoundaries);

      // Measure exact decoded audio length of this chunk to eliminate any timing drift
      const chunkDurationMs = await getMp3ExactDurationMs(chunkBuf);
      if (chunkDurationMs > 0) {
        totalOffsetTicks += chunkDurationMs * 10000;
      } else if (chunkBoundaries.length > 0) {
        const lastB = chunkBoundaries[chunkBoundaries.length - 1];
        totalOffsetTicks = lastB.offset + lastB.duration + 5000000;
      }
    }
  }

  const combined = Buffer.concat(audioChunks);
  if (!combined || combined.length === 0) {
    throw new Error("Edge TTS returned empty audio buffer for chunked synthesis");
  }

  const totalAudioDurationMs = await getMp3ExactDurationMs(combined);

  return { audioBuffer: combined, wordBoundaries: allBoundaries, totalAudioDurationMs };
}

// Text chunker for fallback speech synthesis
function splitTextIntoChunks(text: string, maxLength: number = 150): string[] {
  const cleanText = text.replace(/[\(\)\[\]\{\}\*\#\_]/g, " ").trim();
  if (cleanText.length <= maxLength) return [cleanText];

  const regex = /([^။၊\n\.\?!]+[။၊\n\.\?!]?)/g;
  const rawParts = cleanText.match(regex) || [cleanText];
  const chunks: string[] = [];
  let current = "";

  for (const part of rawParts) {
    if ((current + " " + part).trim().length <= maxLength) {
      current = (current + " " + part).trim();
    } else {
      if (current) chunks.push(current);
      if (part.length <= maxLength) {
        current = part.trim();
      } else {
        const subWords = part.split(/\s+/);
        let sub = "";
        for (const w of subWords) {
          if ((sub + " " + w).trim().length <= maxLength) {
            sub = (sub + " " + w).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        if (sub) current = sub;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [cleanText.slice(0, maxLength)];
}

// Fallback Natural Human Speech Engine
async function fetchGoogleTtsAudio(text: string, lang: string = "my"): Promise<Buffer> {
  const chunks = splitTextIntoChunks(text, 140);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk.trim())}&tl=${lang}&client=tw-ob`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      throw new Error(`Fallback TTS request failed: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    buffers.push(Buffer.from(arrayBuffer));
  }

  return Buffer.concat(buffers);
}

// Transform audio using FFmpeg librubberband as fallback
async function transformVoiceAudio(
  inputBuffer: Buffer,
  pitchRatio: number,
  tempoRatio: number,
  bassBoost: number = 0
): Promise<Buffer> {
  if (Math.abs(pitchRatio - 1.0) < 0.01 && Math.abs(tempoRatio - 1.0) < 0.01 && bassBoost === 0) {
    return inputBuffer;
  }

  return new Promise((resolve) => {
    let filter = `rubberband=pitch=${pitchRatio.toFixed(3)}:tempo=${tempoRatio.toFixed(3)}`;
    if (bassBoost > 0) {
      filter += `,equalizer=f=180:t=q:w=1.2:g=${bassBoost},equalizer=f=3200:t=q:w=1:g=-2`;
    }

    const ff = spawn("ffmpeg", [
      "-f", "mp3",
      "-i", "pipe:0",
      "-af", filter,
      "-f", "mp3",
      "-c:a", "libmp3lame",
      "-b:a", "64k",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];
    ff.stdout.on("data", (chunk) => chunks.push(chunk));
    ff.stderr.on("data", () => {});
    ff.on("close", (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        resolve(inputBuffer);
      }
    });
    ff.on("error", () => {
      resolve(inputBuffer);
    });

    ff.stdin.write(inputBuffer);
    ff.stdin.end();
  });
}

async function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  app.use(express.json({ limit: "10mb" }));

  // Initialize Gemini AI client server-side
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // API Route: Gemini script assistant for generating Burmese voiceovers/scripts
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, style, category } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const systemInstruction = `You are a professional Burmese voiceover scriptwriter and audio director for "လင်းဇော်" (Lin Zaw TTS Pro).
Your job is to write or refine Burmese audio scripts based on user requests, incorporating natural emotion tags like (စိတ်လှုပ်ရှား 😄), (တည်ငြိမ် 😌), (သတင်း 💼), (ဇာတ်ကြောင်း 📖), (ပျော်ရွှင် 😁), (လေးနက် 🤨) or punctuation pacing to make the synthesized speech sound extremely natural and expressive.
Style requested: ${style || "Standard"}, Category: ${category || "General"}.
Return only the formatted Burmese script text ready for TTS synthesis.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ text: response.text || "" });
    } catch (error: any) {
      console.error("Gemini script generation error:", error?.message || error);
      res.status(500).json({ error: error.message || "Failed to generate script" });
    }
  });

  // API Route: AI Language Translator using Gemini
  app.post("/api/gemini/translate", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const { text, sourceLang, targetLang } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Text is required for translation" });
      }

      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are a professional real-time translator specializing in Burmese, English, Chinese, Thai, Korean, Japanese, French, and Spanish.
Translate the user's provided text from ${sourceLang || "Auto Detect"} to ${targetLang || "Burmese"}.
Provide natural, grammatically correct, and fluent translation without any explanations, notes, or conversational intro/outro text.
Return ONLY the raw translated text.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: text,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      res.json({ translatedText: response.text ? response.text.trim() : "" });
    } catch (error: any) {
      console.error("Gemini translation error:", error?.message || error);
      res.status(500).json({ error: error.message || "Failed to translate text" });
    }
  });

  // API Route: Microsoft Edge TTS Synthesis with Exact SRT Subtitles (သီဟ၊ နီလာ၊ မောင်ကျော်သူ)
  app.post("/api/tts", async (req, res) => {
    const { text, voice, tone, rate, pitch, returnJson } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required for TTS" });
    }

    const wantsJson = returnJson === true || req.headers.accept?.includes("application/json");
    const selectedVoiceId = (voice || "thiha").toLowerCase();
    const config = EDGE_VOICE_MAP[selectedVoiceId] || EDGE_VOICE_MAP.thiha;

    // Parse user speed and pitch inputs
    const userRatePercent = parseInt(String(rate || "0"), 10) || 0;
    const userPitchPercent = parseInt(String(pitch || "0"), 10) || 0;

    let finalRate = config.defaultRate + userRatePercent;
    let finalPitch = config.defaultPitch + userPitchPercent;

    // Apply tone adjustments
    if (tone === "male1") {
      finalPitch -= 6;
    } else if (tone === "male2") {
      finalPitch -= 10;
    } else if (tone === "nilar_var") {
      finalPitch += 5;
    } else if (tone === "mix15") {
      finalPitch -= 2;
    } else if (tone === "mix70") {
      finalPitch -= 8;
    }

    const rateParam = finalRate >= 0 ? `+${finalRate}%` : `${finalRate}%`;
    const pitchParam = finalPitch >= 0 ? `+${finalPitch}Hz` : `${finalPitch}Hz`;

    // 1. PRIMARY: Microsoft Edge TTS (Official Neural Voices + Exact WordBoundary SRT)
    try {
      const { audioBuffer, wordBoundaries, totalAudioDurationMs } = await generateEdgeTtsAudioWithBoundaries(
        text,
        config.voice,
        rateParam,
        pitchParam
      );

      const subtitleData = generateSrtFromBoundaries(wordBoundaries, text, totalAudioDurationMs);

      if (audioBuffer && audioBuffer.length > 0) {
        if (wantsJson) {
          return res.json({
            success: true,
            audioBase64: audioBuffer.toString("base64"),
            srt: subtitleData.singleLineSrt,
            singleLineSrt: subtitleData.singleLineSrt,
            twoLineSrt: subtitleData.twoLineSrt,
            wordSrt: subtitleData.wordSrt,
            cues: subtitleData.singleLineCues,
            singleLineCues: subtitleData.singleLineCues,
            twoLineCues: subtitleData.twoLineCues,
            format: "mp3",
            voice: selectedVoiceId,
          });
        }

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Disposition", 'attachment; filename="lin_zaw_speech.mp3"');
        res.setHeader("Content-Length", audioBuffer.length);
        res.setHeader("X-SRT-Base64", Buffer.from(subtitleData.srt, "utf-8").toString("base64"));
        return res.send(audioBuffer);
      }
    } catch (edgeErr: any) {
      console.warn("Edge TTS notice, running high-fidelity fallback:", edgeErr?.message);
    }

    // 2. BACKUP FALLBACK: Natural Speech Engine
    try {
      const hasBurmese = /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FE]/.test(text);
      let ttsLang = "my";
      if (!hasBurmese && /^[a-zA-Z0-9\s\.\,\?\!]+$/.test(text)) {
        ttsLang = "en";
      }

      let fallbackBuffer = await fetchGoogleTtsAudio(text, ttsLang);
      const isMale = config.voice.includes("Thiha") || selectedVoiceId === "mgkyawthu";
      const pitchRatio = isMale ? 0.74 * (1.0 + userPitchPercent / 100) : 1.0 * (1.0 + userPitchPercent / 100);
      const tempoRatio = 1.0 + userRatePercent / 100;
      const bassBoost = isMale ? 5 : 0;

      fallbackBuffer = await transformVoiceAudio(fallbackBuffer, pitchRatio, tempoRatio, bassBoost);
      const subtitleData = generateSrtFromBoundaries([], text);

      if (fallbackBuffer && fallbackBuffer.length > 0) {
        if (wantsJson) {
          return res.json({
            success: true,
            audioBase64: fallbackBuffer.toString("base64"),
            srt: subtitleData.singleLineSrt,
            singleLineSrt: subtitleData.singleLineSrt,
            twoLineSrt: subtitleData.twoLineSrt,
            wordSrt: subtitleData.wordSrt,
            cues: subtitleData.singleLineCues,
            singleLineCues: subtitleData.singleLineCues,
            twoLineCues: subtitleData.twoLineCues,
            format: "mp3",
            voice: selectedVoiceId,
          });
        }

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Disposition", 'attachment; filename="lin_zaw_speech.mp3"');
        res.setHeader("Content-Length", fallbackBuffer.length);
        res.setHeader("X-SRT-Base64", Buffer.from(subtitleData.srt, "utf-8").toString("base64"));
        return res.send(fallbackBuffer);
      }
    } catch (fallbackErr: any) {
      console.error("Backup TTS error:", fallbackErr?.message);
    }

    return res.status(500).json({ error: "Failed to generate MP3 speech" });
  });

  // Setup Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(Number(port), "0.0.0.0", () => {
    console.log(`Lin Zaw TTS Pro running on http://0.0.0.0:${port}`);
  });
}

startServer();
