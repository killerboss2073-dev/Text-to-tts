import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { GoogleGenAI } from "@google/genai";
import { Communicate } from "edge-tts-universal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.resolve(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const UPGRADE_REQS_FILE = path.join(DATA_DIR, "upgrade_requests.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function loadJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
  }
  return fallback;
}

function saveJsonSafe(filePath: string, data: any) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e);
  }
}

// Microsoft Edge TTS Voice Profiles
const EDGE_VOICE_MAP: Record<string, { voice: string; defaultRate: number; defaultPitch: number }> = {
  thiha: { voice: "my-MM-ThihaNeural", defaultRate: 0, defaultPitch: 0 },        // သီဟ - မူရင်း သဘာဝ အမျိုးသားအသံ (Thiha Male)
  nilar: { voice: "my-MM-NilarNeural", defaultRate: 0, defaultPitch: 0 },        // နီလာ - မူရင်း ချိုသာ အမျိုးသမီးအသံ (Nilar Female)
  mgkyawthu: { voice: "it-IT-GiuseppeMultilingualNeural", defaultRate: 30, defaultPitch: 10 }, // မောင်ကျော်သူ (Giuseppe Fast Vibe ⚡ - Speed 1.3)
  mgthuta: { voice: "fr-FR-RemyMultilingualNeural", defaultRate: 30, defaultPitch: 10 },       // မောင်သုတ (Remy Fast Reviewer ⚡ - Speed 1.3)
  masumyatt: { voice: "en-US-AvaMultilingualNeural", defaultRate: 30, defaultPitch: 10 },      // မဆုမြတ် (Ava Fast Narrator ⚡ - Speed 1.3)
  koaungkyaw: { voice: "en-US-BrianMultilingualNeural", defaultRate: 60, defaultPitch: 10 },   // ကိုအောင်ကျော် (Brian Hyper Epic ⚡ - Speed 1.6)
  saicsai: { voice: "my-MM-ThihaNeural", defaultRate: 6, defaultPitch: 2 },      // ကိုစိုင်းစိုင်း - MALE
  mafoofoo: { voice: "my-MM-NilarNeural", defaultRate: -3, defaultPitch: 4 },    // မဖူးဖူး - FEMALE
  koneye: { voice: "my-MM-ThihaNeural", defaultRate: -2, defaultPitch: -5 },     // ကိုနေတိုး - MALE
  kqaung: { voice: "my-MM-ThihaNeural", defaultRate: 3, defaultPitch: -2 },      // ကိုအောင်ရဲလင်း - MALE
  komyint: { voice: "my-MM-ThihaNeural", defaultRate: 4, defaultPitch: -4 },     // ကိုမြင့်မြတ် - MALE
  mawathsu: { voice: "my-MM-NilarNeural", defaultRate: -2, defaultPitch: 2 },    // မဝတ်မှုံရွှေရည် - FEMALE
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

// Decode MP3 audio buffer into raw 24kHz 16-bit Mono PCM
function decodeMp3ToPcm24k(mp3Buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-f", "mp3",
      "-i", "pipe:0",
      "-f", "s16le",
      "-ar", "24000",
      "-ac", "1",
      "pipe:1"
    ]);
    const bufs: Buffer[] = [];
    ff.stdout.on("data", (d) => bufs.push(d));
    ff.stderr.on("data", () => {});
    ff.on("close", (code) => {
      if (code === 0 && bufs.length > 0) {
        resolve(Buffer.concat(bufs));
      } else {
        reject(new Error(`FFmpeg decode failed with code ${code}`));
      }
    });
    ff.on("error", (err) => reject(err));
    ff.stdin.write(mp3Buf);
    ff.stdin.end();
  });
}

// Encode raw 24kHz 16-bit Mono PCM buffer into clean, high-fidelity MP3 in a single pass
function encodePcmToMp3(pcmBuf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-f", "s16le",
      "-ar", "24000",
      "-ac", "1",
      "-i", "pipe:0",
      "-c:a", "libmp3lame",
      "-b:a", "128k",
      "-f", "mp3",
      "pipe:1"
    ]);
    const bufs: Buffer[] = [];
    ff.stdout.on("data", (d) => bufs.push(d));
    ff.stderr.on("data", () => {});
    ff.on("close", (code) => {
      if (code === 0 && bufs.length > 0) {
        resolve(Buffer.concat(bufs));
      } else {
        reject(new Error(`FFmpeg encode failed with code ${code}`));
      }
    });
    ff.on("error", (err) => reject(err));
    ff.stdin.write(pcmBuf);
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

// Intelligent Burmese sentence & phrase chunker for up to 30,000+ characters
function splitBurmeseTextIntoChunks(text: string, maxChars: number = 750): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    if ((currentChunk + " " + trimmedPara).trim().length <= maxChars) {
      currentChunk = currentChunk ? currentChunk + "\n" + trimmedPara : trimmedPara;
    } else {
      // Split by Burmese sentence endings (။, ., ?, !)
      const sentences = trimmedPara.split(/(?<=[။\.\?!])/);
      for (const sent of sentences) {
        const s = sent.trim();
        if (!s) continue;
        if ((currentChunk + " " + s).trim().length <= maxChars) {
          currentChunk = currentChunk ? currentChunk + " " + s : s;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
          }
          if (s.length <= maxChars) {
            currentChunk = s;
          } else {
            // Split by secondary clause delimiters (၊, comma, semicolon)
            const clauses = s.split(/(?<=[၊,;])/);
            for (const clause of clauses) {
              const c = clause.trim();
              if (!c) continue;
              if ((currentChunk + " " + c).trim().length <= maxChars) {
                currentChunk = currentChunk ? currentChunk + " " + c : c;
              } else {
                if (currentChunk) {
                  chunks.push(currentChunk.trim());
                  currentChunk = "";
                }
                if (c.length <= maxChars) {
                  currentChunk = c;
                } else {
                  // Hard slice by space or safe character boundary
                  let rem = c;
                  while (rem.length > 0) {
                    if (rem.length <= maxChars) {
                      currentChunk = rem;
                      break;
                    }
                    let cutIdx = rem.lastIndexOf(" ", maxChars);
                    if (cutIdx <= maxChars * 0.4) {
                      cutIdx = maxChars;
                    }
                    chunks.push(rem.slice(0, cutIdx).trim());
                    rem = rem.slice(cutIdx).trim();
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.length > 0);
}

// Synthesize a single chunk with Microsoft Edge TTS and decode directly to 24kHz 16-bit Mono PCM
async function synthesizeSingleChunkEdge(
  chunkText: string,
  voiceName: string,
  rateStr: string,
  pitchStr: string
): Promise<{ pcmBuf: Buffer; boundaries: WordBoundaryItem[] }> {
  const comm = new Communicate(chunkText.trim(), {
    voice: voiceName,
    rate: rateStr,
    pitch: pitchStr,
  });

  const audioChunks: Buffer[] = [];
  const boundaries: WordBoundaryItem[] = [];

  for await (const chunk of comm.stream()) {
    if (chunk.type === "audio" && chunk.data) {
      audioChunks.push(Buffer.from(chunk.data));
    } else if (chunk.type === "WordBoundary") {
      boundaries.push({
        offset: (chunk as any).offset || 0,
        duration: (chunk as any).duration || 0,
        text: (chunk as any).text || "",
      });
    }
  }

  const mp3Buf = Buffer.concat(audioChunks);
  if (!mp3Buf || mp3Buf.length === 0) {
    throw new Error("Empty audio received from Edge TTS chunk");
  }

  const pcmBuf = await decodeMp3ToPcm24k(mp3Buf);
  return { pcmBuf, boundaries };
}

// Generate authentic speech & exact word boundary cues using Microsoft Edge TTS
// Supports up to 30,000+ characters with 100% microsecond-exact audio and SRT synchronization
async function generateEdgeTtsAudioWithBoundaries(
  text: string,
  voiceName: string = "my-MM-ThihaNeural",
  rateStr: string = "+0%",
  pitchStr: string = "+0Hz"
): Promise<{ audioBuffer: Buffer; wordBoundaries: WordBoundaryItem[]; totalAudioDurationMs: number }> {
  // If text is short (<= 600 chars), synthesize directly in one pass
  if (text.length <= 600) {
    const { pcmBuf, boundaries } = await synthesizeSingleChunkEdge(text, voiceName, rateStr, pitchStr);
    const audioBuffer = await encodePcmToMp3(pcmBuf);
    const totalAudioDurationMs = Math.round(pcmBuf.length / 48);
    return { audioBuffer, wordBoundaries: boundaries, totalAudioDurationMs };
  }

  // For long text (6,000 up to 30,000+ characters), split into natural Burmese chunks
  const chunks = splitBurmeseTextIntoChunks(text, 750);
  const results: Array<{ pcmBuf: Buffer; boundaries: WordBoundaryItem[] }> = new Array(chunks.length);

  // Process chunks in concurrent batches of 4 for fast synthesis without timing drift
  const BATCH_SIZE = 4;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchPromises = chunks.slice(i, i + BATCH_SIZE).map(async (chunkText, idx) => {
      const globalIdx = i + idx;
      const res = await synthesizeSingleChunkEdge(chunkText, voiceName, rateStr, pitchStr);
      results[globalIdx] = res;
    });
    await Promise.all(batchPromises);
  }

  // Stitch decoded PCM audio buffers and calculate exact microsecond timestamp offsets for all subtitles
  const allPcmBuffers: Buffer[] = [];
  const allBoundaries: WordBoundaryItem[] = [];
  let accumulatedPcmBytes = 0;

  for (let i = 0; i < results.length; i++) {
    const { pcmBuf, boundaries } = results[i];
    if (!pcmBuf || pcmBuf.length === 0) continue;

    // 24,000 Hz, 16-bit Mono = 48 bytes per millisecond
    const chunkStartMs = accumulatedPcmBytes / 48;
    const chunkOffsetTicks = Math.round(chunkStartMs * 10000);

    for (const b of boundaries) {
      allBoundaries.push({
        offset: b.offset + chunkOffsetTicks,
        duration: b.duration,
        text: b.text,
      });
    }

    allPcmBuffers.push(pcmBuf);
    accumulatedPcmBytes += pcmBuf.length;
  }

  const combinedPcm = Buffer.concat(allPcmBuffers);
  if (!combinedPcm || combinedPcm.length === 0) {
    throw new Error("Edge TTS returned empty audio buffer for chunked synthesis");
  }

  // Single-pass MP3 encoding ensures zero frame gaps and 100% seamless playback
  const audioBuffer = await encodePcmToMp3(combinedPcm);
  const totalAudioDurationMs = Math.round(combinedPcm.length / 48);

  return { audioBuffer, wordBoundaries: allBoundaries, totalAudioDurationMs };
}

// Fallback Natural Human Speech Engine
async function fetchGoogleTtsAudio(text: string, lang: string = "my"): Promise<Buffer> {
  const chunks = splitBurmeseTextIntoChunks(text, 140);
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

  // Helper function: Ensure output is 100% pure Myanmar (Burmese) script with natural spoken number units
  function ensurePureBurmeseText(text: string): string {
    if (!text) return "";

    let cleaned = text;

    // 0. Number Unit Formatting to Spoken Myanmar (၅ ထောင်၊ ၁ သောင်း၊ ၅ သောင်း၊ ၁ သိန်း)
    const numberUnitsMap: [RegExp, string][] = [
      [/50[,.]?000|၅၀[,.]?၀၀၀/gi, "၅ သောင်း"],
      [/10[,.]?000|၁၀[,.]?၀၀၀/gi, "၁ သောင်း"],
      [/20[,.]?000|၂၀[,.]?၀၀၀/gi, "၂ သောင်း"],
      [/30[,.]?000|၃၀[,.]?၀၀၀/gi, "၃ သောင်း"],
      [/40[,.]?000|၄၀[,.]?၀၀၀/gi, "၄ သောင်း"],
      [/100[,.]?000|၁၀၀[,.]?၀၀၀/gi, "၁ သိန်း"],
      [/5[,.]?000|၅[,.]?၀၀၀/gi, "၅ ထောင်"],
      [/1[,.]?000|၁[,.]?၀၀၀/gi, "၁ ထောင်"],
      [/2[,.]?000|၂[,.]?၀၀၀/gi, "၂ ထောင်"],
      [/3[,.]?000|၃[,.]?၀၀၀/gi, "၃ ထောင်"],
      [/10[- ]?years/gi, "၁၀ နှစ်"],
    ];

    for (const [regex, replacement] of numberUnitsMap) {
      cleaned = cleaned.replace(regex, replacement);
    }

    // 0.5 Replace Formal Unnatural Words with Spoken Myanmar Equivalents
    const formalWordsMap: [RegExp, string][] = [
      [/ဩတ္တပ္ပစိတ်/g, "အသိတရား"],
      [/သြတ္တပ္ပစိတ်/g, "အသိတရား"],
      [/၎င်းသည်/g, "ထိုအရာဟာ"],
      [/၎င်း/g, "ထိုအရာ"],
      [/သည်။/g, "တယ်။"],
      [/သည်\b/g, "တယ်"],
    ];

    for (const [regex, replacement] of formalWordsMap) {
      cleaned = cleaned.replace(regex, replacement);
    }

    // 1. Common Titles, Brands, Names & Terms
    const termsMap: [RegExp, string][] = [
      [/Rolls[- ]?Royce/gi, "ရိုးစရိုက်စ်"],
      [/\bMiss\b/gi, "မစ္စ"],
      [/\bMr\b\.?/gi, "မစ္စတာ"],
      [/\bMrs\b\.?/gi, "မစ္စစ်"],
      [/\bDr\b\.?/gi, "ဒေါက်တာ"],
      [/\bDirector\b/gi, "ဒါရိုက်တာ"],
      [/\bCEO\b/gi, "စီအီးအို"],
      [/\bVIP\b/gi, "ဗီအိုင်ပီ"],
      [/\bJackpot\b/gi, "ဂျက်ပေါ့"],
      [/\bOK\b/gi, "အိုကေ"],
      [/\bOk\b/gi, "အိုကေ"],
      [/\bok\b/gi, "အိုကေ"],
      [/\bYes\b/gi, "ဟုတ်ကဲ့"],
      [/\bNo\b/gi, "ဟင့်အင်း"],
      [/\bHello\b/gi, "ဟယ်လို"],
      [/\bHi\b/gi, "ဟိုင်း"],
      // Drama & Script Names
      [/\bGia\b/gi, "ဂျီအေ"],
      [/\bWang\b/gi, "ဝမ်"],
      [/\bWong\b/gi, "ဝေါင်"],
      [/\bChungyun\b/gi, "ချောင်ယွန်"],
      [/\bJi[ -]?Wan\b/gi, "ဂျီဝမ်"],
      [/\bJiwan\b/gi, "ဂျီဝမ်"],
      [/\bJae\b/gi, "ဂျေး"],
      [/\bJaye\b/gi, "ဂျေး"],
      [/\bChan[ -]?Ming\b/gi, "ချန်းမင်း"],
      [/\bChanming\b/gi, "ချန်းမင်း"],
      [/\bXiaomu\b/gi, "ရှောင်မု"],
      [/\bChangmin\b/gi, "ချန်းမင်း"],
      [/\bJianbo\b/gi, "ဂျန်းဘို"],
      [/\bJiayi\b/gi, "ဂျီယီ"],
      [/\bJungwoo\b/gi, "ဂျောင်ဝူး"],
      [/\bJunguo\b/gi, "ဂျောင်ဂို"],
      [/\bChongming\b/gi, "ချောင်မင်း"],
      [/\bJohn\b/gi, "ဂျွန်"],
      [/\bMary\b/gi, "မေရီ"],
      [/\bDavid\b/gi, "ဒေးဗစ်"],
      [/\bTom\b/gi, "တွမ်"],
      [/\bJack\b/gi, "ဂျက်"],
      [/\bAlex\b/gi, "အဲလက်စ်"],
      [/\bYan\b/gi, "ယန်း"],
    ];

    for (const [regex, replacement] of termsMap) {
      cleaned = cleaned.replace(regex, replacement);
    }

    // 2. Transliterate any remaining English words/letters character-by-character into Burmese
    const letterMap: Record<string, string> = {
      a: "အေ", b: "ဘီ", c: "စီ", d: "ဒီ", e: "အီး", f: "အက်ဖ်", g: "ဂျီ",
      h: "အိတ်ချ်", i: "အိုင်", j: "ဂျေ", k: "ကေ", l: "အယ်လ်", m: "အမ်",
      n: "အန်", o: "အို", p: "ပီ", q: "ကျူ", r: "အာ", s: "အက်စ်", t: "တီ",
      u: "ယူ", v: "ဗီ", w: "ဒဗလျူ", x: "အက်က်စ်", y: "ဝိုင်", z: "ဇက်",
    };

    cleaned = cleaned.replace(/[A-Za-z]+/g, (match) => {
      return match
        .toLowerCase()
        .split("")
        .map((char) => letterMap[char] || char)
        .join("");
    });

    return cleaned;
  }

  // Helper function: Fallback Neural Translation Engine via Google API
  async function translateWithGoogleApi(text: string): Promise<string> {
    try {
      const lines = text.split("\n");
      const translatedLines: string[] = [];

      for (const line of lines) {
        if (!line.trim()) {
          translatedLines.push("");
          continue;
        }
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=my&dt=t&q=${encodeURIComponent(line.trim())}`;
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && Array.isArray(data[0])) {
              const fullLine = data[0].map((chunk: any) => chunk[0] || "").join("");
              translatedLines.push(fullLine || line);
            } else {
              translatedLines.push(line);
            }
          } else {
            translatedLines.push(line);
          }
        } catch {
          translatedLines.push(line);
        }
      }

      return translatedLines.join("\n").trim();
    } catch {
      return text;
    }
  }

  // API Route: AI Language Translator using Gemini with Multi-Stage Fallback
  app.post("/api/gemini/translate", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const { text, sourceLang, targetLang } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Text is required for translation" });
      }

      const systemInstruction = `You are a master Myanmar (Burmese) translator and voiceover script editor specializing in drama recaps, Chinese/English scripts, and movie narration.

CRITICAL TRANSLATION & SPOKEN VOICEOVER RULES:
1. USE NATURAL SPOKEN MYANMAR VOICE (စကားပြောစတိုင်လ်): Translate 100% into natural, fluent, spoken Myanmar drama recap narration.
   - ABSOLUTELY DO NOT USE FORMAL LITERARY WORDS like "သည်", "၎င်း", "ဩတ္တပ္ပစိတ်".
   - Replace "သည်" with "တယ်" for sentence endings/verbs (e.g., "ပြောင်းလဲသွားတယ်", "သက်သာသွားတယ်", "ဖြစ်လာတယ်").
   - Replace "၎င်းသည်" with "ထိုအရာဟာ", replace "၎င်း" with "ထိုအရာ" or "အဲဒါ".
   - Replace "ဩတ္တပ္ပစိတ်" with "အသိတရား".
2. PRONOUN RULES FOR DIALOGUE:
   - For female speakers (မိန်းကလေး), ALWAYS use "ကျွန်မ" or "သမီး" when speaking as 'I/me'. NEVER use 'ကျွန်တော်'.
   - For male speakers (ယောက်ျားလေး), ALWAYS use "ကျွန်တော်" or "သား" when speaking as 'I/me'.
3. ABSOLUTELY NO ENGLISH OR LATIN CHARACTERS ALLOWED IN THE OUTPUT. Every English word, name, title, place, or brand name MUST be phonetically transliterated into natural Burmese text (e.g. "Gia" -> "ဂျီအေ", "Wang" -> "ဝမ်", "Rolls Royce" -> "ရိုးစရိုက်စ်", "Miss" -> "မစ္စ", "Jackpot" -> "ဂျက်ပေါ့").
4. CONVERT NUMBERS TO NATURAL MYANMAR SPOKEN UNITS (ထောင်၊ သောင်း၊ သိန်း၊ သန်း):
   - Convert 5,000 / 5000 / ၅၀၀၀ -> ၅ ထောင်
   - Convert 10,000 / 10000 / ၁၀၀၀၀ -> ၁ သောင်း
   - Convert 50,000 / 50000 / ၅၀၀၀၀ -> ၅ သောင်း
   - Convert 100,000 / 100000 / ၁၀၀၀၀၀ -> ၁ သိန်း
   - Convert 1,000,000 / 1000000 -> ၁ သန်း
5. Preserve dialogue lines (-), line breaks, punctuation, and natural spoken Myanmar voiceover flow.
6. Output ONLY the pure Burmese translated text. Do not include markdown headers, code blocks, or explanations.`;

      let translatedText = "";

      // Stage 1: Primary Gemini Model (gemini-3.8-flash)
      if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: text,
            config: {
              systemInstruction,
              temperature: 0.25,
            },
          });

          if (response.text && response.text.trim()) {
            translatedText = response.text.trim();
          }
        } catch (e1: any) {
          console.warn("Stage 1 Gemini 3.8 Flash translation error:", e1?.message || e1);

          // Stage 2: Secondary Gemini Model Alias (gemini-flash-latest)
          try {
            const ai = new GoogleGenAI({ apiKey });
            const response2 = await ai.models.generateContent({
              model: "gemini-flash-latest",
              contents: text,
              config: {
                systemInstruction,
                temperature: 0.25,
              },
            });

            if (response2.text && response2.text.trim()) {
              translatedText = response2.text.trim();
            }
          } catch (e2: any) {
            console.warn("Stage 2 Gemini Flash Latest translation error:", e2?.message || e2);
          }
        }
      }

      // Stage 3: Bulletproof Fallback via Google Translation Engine
      if (!translatedText || !translatedText.trim()) {
        console.log("Using Stage 3 Neural Translation Engine Fallback...");
        translatedText = await translateWithGoogleApi(text);
      }

      if (translatedText) {
        translatedText = ensurePureBurmeseText(translatedText);
      }

      res.json({ 
        translatedText: translatedText || text,
        success: true 
      });
    } catch (error: any) {
      console.error("Gemini translation outer error:", error?.message || error);
      // Even in outer error, return fallback translated text instead of failing
      let fallback = await translateWithGoogleApi(req.body.text || "");
      if (fallback) {
        fallback = ensurePureBurmeseText(fallback);
      }
      res.json({ translatedText: fallback, success: true });
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

  // API: Get all upgrade requests
  app.get("/api/upgrade-requests", (req, res) => {
    const list = loadJsonSafe<any[]>(UPGRADE_REQS_FILE, []);
    res.json(list);
  });

  // API: Submit new upgrade request with payment slip
  app.post("/api/upgrade-requests", (req, res) => {
    try {
      const { userId, userEmail, userName, plan, paymentSlipBase64 } = req.body;
      if (!userEmail) {
        return res.status(400).json({ error: "userEmail is required" });
      }

      const list = loadJsonSafe<any[]>(UPGRADE_REQS_FILE, []);
      const newReq = {
        id: "req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        userId: userId || ("u_" + Date.now()),
        userEmail: userEmail,
        userName: userName || userEmail.split("@")[0],
        status: "pending",
        createdAt: new Date().toISOString(),
        plan: plan || "Premium Member (30,000 Chars)",
        paymentSlipBase64: paymentSlipBase64 || "",
      };

      list.unshift(newReq);
      saveJsonSafe(UPGRADE_REQS_FILE, list);

      // Ensure user exists in users list
      const users = loadJsonSafe<any[]>(USERS_FILE, []);
      const existingUserIdx = users.findIndex(u => u.uid === newReq.userId || u.email?.toLowerCase() === newReq.userEmail.toLowerCase());
      if (existingUserIdx === -1) {
        users.push({
          uid: newReq.userId,
          email: newReq.userEmail,
          displayName: newReq.userName,
          role: "normal",
          createdAt: newReq.createdAt,
          lastLoginAt: newReq.createdAt,
          generationCount: 0,
          dailyGenerations: 0,
        });
        saveJsonSafe(USERS_FILE, users);
      }

      res.json({ success: true, request: newReq });
    } catch (e: any) {
      console.error("Failed to save upgrade request:", e);
      res.status(500).json({ error: e.message || "Failed to save upgrade request" });
    }
  });

  // API: Approve upgrade request (updates role to premium for 1 Month)
  app.post("/api/upgrade-requests/approve", (req, res) => {
    try {
      const { requestId, userId, userEmail } = req.body;
      const cleanEmail = String(userEmail || "").trim().toLowerCase();
      const oneMonthFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const list = loadJsonSafe<any[]>(UPGRADE_REQS_FILE, []);
      const reqItem = list.find(r => r.id === requestId || (userId && r.userId === userId) || (cleanEmail && r.userEmail?.toLowerCase() === cleanEmail));
      if (reqItem) {
        reqItem.status = "approved";
        saveJsonSafe(UPGRADE_REQS_FILE, list);
      }

      // Update all matching user records to premium (1 Month)
      const users = loadJsonSafe<any[]>(USERS_FILE, []);
      let updatedCount = 0;
      users.forEach(u => {
        if ((userId && u.uid === userId) || (cleanEmail && u.email?.toLowerCase() === cleanEmail) || (reqItem && u.email?.toLowerCase() === reqItem.userEmail?.toLowerCase())) {
          u.role = "premium";
          u.premiumExpiresAt = oneMonthFromNow;
          delete u.forceLogout;
          updatedCount++;
        }
      });

      if (updatedCount === 0 && cleanEmail) {
        users.push({
          uid: userId || ("u_" + Date.now()),
          email: cleanEmail,
          displayName: (reqItem && reqItem.userName) || cleanEmail.split("@")[0],
          role: "premium",
          premiumExpiresAt: oneMonthFromNow,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          generationCount: 0,
          dailyGenerations: 0,
        });
      }

      saveJsonSafe(USERS_FILE, users);
      res.json({ success: true, updatedRole: "premium", premiumExpiresAt: oneMonthFromNow });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Reject upgrade request
  app.post("/api/upgrade-requests/reject", (req, res) => {
    try {
      const { requestId } = req.body;
      const list = loadJsonSafe<any[]>(UPGRADE_REQS_FILE, []);
      const reqItem = list.find(r => r.id === requestId);
      if (reqItem) {
        reqItem.status = "rejected";
        saveJsonSafe(UPGRADE_REQS_FILE, list);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Get all users with automatic Email-Based Deduplication & 1 Month Expiration validation
  app.get("/api/users", (req, res) => {
    const rawUsers = loadJsonSafe<any[]>(USERS_FILE, []);
    const deduplicatedMap = new Map<string, any>();
    const now = Date.now();

    for (const u of rawUsers) {
      if (!u) continue;
      const emailKey = String(u.email || u.uid || "").trim().toLowerCase();
      if (!emailKey) continue;

      // Validate 1 Month Premium expiration
      if (u.role === "premium" && u.premiumExpiresAt) {
        if (new Date(u.premiumExpiresAt).getTime() < now) {
          u.role = "normal";
        }
      }

      const existing = deduplicatedMap.get(emailKey);
      if (!existing) {
        deduplicatedMap.set(emailKey, { ...u });
      } else {
        // Merge records: highest role priority
        let bestRole = existing.role;
        if (u.role === "admin" || emailKey === "nwe98698@gmail.com") bestRole = "admin";
        else if (u.role === "premium" && bestRole !== "admin") bestRole = "premium";

        const bestName = (existing.displayName && !existing.displayName.includes("@"))
          ? existing.displayName
          : (u.displayName || existing.displayName || emailKey.split("@")[0]);

        const bestPhoto = existing.photoURL || u.photoURL || "";
        const maxGen = Math.max(existing.generationCount || 0, u.generationCount || 0);
        const bestExpiresAt = u.premiumExpiresAt || existing.premiumExpiresAt;

        deduplicatedMap.set(emailKey, {
          ...existing,
          ...u,
          displayName: bestName,
          photoURL: bestPhoto,
          role: bestRole,
          generationCount: maxGen,
          premiumExpiresAt: bestExpiresAt
        });
      }
    }

    const cleanUsers = Array.from(deduplicatedMap.values());
    res.json(cleanUsers);
  });

  // API: Sync user
  app.post("/api/users/sync", (req, res) => {
    try {
      const profile = req.body;
      if (!profile || !profile.email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const cleanEmail = profile.email.trim().toLowerCase();
      const users = loadJsonSafe<any[]>(USERS_FILE, []);
      const idx = users.findIndex(u => u.uid === profile.uid || u.email?.toLowerCase() === cleanEmail);
      
      if (idx !== -1) {
        // Preserve existing premium if still valid within 1 Month
        const existing = users[idx];
        let roleToKeep = profile.role || existing.role || "normal";
        let expiresAtToKeep = profile.premiumExpiresAt || existing.premiumExpiresAt;

        if (cleanEmail === "nwe98698@gmail.com") {
          roleToKeep = "admin";
        } else if (existing.role === "premium") {
          if (existing.premiumExpiresAt && new Date(existing.premiumExpiresAt).getTime() > Date.now()) {
            roleToKeep = "premium";
            expiresAtToKeep = existing.premiumExpiresAt;
          }
        }

        users[idx] = { 
          ...existing, 
          ...profile, 
          email: cleanEmail,
          role: roleToKeep,
          premiumExpiresAt: expiresAtToKeep 
        };
      } else {
        users.push({ ...profile, email: cleanEmail });
      }
      saveJsonSafe(USERS_FILE, users);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Get current user role and profile by email or UID with 1 Month validity check
  app.get("/api/users/me", (req, res) => {
    try {
      const email = String(req.query.email || "").trim().toLowerCase();
      const uid = String(req.query.uid || "").trim();

      if (!email && !uid) {
        return res.status(400).json({ error: "email or uid is required" });
      }

      const users = loadJsonSafe<any[]>(USERS_FILE, []);
      let target = users.find(
        (u) =>
          (email && u.email?.toLowerCase() === email) ||
          (uid && u.uid === uid)
      );

      // Guarantee admin role for bootstrap admin nwe98698@gmail.com
      if (email === "nwe98698@gmail.com" || (target && target.email?.toLowerCase() === "nwe98698@gmail.com")) {
        if (target) {
          target.role = "admin";
          saveJsonSafe(USERS_FILE, users);
        } else {
          target = {
            uid: uid || "admin_nwe98698",
            email: "nwe98698@gmail.com",
            displayName: "Admin Lin Zaw",
            role: "admin",
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            generationCount: 0,
            dailyGenerations: 0,
          };
          users.push(target);
          saveJsonSafe(USERS_FILE, users);
        }
      }

      // Check 1 Month Premium expiration
      if (target && target.role === "premium") {
        if (target.premiumExpiresAt) {
          if (new Date(target.premiumExpiresAt).getTime() < Date.now()) {
            target.role = "normal";
            delete target.premiumExpiresAt;
            saveJsonSafe(USERS_FILE, users);
          }
        }
      }

      // Check if an approved upgrade request exists for this user email
      if (email) {
        const reqs = loadJsonSafe<any[]>(UPGRADE_REQS_FILE, []);
        const approvedReq = reqs.find(
          (r) =>
            r.userEmail?.toLowerCase() === email && r.status === "approved"
        );
        if (approvedReq) {
          const defaultExpiresAt = approvedReq.createdAt
            ? new Date(new Date(approvedReq.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

          if (new Date(defaultExpiresAt).getTime() > Date.now()) {
            if (target) {
              target.role = "premium";
              target.premiumExpiresAt = target.premiumExpiresAt || defaultExpiresAt;
              saveJsonSafe(USERS_FILE, users);
            } else {
              target = {
                uid: uid || approvedReq.userId || ("u_" + Date.now()),
                email: email,
                displayName: approvedReq.userName || email.split("@")[0],
                role: "premium",
                premiumExpiresAt: defaultExpiresAt,
                createdAt: approvedReq.createdAt || new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
                generationCount: 0,
                dailyGenerations: 0,
              };
              users.push(target);
              saveJsonSafe(USERS_FILE, users);
            }
          }
        }
      }

      if (target) {
        // If forceLogout was triggered, return it and reset
        if (target.forceLogout) {
          const responsePayload = { ...target, forceLogout: true };
          target.forceLogout = false;
          saveJsonSafe(USERS_FILE, users);
          return res.json(responsePayload);
        }
        return res.json(target);
      }

      return res.status(404).json({ error: "User not found" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Update user role with 1 Month (30 Days) Premium duration
  app.post("/api/users/role", (req, res) => {
    try {
      const { userId, userEmail, newRole, premiumExpiresAt } = req.body;
      const cleanEmail = String(userEmail || "").trim().toLowerCase();
      const users = loadJsonSafe<any[]>(USERS_FILE, []);
      const oneMonthFromNow = premiumExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      let updated = false;
      users.forEach(u => {
        if ((userId && u.uid === userId) || (cleanEmail && u.email?.toLowerCase() === cleanEmail)) {
          u.role = newRole;
          if (newRole === "premium") {
            u.premiumExpiresAt = oneMonthFromNow;
          } else {
            delete u.premiumExpiresAt;
          }
          delete u.forceLogout;
          updated = true;
        }
      });

      if (!updated && cleanEmail) {
        users.push({
          uid: userId || ("u_" + Date.now()),
          email: cleanEmail,
          displayName: cleanEmail.split("@")[0],
          role: newRole,
          ...(newRole === "premium" ? { premiumExpiresAt: oneMonthFromNow } : {}),
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          generationCount: 0,
          dailyGenerations: 0,
        });
      }

      saveJsonSafe(USERS_FILE, users);
      res.json({ success: true, newRole, premiumExpiresAt: newRole === "premium" ? oneMonthFromNow : null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Force Logout / Revoke User Session (Admin function)
  app.post("/api/users/revoke-session", (req, res) => {
    try {
      const { userId, userEmail, deleteUser } = req.body;
      const cleanEmail = String(userEmail || "").trim().toLowerCase();
      let users = loadJsonSafe<any[]>(USERS_FILE, []);

      if (deleteUser) {
        users = users.filter(u => !(
          (userId && u.uid === userId) || 
          (cleanEmail && u.email?.toLowerCase() === cleanEmail)
        ));
      } else {
        users.forEach(u => {
          if ((userId && u.uid === userId) || (cleanEmail && u.email?.toLowerCase() === cleanEmail)) {
            u.forceLogout = true;
            u.role = "normal";
            delete u.premiumExpiresAt;
          }
        });
      }

      saveJsonSafe(USERS_FILE, users);
      res.json({ success: true, message: deleteUser ? "User completely deleted from database" : "User session revoked" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Delete User and associated requests (Admin function)
  app.post("/api/users/delete", (req, res) => {
    try {
      const { userId, userEmail } = req.body;
      const cleanEmail = String(userEmail || "").trim().toLowerCase();
      
      let users = loadJsonSafe<any[]>(USERS_FILE, []);
      users = users.filter(u => !(
        (userId && u.uid === userId) || 
        (cleanEmail && u.email?.toLowerCase() === cleanEmail)
      ));
      saveJsonSafe(USERS_FILE, users);

      let reqs = loadJsonSafe<any[]>(UPGRADE_REQS_FILE, []);
      reqs = reqs.filter(r => !(
        (userId && r.userId === userId) || 
        (cleanEmail && r.userEmail?.toLowerCase() === cleanEmail)
      ));
      saveJsonSafe(UPGRADE_REQS_FILE, reqs);

      res.json({ success: true, message: "User and requests deleted permanently" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Setup static serving for production or fallback to Vite middleware
  const distPath = path.resolve(__dirname, "dist");
  const indexPath = path.resolve(distPath, "index.html");

  if (process.env.NODE_ENV === "production" && fs.existsSync(indexPath)) {
    console.log(`Serving static production files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(indexPath);
    });
  } else {
    console.log("Serving application using Vite middleware mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(port), "0.0.0.0", () => {
    console.log(`Lin Zaw TTS Pro running on http://0.0.0.0:${port}`);
  });
}

startServer();
