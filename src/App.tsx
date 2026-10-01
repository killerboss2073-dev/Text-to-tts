/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { 
  Volume2, 
  Play, 
  Pause, 
  Sparkles, 
  Download, 
  RotateCcw, 
  Sliders, 
  Mic, 
  FileText, 
  History, 
  Settings, 
  Check, 
  Trash2, 
  Copy, 
  Music, 
  Radio, 
  BookOpen, 
  Smile, 
  Zap, 
  VolumeX, 
  Info,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Subtitles
} from "lucide-react";

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
  const seconds = Math.floor(totalSeconds % 60);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(milliseconds).padStart(3, "0");

  return `${hh}:${mm}:${ss},${mmm}`;
}

interface VoiceOption {
  id: string;
  name: string;
  subtitle?: string;
  gender: "male" | "female";
  description: string;
  badge?: string;
  edgeVoice: string;
  lang: string;
  defaultSpeed?: number;
}

interface AudioHistoryItem {
  id: string;
  text: string;
  voiceName: string;
  createdAt: string;
  blobUrl: string;
  format: "mp3";
  fileSize?: string;
  srt?: string;
  singleLineSrt?: string;
  twoLineSrt?: string;
  wordSrt?: string;
  cues?: SubtitleCue[];
  singleLineCues?: SubtitleCue[];
  twoLineCues?: SubtitleCue[];
}

const VOICES: VoiceOption[] = [
  { id: "thiha", name: "သီဟ (Thiha)", gender: "male", description: "ကျားသံ သဘာဝဆန်ပြီး တည်ငြိမ်သော အသံ", badge: "အဓိက", edgeVoice: "my-MM-ThihaNeural", lang: "my-MM" },
  { id: "nilar", name: "နီလာ (Nilar)", gender: "female", description: "မသံ ချိုသာပြီး ရှင်းလင်းပြတ်သားသော အသံ", badge: "အဓိက", edgeVoice: "my-MM-NilarNeural", lang: "my-MM" },
  { 
    id: "mgkyawthu", 
    name: "မောင်ကျော်သူ", 
    subtitle: "(Giuseppe Fast Vibe ⚡ - Speed 1.3)", 
    gender: "male", 
    description: "ရယ်မောပျော်ရွှင်ဖွယ် သွက်လက်သောအသံ", 
    badge: "⚡ Fast Vibe", 
    edgeVoice: "it-IT-GiuseppeMultilingualNeural", 
    lang: "it-IT (Multilingual)", 
    defaultSpeed: 30 
  },
  { id: "saicsai", name: "ကိုစိုင်းစိုင်း", gender: "male", description: "လူငယ်ဆန်ဆန် ခပ်သွက်သွက် အသံ", edgeVoice: "my-MM-ThihaNeural", lang: "my-MM" },
  { id: "mafoofoo", name: "မဖူးဖူး", gender: "female", description: "နူးညံ့သိမ်မွေ့သော မိန်းကလေးအသံ", edgeVoice: "my-MM-NilarNeural", lang: "my-MM" },
  { id: "koneye", name: "ကိုနေတိုး", gender: "male", description: "ဇာတ်လမ်းနှင့် ရုပ်ရှင်ဇာတ်ညွှန်းများအတွက်", edgeVoice: "my-MM-ThihaNeural", lang: "my-MM" },
  { id: "kqaung", name: "ကိုအောင်ရဲလင်း", gender: "male", description: "သတင်းဖတ်ရန် အထူးသင့်လျော်သော အသံ", edgeVoice: "my-MM-ThihaNeural", lang: "my-MM" },
  { id: "komyint", name: "ကိုမြင့်မြတ်", gender: "male", description: "အားမာန်ပါသော ကြေငြာသံ", edgeVoice: "my-MM-ThihaNeural", lang: "my-MM" },
  { id: "mawathsu", name: "မဝတ်မှုံရွှေရည်", gender: "female", description: "ဖတ်စာနှင့် ဝတ္ထုများအတွက်", edgeVoice: "my-MM-NilarNeural", lang: "my-MM" },
];

const TONE_CATEGORIES = [
  { id: "normal", label: "ပုံမှန်သံ", icon: Volume2 },
  { id: "male1", label: "ကျားကြီး ၁", icon: Radio },
  { id: "male2", label: "ကျားကြီး ၂", icon: Radio },
  { id: "nilar_var", label: "နီလာ ခွဲသံ", icon: Music },
  { id: "mix15", label: "ပေါင်းစပ် ၁၅", icon: Sliders },
  { id: "mix70", label: "ပေါင်းစပ် ၇၀", icon: Sliders },
];

const SAMPLE_TEXTS = [
  "မင်္ဂလာပါခင်ဗျာ။ လင်းဇော် အသံထွက် စတူဒီယိုမှ ကြိုဆိုပါတယ်။ အသံဖိုင်များကို အရည်အသွေးမြင့် .mp3 ဖိုင်အဖြစ် အလွယ်တကူ ဒေါင်းလုဒ်ရယူနိုင်ပါပြီ။",
  "မြန်မာနိုင်ငံ၏ သဘာဝအလှအပများနှင့် ရှေးဟောင်းယဉ်ကျေးမှု အမွေအနှစ်များကို လေ့လာနိုင်ရန် ဖိတ်ခေါ်အပ်ပါသည်။",
  "သတင်းထုတ်ပြန်ချက်။ ယနေ့ညနေပိုင်းတွင် ရန်ကုန်မြို့၌ အထူးဆွေးနွေးပွဲ ကျင်းပမည်ဖြစ်ပါသည်။",
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"studio" | "srt_tool" | "ai" | "history" | "settings">("studio");
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICES[0]);
  const [selectedTone, setSelectedTone] = useState<string>("normal");
  const [text, setText] = useState<string>(SAMPLE_TEXTS[0]);
  const [speed, setSpeed] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentBlobUrl, setCurrentBlobUrl] = useState<string | null>(null);
  const [currentSingleLineSrt, setCurrentSingleLineSrt] = useState<string>("");
  const [currentTwoLineSrt, setCurrentTwoLineSrt] = useState<string>("");
  const [singleLineCues, setSingleLineCues] = useState<SubtitleCue[]>([]);
  const [twoLineCues, setTwoLineCues] = useState<SubtitleCue[]>([]);
  const [activeCueId, setActiveCueId] = useState<number | null>(null);
  const [subtitleMode, setSubtitleMode] = useState<"single" | "two">("single");
  const [showSrtModal, setShowSrtModal] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);
  const [history, setHistory] = useState<AudioHistoryItem[]>([]);
  
  // SRT Alignment Tool State
  const [srtToolInput, setSrtToolInput] = useState<string>(
`ကြက်ကြော်ပြီးလို့ လသာဆောင်ကနေ
ဆီပူတွေသွန်ချလိုက်တဲ့ အဘွားကြီးတစ်ယောက်ရဲ့
ဆီပူတွေဟာ ကုမ္ပဏီအမှုဆောင်
ဒါရိုက်တာတစ်ယောက်ပေါ်ကို ကျရောက်တော့မယ့်အချိန်မှာပဲ
နယ်ကနေရောက်လာတဲ့ မိန်းကလေးတစ်ယောက်က
ဒါကိုမြင်ပြီး တွေးမနေတော့ဘဲ
ဒါရိုက်တာကို တွန်းထုတ်ပြီး
အသက်ကယ်လိုက်တယ်၊
ဒါရိုက်တာက ကျေးဇူးတင်တဲ့အနေနဲ့
သူနဲ့လက်ထပ်ဖို့ ဆုံးဖြတ်လိုက်တယ်
ဒါပေမဲ့ နောက်တစ်နေ့မနက်နိုးလာတော့
အဲ့ဒီမိန်းကလေးကို မတွေ့ရတော့ဘူး၊
တစ်နှစ်လောက်ကြာတဲ့အခါ အဲ့ဒီမိန်းကလေးက
ဒါရိုက်တာနဲ့ရတဲ့ သားလေးတစ်ယောက်ကို
မွေးဖွားလိုက်တယ်၊
ဒါပေမဲ့ သူ့ရဲ့ဖခင်ဖြစ်သူက
ကလေးကို မွေးကင်းစမှာပဲ ခိုးယူသွားပြီး
မိဘမဲ့ဂေဟာတစ်ခုကို ပို့လိုက်တယ်၊
အဲ့ဒီအချိန်မှာပဲ ဒါရိုက်တာက
မိဘမဲ့ဂေဟာကို ရောက်လာပြီး ကလေးဘေးမှာရှိတဲ့
ပစ္စည်းတွေကို ကြည့်လိုက်တယ်
သူကိုယ်တိုင် အဲ့ဒီမိန်းကလေးကို
ပေးခဲ့တဲ့ လည်စည်းကို
တွေ့လိုက်ရတယ်၊
ဒီလည်စည်းက ဘယ်ကရောက်လာတာလဲ၊
ဒီကလေးရဲ့ မိဘတွေက
ဘယ်သူတွေလဲ၊
ဒီကလေးက ကံဆိုးလိုက်တာ၊
ဘယ်သူခေါ်လာတာလဲလို့ မေးလိုက်တယ်
သူ့အမေက မွေးဖွားရင်းနဲ့ သေဆုံးသွားတယ်လို့
ပြောတယ်၊
ရန်ကင်း၊
ဘာတွေဖြစ်နေတာလဲ၊
ဖေဖေက ငါ့သားလို့ ခေါ်လိုက်တယ်၊
ကျွန်တော် တစ်ခုခုကို
သေချာအောင် စစ်ဆေးဖို့လိုတယ်၊
ဆက်ပြီးတော့ ကျွန်တော်တို့ ရလဒ်တွေ
ထွက်လာပြီ စစ်ဆေးချက်အရ သူက
ဒါရိုက်တာရဲ့ အရင်းအနှီးသားအရင်း
ဖြစ်နေတာကို အတည်ပြုနိုင်ခဲ့တယ်၊
ကောင်းလိုက်တာ၊
ဖူးမိသားစုမှာ နောက်ဆုံးတော့
အမွေခံရပြီ၊
သူ့ကို ဖူးရှောင်နျန်လို့ နာမည်ပေးမယ်
သူ့အမေ ဆုံးပါးသွားပြီဖြစ်တဲ့အတွက်
ဒီနေ့ကစပြီး သူက
ဖူးမိသားစုရဲ့ အမွေခံဖြစ်လာမယ်၊
ကျွန်တော် သူ့ကို
ကာကွယ်ပြီး ပြုစုပျိုးထောင်မယ်၊
ပြီးတော့ ကလေးရဲ့ အရင်မှတ်တမ်းတွေကို
အကုန်ဖျက်ပစ်လိုက်တယ်
သူက ဖူးမိသားစုရဲ့ တရားဝင်အမွေခံဖြစ်လာတယ်
နောင်တစ်ချိန်မှာ ဘယ်သူမှ သူ့ရဲ့ဇစ်မြစ်ကို
မေးခွန်းထုတ်လို့မရအောင်ပေါ့၊
အာ မစ္စတာဖူး ကလေးလေးက
နို့မှုန့်ကို မသောက်ချင်ဘူး၊
ကိုယ်အလေးချိန်လည်း ကျနေပြီ၊
ဆရာဝန်က ဘာဖြစ်တာလဲဆိုတာကို
ရှင်းပြတယ်၊
ဘာလို့ သူက
မစားချင်တာလဲ မစ္စတာဖူး၊
ဒီကလေးလေးက ထူးခြားတဲ့ အခြေအနေရှိတယ်၊
နို့မှုန့်က သူ့အတွက် အာဟာရမလုံလောက်ဘူး၊
ဒီအတိုင်း ဆက်ဖြစ်နေရင် အာဟာရချို့တဲ့ပြီး
ဖွံ့ဖြိုးမှုအပေါ် ထိခိုက်နိုင်တယ်
အာဟာရချို့တဲ့ပြီး ဖွံ့ဖြိုးမှုအပေါ်
ထိခိုက်နိုင်တယ် ဒါဆို ကျွန်တော်တို့
ဘာလုပ်ရမလဲ၊
ရှောင်နျန်ကို ဘယ်လိုကယ်တင်ရမလဲဆိုတာပဲ
ကျွန်တော် သိချင်တယ်
သူက ဖူးမိသားစုရဲ့ တစ်ဦးတည်းသော
အမွေခံဖြစ်တဲ့အတွက် မိခင်နို့တိုက်ကျွေးတာက
အလုံခြုံဆုံးပဲ၊
နို့တိုက်ကျွေးဖူးတဲ့ အတွေ့အကြုံရှိတဲ့
သူနာပြုတွေကို တစ်နိုင်ငံလုံး
အတိုင်းအတာနဲ့ အမြန်ဆုံး ရှာဖွေခိုင်းလိုက်
သူတို့ အဆင်ပြေအောင် လုပ်ပေးနိုင်ပါတယ်
ကောင်းကောင်းစားကြပါ ကျွန်တော်တို့
ဘယ်လိုတောင်းဆိုချက်ကိုမဆို လိုက်လျောပါ့မယ်
ဟုတ်ကဲ့ခင်ဗျာ ကျွန်တော် အခုချက်ချင်း
လုပ်ပေးပါ့မယ် ကျွန်တော့်သား
ဘယ်မှာလဲဆိုတာ ပြောပြပေးပါ
သူ ဘယ်မှာလဲဆိုတာ
ပြောပြပေးပါ ကျွန်တော် ဘာမဆိုလုပ်ပါ့မယ်
ခင်ဗျားအတွက် အလုပ်လုပ်ပေးပါ့မယ်
ကျွန်တော် တောင်းပန်ပါတယ်
ကျွန်တော့်သား ဘယ်မှာလဲဆိုတာ
တစ်ခေါက်လောက်တော့ မြင်ခွင့်ပေးပါ
တော်ပြီ တော်ပြီ သနားစရာကောင်းတဲ့ပုံစံ
လုပ်မနေနဲ့တော့ ကျွန်တော် စိတ်နှလုံးမာကျောသူ
မဟုတ်ပါဘူး အမှန်အတိုင်း ပြောရရင်
ကျွန်တော် ကလေးကို
မိဘမဲ့ဂေဟာတစ်ခုကို ပို့လိုက်တယ်
အဲဒီမှာ သူကောင်းကောင်းစားရတယ်
သူ့ကို စောင့်ရှောက်ပေးမယ့်သူလည်း
ရှိတယ်
ခင်ဗျားနဲ့နေတာထက် အများကြီးပိုကောင်းပါတယ်
ဘယ်မိဘမဲ့ဂေဟာလဲ ပြောပြပါ
ဘာလုပ်မလို့လဲ ခင်ဗျားက
ကျွန်တော့်ကို အမိန့်ပေးနိုင်မယ်လို့
ထင်နေတာလား ကျွန်တော်သာ နေရာကို
ပြောလိုက်ရင် ခင်ဗျား အလုပ်ကို
အာရုံစိုက်တော့မှာ မဟုတ်ဘူး
အရင်ဆုံး ကျန်းမာရေးပြန်ဂရုစိုက်ပြီး
အကြွေးတွေဆပ်ဖို့ အလုပ်လုပ်ပါ
ပိုက်ဆံလုံလောက်ပြီဆိုမှ ခင်ဗျားကို
ပြောပြဖို့ စဉ်းစားပေးမယ် ဘယ်မှာလဲဆိုတာ
နားလည်လား ကျွန်တော် မငိုတော့ဘူး
ပိုက်ဆံရှိရင် ဘာမဆို ဖြေရှင်းလို့ရတယ်
ပိုက်ဆံမရှိရင်တော့ ကြည့်ရသေးတာပေါ့
ကျွန်တော့်ကလေးကို ပြန်ရဖို့
ဘယ်လိုအလုပ်မျိုး ရှာရမလဲ ကျွန်တော့်မှာ
နို့တွေ ပြန်ထွက်လာတယ်
ကျွန်တော် ဘာလုပ်ရမလဲ အဖွဲ့က
လစာကောင်းကောင်းနဲ့ အကူရှာနေတယ်
အလုပ်သာ အမြန်ရရင် လုံလောက်အောင်
စုမိမှာပါ အဲဒီအမျိုးသမီး ရောက်လာပြီ
နှုတ်ဆက်လိုက်ပါ ဒီစိန်တွေလိုပဲ
ကလေးတိုင်းကိုလည်း ငြိမ်အောင်လုပ်ထားမယ်
ဒါကိုတော့ ကျွန်မ သိမ်းထားလိုက်မယ်
သူတို့အားလုံး အဝတ်တွေ ချွတ်ခိုင်းလိုက်
ငါတို့က သူရဲကောင်းဖြစ်ဖို့
လာတာလေ ဘာလို့ အဝတ်ချွတ်ရမှာလဲ
သူတို့မလုပ်ချင်ရင် အခုချက်ချင်း
ထွက်သွားလို့ရတယ် ဒီအလုပ်အတွက်
လျှောက်ထားသူတွေ အများကြီးပဲ
မစ္စဘိုင် သူမက
မစ္စတာနဲ့ စေ့စပ်ထားတာ
မဟုတ်ပါဘူး ဘိုင်မိသားစုရဲ့
အမွေဆက်ခံသူနဲ့ ဒီအိမ်ကြီးရဲ့
အနာဂတ်ပိုင်ရှင်ပါ သူမကို
ဒေါသထွက်အောင် လုပ်လို့မရဘူး
သန့်ရှင်းမှုမရှိရင် အလုပ်မဖြစ်ဘူး
နို့မှာ ဆေးဝါးတွေ ပါနေတယ်
မကောင်းဘူး ထွက်သွားကြစမ်း မင်းတို့လည်း
အသုံးမကျဘူး ပြောထားတဲ့သူတွေကို
ပြန်ခိုင်းလိုက်လို့ရတယ် မင်း
ဒီကို အဲဒီအပြုံးနဲ့ ရောက်လာတာပေါ့
အလုပ်လုပ်ဖို့ လာတာဆိုရင် မှန်နဲ့
နီးအောင်ပဲ ချဉ်းကပ်ချင်နေတာနေမှာပေါ့
ဒီမှာ အဲဒီလိုလူမျိုးတွေ မလိုဘူး
အခုချက်ချင်း ထွက်သွား
မစ္စဘိုင် စုနီယန်ရဲ့နို့က
အကောင်းဆုံးပဲ ကလေးလေးကို
ကျွန်မတို့ နို့တိုက်လိုက်တယ်
သူမကပဲ သောက်လိုက်တာ
ကျွန်တော် အရေးမစိုက်ပါဘူး
ကလေးက ကျွန်တော် ငြင်းထားတာကို
မသိရှာဘူး မစ္စတာပေါလ်ယန်ရှင်
ထွက်သွားပါ ကျွန်တော် ရှောင်လင်အတွက်
ထိန်းကျောင်းသူ ရွေးနေတာပါ
တချို့လူတွေက ကိုယ့်နေရာကိုယ်မသိဘဲ
မစ္စတာဖူးကို စိုက်ကြည့်ရဲတယ်
မင်းကိုယ်မင်း ဘာမှတ်နေလဲ ဖူးမိသားစုနဲ့
ပတ်သက်ချင်နေတဲ့ နယ်က
အဘွားကြီးတစ်ယောက်ပဲ မဟုတ်လား။
ကျွန်မ ရည်ရွယ်ချက်မဟုတ်ပါဘူး
ပြီးတော့ မင်းက
လိမ်ညာနေသေးတယ် မင်းလိုလူမျိုးက
ကလေးကို ပြုစုဖို့ မထိုက်တန်ဘူး
အခုချက်ချင်း ထွက်သွားစမ်း ဒီမှာ
ဘာဖြစ်နေတာလဲ အဲ့ဒီဆူညံသံက
ဘာလဲ ရန်ဖြစ်နေတာလား ဘာတွေဖြစ်နေတာလဲ
သနားစရာပုံစံလုပ်နေတာ ရပ်လိုက်
မစ္စတာဖူးကို မင်းတို့ မထိနဲ့
ဖူးအမျိုးသမီး ကျွန်မကို
မြို့ကိုခေါ်သွားပေးပါ ကျွန်မကို
မင်းဆီမှာ တွေ့နိုင်တယ်
မင်းက အရူးပဲ ဒါကြောင့်
မင်းအိပ်မက်မက်သမျှ အကုန်ပြောပြစမ်း
ပရိုဖိုင်သင်္ကေတကို နှိပ်ပါ
အရေးကြီးတဲ့ သင်္ကေတ ပရိုဖိုင်သင်္ကေတကို
နှိပ်ပါ ဇာတ်လမ်းက
ဆက်သွားမှာပါ ပရိုဖိုင်သင်္ကေတကို
နှိပ်ပါ နောက်ထပ်အပိုင်းတွေက
ပိုကောင်းတယ် ပေါ့စ်သင်္ကေတနဲ့
အနီရောင်နှလုံးသားလေးကို ကြယ်ပုံစံကို
နှိပ်ပါ ပြီးရင် ကျွန်တော်တို့
ဆက်ကြည့်ကြမယ်`
  );
  const [srtToolDurationStr, setSrtToolDurationStr] = useState<string>("02:53.980");
  const [srtToolSingleResult, setSrtToolSingleResult] = useState<string>("");
  const [srtToolTwoResult, setSrtToolTwoResult] = useState<string>("");
  const [srtToolSingleCues, setSrtToolSingleCues] = useState<SubtitleCue[]>([]);
  const [srtToolTwoCues, setSrtToolTwoCues] = useState<SubtitleCue[]>([]);
  const [srtToolActiveMode, setSrtToolActiveMode] = useState<"single" | "two">("single");
  
  // AI Assistant state
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiCategory, setAiCategory] = useState<string>("သတင်း");
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("lin_zaw_tts_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  const saveHistoryToStorage = (newHistory: AudioHistoryItem[]) => {
    setHistory(newHistory);
    try {
      localStorage.setItem("lin_zaw_tts_history", JSON.stringify(newHistory));
    } catch (e) {
      console.error("Failed to save history", e);
    }
  };

  // Dedicated MP3 Audio & Exact SRT Subtitle Generation (Single Line & Two Lines)
  const handleGenerateAudio = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setIsPlaying(false);
    setStatusMessage("🎙️ MP3 အသံဖိုင်နှင့် စာတန်းထိုး (.SRT) ထုတ်လုပ်နေပါသည်...");

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: selectedVoice.id,
          tone: selectedTone,
          rate: speed === 0 ? "+0%" : speed > 0 ? `+${speed}%` : `${speed}%`,
          pitch: pitch === 0 ? "+0Hz" : pitch > 0 ? `+${pitch}Hz` : `${pitch}Hz`,
          format: "mp3",
          returnJson: true,
        }),
      });

      if (!response.ok) {
        throw new Error("အသံဖိုင်ထုတ်လုပ်ခြင်း မအောင်မြင်ပါ။");
      }

      const data = await response.json();
      
      // Convert base64 audio to Blob URL
      const byteCharacters = atob(data.audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const finalBlob = new Blob([byteArray], { type: "audio/mpeg" });
      const objectUrl = URL.createObjectURL(finalBlob);
      
      const sSrt = data.singleLineSrt || data.srt || "";
      const tSrt = data.twoLineSrt || "";
      const sCues = data.singleLineCues || data.cues || [];
      const tCues = data.twoLineCues || [];

      setCurrentBlobUrl(objectUrl);
      setCurrentSingleLineSrt(sSrt);
      setCurrentTwoLineSrt(tSrt);
      setSingleLineCues(sCues);
      setTwoLineCues(tCues);
      setActiveCueId(null);

      const sizeKb = (finalBlob.size / 1024).toFixed(1) + " KB";

      // Add to history
      const newItem: AudioHistoryItem = {
        id: Date.now().toString(),
        text: text.length > 50 ? text.substring(0, 50) + "..." : text,
        voiceName: selectedVoice.name,
        createdAt: new Date().toLocaleTimeString(),
        blobUrl: objectUrl,
        format: "mp3",
        fileSize: sizeKb,
        srt: sSrt,
        singleLineSrt: sSrt,
        twoLineSrt: tSrt,
        singleLineCues: sCues,
        twoLineCues: tCues,
      };

      saveHistoryToStorage([newItem, ...history]);

      // Play audio automatically and cleanly in audio element
      if (audioRef.current) {
        audioRef.current.src = objectUrl;
        audioRef.current.load();
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
            })
            .catch((err) => {
              console.warn("Audio autoplay blocked by browser:", err);
            });
        }
      }

      setStatusMessage(null);
    } catch (error: any) {
      console.error("Audio generation failed:", error);
      setStatusMessage("အသံဖိုင်ဖန်တီးရာတွင် အမှားအယွင်းရှိပါသည်: " + (error?.message || ""));
    } finally {
      setIsGenerating(false);
    }
  };

  // Pure MP3 File Downloader
  const handleDownloadFile = (blobUrlToDownload?: string, customName?: string) => {
    const url = blobUrlToDownload || currentBlobUrl;
    if (!url) return;

    const a = document.createElement("a");
    a.href = url;
    a.download = customName || `lin_zaw_speech_${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloadSuccessToast("အသံဖိုင် (.mp3) ကို အောင်မြင်စွာ ဒေါင်းလုဒ်ရယူပြီးပါပြီ။");
    setTimeout(() => {
      setDownloadSuccessToast(null);
    }, 3000);
  };

  // Pure .srt Subtitle File Downloader (guarantees strictly .srt file and never .srt.txt)
  const handleDownloadSrt = (
    modeOverride?: "single" | "two",
    customContent?: string,
    customFilename?: string
  ) => {
    const targetMode = modeOverride || subtitleMode;
    const content =
      customContent ||
      (targetMode === "two" ? currentTwoLineSrt : currentSingleLineSrt);

    if (!content) {
      alert("ဒေါင်းလုဒ်လုပ်ရန် SRT စာတန်းထိုး မရှိသေးပါ။ ဦးစွာ အသံဖိုင်ထုတ်လုပ်ပေးပါ။");
      return;
    }

    // Explicitly set MIME type to application/x-subrip to guarantee .srt file extension
    const blob = new Blob([content], { type: "application/x-subrip;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const modeLabel = targetMode === "two" ? "two_lines" : "single_line";
    const fname = customFilename || `lin_zaw_subtitles_${modeLabel}_${Date.now()}.srt`;
    a.setAttribute("download", fname);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccessToast(`"${fname}" စာတန်းထိုးဖိုင် (.srt) ကို အောင်မြင်စွာ ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။`);
    setTimeout(() => {
      setDownloadSuccessToast(null);
    }, 3500);
  };

  // Copy SRT to Clipboard
  const handleCopySrt = (modeOverride?: "single" | "two", customContent?: string) => {
    const targetMode = modeOverride || subtitleMode;
    const content =
      customContent ||
      (targetMode === "two" ? currentTwoLineSrt : currentSingleLineSrt);
    if (!content) return;
    navigator.clipboard.writeText(content);
    alert(`SRT ${targetMode === "two" ? "စာတန်းထိုး နှစ်ကြောင်း" : "စာတန်းထိုး တစ်ကြောင်း"} စာသားများကို ကူးယူပြီးပါပြီ။`);
  };

  const parseDurationToMs = (durStr: string): number => {
    const parts = durStr.trim().split(":");
    if (parts.length === 2) {
      const min = parseInt(parts[0], 10) || 0;
      const secParts = parts[1].split(/[.,]/);
      const sec = parseInt(secParts[0], 10) || 0;
      const ms = parseInt((secParts[1] || "0").padEnd(3, "0").slice(0, 3), 10) || 0;
      return min * 60000 + sec * 1000 + ms;
    } else if (parts.length === 3) {
      const hr = parseInt(parts[0], 10) || 0;
      const min = parseInt(parts[1], 10) || 0;
      const secParts = parts[2].split(/[.,]/);
      const sec = parseInt(secParts[0], 10) || 0;
      const ms = parseInt((secParts[1] || "0").padEnd(3, "0").slice(0, 3), 10) || 0;
      return hr * 3600000 + min * 60000 + sec * 1000 + ms;
    }
    const num = parseFloat(durStr);
    return isNaN(num) ? 173980 : Math.round(num * 1000);
  };

  const handleProcessSrtTool = () => {
    if (!srtToolInput.trim()) return;
    const targetDurMs = parseDurationToMs(srtToolDurationStr);
    const hasTimestamps = /\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(srtToolInput);

    let singleCues: SubtitleCue[] = [];

    if (hasTimestamps) {
      const blocks = srtToolInput.trim().split(/\n\s*\n/);
      for (const block of blocks) {
        const lines = block.trim().split(/\r?\n/);
        if (lines.length >= 2) {
          let timeLineIdx = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("-->")) {
              timeLineIdx = i;
              break;
            }
          }
          if (timeLineIdx !== -1) {
            const timeMatch = lines[timeLineIdx].match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
            if (timeMatch) {
              const textLines = lines.slice(timeLineIdx + 1).join("\n").trim();
              const parseMs = (tStr: string) => {
                const cleaned = tStr.replace(".", ",");
                const [h, m, sMs] = cleaned.split(":");
                const [s, ms] = sMs.split(",");
                return (
                  parseInt(h, 10) * 3600000 +
                  parseInt(m, 10) * 60000 +
                  parseInt(s, 10) * 1000 +
                  parseInt(ms, 10)
                );
              };
              const sMs = parseMs(timeMatch[1]);
              const eMs = parseMs(timeMatch[2]);
              if (textLines) {
                singleCues.push({
                  id: singleCues.length + 1,
                  startMs: sMs,
                  endMs: eMs,
                  startTime: formatSrtTimestamp(sMs),
                  endTime: formatSrtTimestamp(eMs),
                  text: textLines,
                });
              }
            }
          }
        }
      }
    } else {
      // Break input into short clauses (15-32 characters or split on punctuation/connectors)
      const rawLines = srtToolInput
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const atomicPhrases: string[] = [];
      for (const line of rawLines) {
        // Split by punctuation marks first
        const parts = line.split(/([၊။,\.\?!]+)/).map(s => s.trim()).filter(s => s.length > 0);
        for (let p = 0; p < parts.length; p++) {
          let part = parts[p];
          if (/[၊။,\.\?!]/.test(part) && atomicPhrases.length > 0) {
            atomicPhrases[atomicPhrases.length - 1] += part;
            continue;
          }
          if (part.length <= 32) {
            atomicPhrases.push(part);
          } else {
            // Split long phrase by words / connectors
            const words = part.split(/\s+/);
            let currentWords: string[] = [];
            for (const w of words) {
              currentWords.push(w);
              const curText = currentWords.join(" ");
              if (curText.length >= 24 || currentWords.length >= 3) {
                atomicPhrases.push(curText);
                currentWords = [];
              }
            }
            if (currentWords.length > 0) {
              atomicPhrases.push(currentWords.join(" "));
            }
          }
        }
      }

      const totalChars = atomicPhrases.reduce((acc, l) => acc + l.length, 0);
      let curMs = 45;
      const availableMs = targetDurMs - 100;

      for (let i = 0; i < atomicPhrases.length; i++) {
        const l = atomicPhrases[i];
        const lineFrac = l.length / Math.max(1, totalChars);
        const lineDur = Math.max(700, Math.round(availableMs * lineFrac));
        const sMs = curMs;
        const eMs = Math.min(targetDurMs, sMs + lineDur - 40);
        curMs = eMs + 35;

        singleCues.push({
          id: singleCues.length + 1,
          startMs: sMs,
          endMs: eMs,
          startTime: formatSrtTimestamp(sMs),
          endTime: formatSrtTimestamp(eMs),
          text: l,
        });
      }
    }

    const twoCues: SubtitleCue[] = [];
    for (let i = 0; i < singleCues.length; i += 2) {
      const c1 = singleCues[i];
      const c2 = singleCues[i + 1];
      if (c2) {
        twoCues.push({
          id: twoCues.length + 1,
          startMs: c1.startMs,
          endMs: c2.endMs,
          startTime: c1.startTime,
          endTime: c2.endTime,
          text: `${c1.text}\n${c2.text}`,
        });
      } else {
        twoCues.push({
          id: twoCues.length + 1,
          startMs: c1.startMs,
          endMs: c1.endMs,
          startTime: c1.startTime,
          endTime: c1.endTime,
          text: c1.text,
        });
      }
    }

    const singleSrt = singleCues
      .map((c) => `${c.id}\n${c.startTime} --> ${c.endTime}\n${c.text}`)
      .join("\n\n") + "\n";

    const twoSrt = twoCues
      .map((c) => `${c.id}\n${c.startTime} --> ${c.endTime}\n${c.text}`)
      .join("\n\n") + "\n";

    setSrtToolSingleResult(singleSrt);
    setSrtToolTwoResult(twoSrt);
    setSrtToolSingleCues(singleCues);
    setSrtToolTwoCues(twoCues);
  };

  // Jump Audio Playhead to Specific Subtitle Timestamp
  const seekToTime = (ms: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = ms / 1000;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const togglePlay = () => {
    if (audioRef.current && currentBlobUrl) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch((err) => {
          console.warn("Audio element play error:", err);
        });
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      handleGenerateAudio();
    }
  };

  const handleAiGenerateScript = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    try {
      const res = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          category: aiCategory,
        }),
      });
      const data = await res.json();
      if (data.text) {
        setText(data.text);
        setActiveTab("studio");
      } else {
        alert("စာမူထုတ်ယူ၍ မရပါ။");
      }
    } catch (e: any) {
      alert("AI Error: " + e.message);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const insertEmotion = (tag: string) => {
    setText((prev) => prev + " " + tag + " ");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-pink-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              လင်းဇော် အသံထွက် စတူဒီယို
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400 font-medium border border-pink-500/30">TTS Studio Pro</span>
            </h1>
            <p className="text-xs text-slate-400">Professional Burmese Text-to-Speech & Audio Downloader (.mp3)</p>
          </div>
        </div>

        {/* Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveTab("studio")}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "studio" ? "bg-gradient-to-r from-pink-600 to-violet-600 text-white shadow-md shadow-pink-600/20 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-800/50"}`}
          >
            <Mic className="w-3.5 h-3.5" />
            အသံထွက်စတူဒီယို
          </button>
          <button 
            onClick={() => {
              setActiveTab("srt_tool");
              if (!srtToolSingleResult) {
                handleProcessSrtTool();
              }
            }}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "srt_tool" ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/25 font-bold" : "text-amber-300 hover:text-white hover:bg-slate-800/50"}`}
          >
            <Subtitles className="w-3.5 h-3.5 text-amber-400" />
            SRT တည်းဖြတ်/ချိန်ညှိရန် (၂:၅၃)
          </button>
          <button 
            onClick={() => setActiveTab("ai")}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "ai" ? "bg-gradient-to-r from-pink-600 to-violet-600 text-white shadow-md shadow-pink-600/20 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-800/50"}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            Gemini AI စာမူရေးရန်
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "history" ? "bg-gradient-to-r from-pink-600 to-violet-600 text-white shadow-md shadow-pink-600/20 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-800/50"}`}
          >
            <History className="w-3.5 h-3.5" />
            မှတ်တမ်း ({history.length})
          </button>
          <button 
            onClick={() => setActiveTab("settings")}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "settings" ? "bg-gradient-to-r from-pink-600 to-violet-600 text-white shadow-md shadow-pink-600/20 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-800/50"}`}
          >
            <Settings className="w-3.5 h-3.5" />
            ဆက်တင်များ
          </button>
        </nav>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Toast Notification */}
        {downloadSuccessToast && (
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400 animate-bounce">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">{downloadSuccessToast}</span>
          </div>
        )}

        {statusMessage && (
          <div className="bg-pink-500/10 border border-pink-500/30 text-pink-300 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-pink-400" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Tab 1: Studio */}
        {activeTab === "studio" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left 8 cols: Text editor, emotion tags, tone presets, sample texts */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Text Input Card */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-pink-500" />
                    အသံထွက်ဖတ်ကြားမည့် မြန်မာစာသားများ ရိုက်ထည့်ပါ
                  </label>
                  <span className="text-xs text-slate-500">
                    {text.length} စာလုံးရေ
                  </span>
                </div>

                <div className="relative">
                  <textarea
                    rows={7}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="ဤနေရာတွင် အသံပြောင်းလိုသော မြန်မာစာသားများကို ရိုက်ထည့်ပါ သို့မဟုတ် ကူးယူထည့်သွင်းပါ..."
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500/60 focus:ring-1 focus:ring-pink-500/40 transition-all font-sans leading-relaxed resize-y"
                  />
                  <div className="absolute right-3 bottom-3 flex items-center gap-2">
                    <button
                      onClick={() => setText("")}
                      title="စာသားရှင်းလင်းမည်"
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(text);
                        alert("စာသားကို ကူးယူပြီးပါပြီ။");
                      }}
                      title="စာသားကူးယူမည်"
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Emotion / Expression Quick Tags */}
                <div className="space-y-2 pt-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Smile className="w-3.5 h-3.5 text-pink-400" />
                    ခံစားချက်နှင့် စည်းဝါး အသံထွက် တဂ်များ ထည့်သွင်းရန်:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "😄 ရယ်မောပျော်ရွှင်", tag: "(စိတ်လှုပ်ရှား 😄)" },
                      { label: "😌 အေးဆေးတည်ငြိမ်", tag: "(တည်ငြိမ် 😌)" },
                      { label: "💼 သတင်းကြေငြာ", tag: "(သတင်း 💼)" },
                      { label: "📖 ဇာတ်ကြောင်းပြော", tag: "(ဇာတ်ကြောင်း 📖)" },
                      { label: "🤨 လေးနက်ခိုင်မာ", tag: "(လေးနက် 🤨)" },
                      { label: "⏸️ ခေတ္တရပ်နား", tag: "။ ... " },
                    ].map((emo, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => insertEmotion(emo.tag)}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:text-pink-300 hover:border-pink-500/40 transition-colors cursor-pointer"
                      >
                        {emo.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Voice Actor Selector */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Mic className="w-4 h-4 text-pink-500" />
                    မြန်မာ အသံရှင်များ ရွေးချယ်ပါ (Burmese Voices)
                  </h2>
                  <span className="text-xs text-pink-400 font-medium">
                    {VOICES.length} သံစုံပါဝင်
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {VOICES.map((v) => {
                    const isSelected = selectedVoice.id === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          setSelectedVoice(v);
                          if (v.defaultSpeed !== undefined) {
                            setSpeed(v.defaultSpeed);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          isSelected
                            ? "bg-pink-600/15 border-pink-500/80 shadow-lg shadow-pink-500/10 ring-1 ring-pink-500/50"
                            : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/40"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              {v.name}
                            </span>
                            {v.badge && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 font-semibold border border-pink-500/30">
                                {v.badge}
                              </span>
                            )}
                          </div>
                          {v.subtitle && (
                            <span className="text-[10px] text-amber-300 font-medium block leading-tight">
                              {v.subtitle}
                            </span>
                          )}
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-tight">
                            {v.description}
                          </p>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
                          <span>{v.gender === "male" ? "👨 ကျားသံ" : "👩 မသံ"}</span>
                          <span className="text-emerald-400 font-mono text-[9px] truncate max-w-[100px]">{v.lang}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tone Categories */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  လေယူလေသိမ်းနှင့် အသံဟန် (Tone Variations)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {TONE_CATEGORIES.map((tone) => {
                    const isSelected = selectedTone === tone.id;
                    const Icon = tone.icon;
                    return (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => setSelectedTone(tone.id)}
                        className={`p-3 rounded-2xl border text-xs flex flex-col items-center gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-purple-600/20 border-purple-500 text-purple-300 shadow-md"
                            : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-900"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium text-[11px]">{tone.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sample Texts */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-pink-400" />
                  စမ်းသပ်ဖတ်ရှုရန် နမူနာစာသားများ:
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {SAMPLE_TEXTS.map((sample, idx) => (
                    <div
                      key={idx}
                      onClick={() => setText(sample)}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-pink-500/40 text-[11px] text-slate-300 hover:text-white cursor-pointer transition-all line-clamp-2"
                    >
                      {sample}
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right 4 cols: Speed slider, Pitch slider, MP3 Info, Generate and Download buttons */}
            <div className="lg:col-span-4 space-y-6">
              
              <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-6">
                
                <div className="space-y-4">
                  {/* Format Card: Pure MP3 Only */}
                  <div className="bg-[#141d2e] border border-[#23314d] rounded-2xl p-4 flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center border border-pink-500/30">
                        <Music className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-2">
                          အသံဖိုင် ဖော်မတ်
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/30">
                            .MP3 သီးသန့်
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">ဖုန်းအားလုံးနှင့် Player အားလုံးတွင် တိုက်ရိုက်ဖွင့်နိုင်ပါသည်</p>
                      </div>
                    </div>
                  </div>

                  {/* Speed Card */}
                  <div className="bg-[#141d2e] border border-[#23314d] rounded-3xl p-4 md:p-5 shadow-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-200 tracking-wide">
                        အမြန်နှုန်း (SPEED)
                      </span>
                      <span className="px-4 py-1 rounded-xl bg-[#e6397c] text-white font-bold text-sm shadow-md shadow-pink-500/25 min-w-[38px] text-center">
                        {speed}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSpeed((prev) => Math.max(-50, prev - 5))}
                        className="w-12 h-12 rounded-2xl bg-[#1b253b] border border-[#2a3856] hover:bg-[#23314d] text-slate-200 hover:text-white flex items-center justify-center font-bold text-2xl active:scale-95 transition-all shadow-inner cursor-pointer shrink-0"
                        title="အမြန်နှုန်းလျှော့ရန် (-5)"
                      >
                        −
                      </button>
                      
                      <div className="relative flex-1 h-9 bg-[#0d131f] border border-[#1f2b44] rounded-full p-1 flex items-center">
                        <div 
                          className="h-7 rounded-full bg-gradient-to-r from-[#4f46e5] via-[#8b5cf6] to-[#ec4899] flex items-center justify-end pr-0.5 transition-all shadow-sm"
                          style={{ width: `${Math.max(14, Math.min(100, ((speed + 50) / 100) * 100))}%` }}
                        >
                          <div className="w-6 h-6 rounded-full bg-white border-[3px] border-[#ec4899] shadow-md shrink-0"></div>
                        </div>

                        <input
                          type="range"
                          min={-50}
                          max={50}
                          step={5}
                          value={speed}
                          onChange={(e) => setSpeed(Number(e.target.value))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setSpeed((prev) => Math.min(50, prev + 5))}
                        className="w-12 h-12 rounded-2xl bg-[#1b253b] border border-[#2a3856] hover:bg-[#23314d] text-slate-200 hover:text-white flex items-center justify-center font-bold text-2xl active:scale-95 transition-all shadow-inner cursor-pointer shrink-0"
                        title="အမြန်နှုန်းတိုးရန် (+5)"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Pitch Card */}
                  <div className="bg-[#141d2e] border border-[#23314d] rounded-3xl p-4 md:p-5 shadow-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-200 tracking-wide">
                        အသံ အတက်/အကျ (PITCH)
                      </span>
                      <span className="px-4 py-1 rounded-xl bg-[#8b5cf6] text-white font-bold text-sm shadow-md shadow-purple-500/25 min-w-[38px] text-center">
                        {pitch}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPitch((prev) => Math.max(-50, prev - 5))}
                        className="w-12 h-12 rounded-2xl bg-[#1b253b] border border-[#2a3856] hover:bg-[#23314d] text-slate-200 hover:text-white flex items-center justify-center font-bold text-2xl active:scale-95 transition-all shadow-inner cursor-pointer shrink-0"
                        title="အသံနိမ့်ရန် (-5)"
                      >
                        −
                      </button>
                      
                      <div className="relative flex-1 h-9 bg-[#0d131f] border border-[#1f2b44] rounded-full p-1 flex items-center">
                        <div 
                          className="h-7 rounded-full bg-gradient-to-r from-[#4f46e5] via-[#8b5cf6] to-[#ec4899] flex items-center justify-end pr-0.5 transition-all shadow-sm"
                          style={{ width: `${Math.max(14, Math.min(100, ((pitch + 50) / 100) * 100))}%` }}
                        >
                          <div className="w-6 h-6 rounded-full bg-white border-[3px] border-[#8b5cf6] shadow-md shrink-0"></div>
                        </div>

                        <input
                          type="range"
                          min={-50}
                          max={50}
                          step={5}
                          value={pitch}
                          onChange={(e) => setPitch(Number(e.target.value))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setPitch((prev) => Math.min(50, prev + 5))}
                        className="w-12 h-12 rounded-2xl bg-[#1b253b] border border-[#2a3856] hover:bg-[#23314d] text-slate-200 hover:text-white flex items-center justify-center font-bold text-2xl active:scale-95 transition-all shadow-inner cursor-pointer shrink-0"
                        title="အသံမြင့်ရန် (+5)"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">ရွေးချယ်ထားသော အသံ:</span>
                      <span className="text-white font-medium">{selectedVoice.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">အသံထွက်စနစ်:</span>
                      <span className="text-pink-400 font-medium">Consistent Natural Neural Engine</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">အသံဖိုင်အရွယ်အစား:</span>
                      <span className="text-emerald-400 font-medium">Standard MP3 Audio</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  {/* Generate Button */}
                  <button
                    onClick={handleGenerateAudio}
                    disabled={isGenerating || !text.trim()}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-pink-600 via-purple-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-pink-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        အသံဖိုင် ဖန်တီးနေပါသည်...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 fill-white" />
                        အသံဖိုင်ထုတ်မည် (Generate MP3)
                      </>
                    )}
                  </button>

                  {/* Visible HTML5 Audio Player */}
                  <div className={`bg-[#0e1626] border border-[#1f2d47] rounded-2xl p-3.5 space-y-2.5 shadow-md ${currentBlobUrl ? 'block' : 'hidden'}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4 text-pink-400" />
                        အသံဖိုင် ဖွင့်စက် (MP3 Audio Player)
                      </span>
                      <span className="text-emerald-400 uppercase font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        .MP3 Ready
                      </span>
                    </div>
                    
                    <audio
                      ref={audioRef}
                      controls
                      className="w-full h-10 rounded-xl accent-pink-500 bg-slate-900"
                      src={currentBlobUrl || undefined}
                      onTimeUpdate={(e) => {
                        const curTimeMs = (e.currentTarget.currentTime || 0) * 1000;
                        const activeList = subtitleMode === "two" ? twoLineCues : singleLineCues;
                        const active = activeList.find(
                          (c) => c.startMs <= curTimeMs && curTimeMs <= c.endMs + 100
                        );
                        if (active) {
                          setActiveCueId(active.id);
                        }
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => {
                        setIsPlaying(false);
                        setActiveCueId(null);
                      }}
                    />
                  </div>

                  {/* Playback & Direct Download Controls */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-4 h-4 text-pink-400" /> : <Play className="w-4 h-4" />}
                      {isPlaying ? "ရပ်မည် (Pause)" : "နားဆင်မည်"}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleDownloadFile()}
                      disabled={!currentBlobUrl}
                      className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg shadow-emerald-600/20"
                    >
                      <Download className="w-4 h-4" />
                      ဒေါင်းလုဒ် (.MP3)
                    </button>
                  </div>

                  {/* Exact Synchronized SRT Subtitles Panel (Single Line & Two Lines) */}
                  {(currentSingleLineSrt || currentTwoLineSrt) && (
                    <div className="bg-[#0e1626] border border-[#1f2d47] rounded-2xl p-4 space-y-3.5 shadow-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Subtitles className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-bold text-white">
                            SRT စာတန်းထိုးစနစ် (.SRT Subtitles)
                          </span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono font-bold">
                          .SRT Pure File
                        </span>
                      </div>

                      {/* Mode Switcher: စာတန်းထိုး တစ်ကြောင်း vs စာတန်းထိုး နှစ်ကြောင်း */}
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/90 rounded-xl border border-slate-800/90">
                        <button
                          type="button"
                          onClick={() => setSubtitleMode("single")}
                          className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            subtitleMode === "single"
                              ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <span>1️⃣ စာတန်းထိုး တစ်ကြောင်း</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubtitleMode("two")}
                          className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            subtitleMode === "two"
                              ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <span>2️⃣ စာတန်းထိုး နှစ်ကြောင်း</span>
                        </button>
                      </div>

                      {/* Action buttons: Download Single Line, Download Two Lines, Copy */}
                      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleDownloadSrt("single")}
                          className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow ${
                            subtitleMode === "single"
                              ? "bg-amber-500 hover:bg-amber-400 text-slate-950 ring-1 ring-amber-400"
                              : "bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30"
                          }`}
                          title="စာတန်းထိုး တစ်ကြောင်း .srt ဖိုင် ဒေါင်းလုဒ်လုပ်မည်"
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                          <span>.SRT တစ်ကြောင်း</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadSrt("two")}
                          className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow ${
                            subtitleMode === "two"
                              ? "bg-amber-500 hover:bg-amber-400 text-slate-950 ring-1 ring-amber-400"
                              : "bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30"
                          }`}
                          title="စာတန်းထိုး နှစ်ကြောင်း .srt ဖိုင် ဒေါင်းလုဒ်လုပ်မည်"
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                          <span>.SRT နှစ်ကြောင်း</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopySrt()}
                          className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border border-slate-700"
                          title="လက်ရှိ စာတန်းထိုး စာသားများကို ကူးယူမည်"
                        >
                          <Copy className="w-3.5 h-3.5 shrink-0" />
                          <span>ကူးယူမည်</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] px-0.5">
                        <span className="text-slate-400 flex items-center gap-1">
                          {subtitleMode === "single" ? "တစ်ကြောင်းချင်း တိုတိုပြတ်ပြတ် စာတန်းထိုး" : "နှစ်ကြောင်းတွဲ ညီညာသော စာတန်းထိုး"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowSrtModal(!showSrtModal)}
                          className="text-[11px] text-pink-400 hover:text-pink-300 font-medium hover:underline cursor-pointer"
                        >
                          {showSrtModal ? "စာတန်းထိုးပိတ်မည် ✕" : "SRT စာသားကြည့်မည် 👁️"}
                        </button>
                      </div>

                      {/* Raw SRT Code View */}
                      {showSrtModal && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-amber-300 max-h-48 overflow-y-auto leading-relaxed select-all">
                          <pre className="whitespace-pre-wrap">
                            {subtitleMode === "two" ? currentTwoLineSrt : currentSingleLineSrt}
                          </pre>
                        </div>
                      )}

                      {/* Interactive Teleprompter Subtitle list */}
                      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 max-h-52 overflow-y-auto space-y-1.5 font-sans">
                        {(subtitleMode === "two" ? twoLineCues : singleLineCues).map((cue) => {
                          const isActive = activeCueId === cue.id;
                          return (
                            <div
                              key={cue.id}
                              onClick={() => seekToTime(cue.startMs)}
                              className={`p-2.5 rounded-lg cursor-pointer transition-all flex items-start gap-2.5 ${
                                isActive
                                  ? "bg-amber-500/25 border border-amber-500/60 text-amber-200 shadow-md ring-1 ring-amber-500/30"
                                  : "hover:bg-slate-900/80 text-slate-300 hover:text-white"
                              }`}
                              title="ဤနေရာမှ စတင်နားဆင်ရန် နှိပ်ပါ"
                            >
                              <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-amber-400/90 border border-slate-800">
                                  #{cue.id}
                                </span>
                                <span className="text-[9px] font-mono text-slate-500">
                                  {cue.startTime.split(",")[0]}
                                </span>
                              </div>
                              <div className="text-xs leading-relaxed font-medium whitespace-pre-line flex-1">
                                {cue.text}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                        <span>CapCut, Premiere, TikTok, Facebook Reels သို့ တိုက်ရိုက်ထည့်သွင်းနိုင်ပါသည်</span>
                        <span className="text-amber-400 font-mono">
                          {(subtitleMode === "two" ? twoLineCues : singleLineCues).length} Cues
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Tab 2: AI Script Assistant */}
        {activeTab === "ai" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center border border-pink-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Gemini AI စာမူလက်ထောက်</h2>
                  <p className="text-xs text-slate-400">စတူဒီယိုတွင် အသံပြောင်းရန် မြန်မာဘာသာဖြင့် စာမူများ အလိုအလျောက် ရေးသားပေးမည့်စနစ်</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">အမျိုးအစား ရွေးချယ်ပါ:</label>
                  <div className="flex flex-wrap gap-2">
                    {["သတင်း", "ဆောင်းပါး", "ဇာတ်လမ်း / ဝတ္ထု", "ကြော်ငြာ", "ကဗျာ"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setAiCategory(cat)}
                        className={`px-4 py-2 rounded-xl border text-xs font-medium transition-all ${
                          aiCategory === cat 
                            ? "bg-pink-600 border-pink-500 text-white" 
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">ဘာအကြောင်းအရာ ရေးပေးရမလဲ?</label>
                  <textarea
                    rows={4}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="ဥပမာ - ရန်ကုန်မြို့ရဲ့ နွေရာသီ အလှအပအကြောင်း သာယာနာပျော်ဖွယ် ဇာတ်ကြောင်းလေး တစ်ပုဒ် ရေးပေးပါ..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500"
                  />
                </div>

                <button
                  onClick={handleAiGenerateScript}
                  disabled={isAiGenerating || !aiPrompt.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-pink-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isAiGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      AI ဖြင့် စာမူဖန်တီးနေပါသည်...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      စာမူစတင်ထုတ်ယူမည်
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: History & Downloads */}
        {activeTab === "history" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-pink-500" />
                ယခင်ဖန်တီးခဲ့သော MP3 အသံဖိုင်မှတ်တမ်းများနှင့် ဒေါင်းလုဒ်များ ({history.length})
              </h2>
              {history.length > 0 && (
                <button
                  onClick={() => saveHistoryToStorage([])}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> အားလုံးဖျက်မည်
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
                <Music className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">ဖန်တီးထားသော အသံဖိုင်မှတ်တမ်း မရှိသေးပါ။</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4">
                    <div className="space-y-1 overflow-hidden">
                      <p className="text-sm font-medium text-white truncate">{item.text}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="text-pink-400 font-medium">{item.voiceName}</span>
                        <span>·</span>
                        <span>{item.createdAt}</span>
                        {item.fileSize && (
                          <>
                            <span>·</span>
                            <span className="text-slate-500 font-mono">{item.fileSize}</span>
                          </>
                        )}
                        <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-800 font-mono text-emerald-400">
                          .MP3
                        </span>
                        {item.srt && (
                          <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 font-mono text-amber-400">
                            .SRT Ready
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          if (audioRef.current && item.blobUrl) {
                            audioRef.current.src = item.blobUrl;
                            audioRef.current.play().catch(() => {});
                            setIsPlaying(true);
                            if (item.singleLineCues) {
                              setSingleLineCues(item.singleLineCues);
                            }
                            if (item.twoLineCues) {
                              setTwoLineCues(item.twoLineCues);
                            }
                            if (item.singleLineSrt) {
                              setCurrentSingleLineSrt(item.singleLineSrt);
                            } else if (item.srt) {
                              setCurrentSingleLineSrt(item.srt);
                            }
                            if (item.twoLineSrt) {
                              setCurrentTwoLineSrt(item.twoLineSrt);
                            }
                          }
                        }}
                        title="နားဆင်ရန်"
                        className="p-2.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white transition-colors cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-white" />
                      </button>
                      <button
                        onClick={() => handleDownloadFile(item.blobUrl, `lin_zaw_${item.id}.mp3`)}
                        title="အသံဖိုင် ဒေါင်းလုဒ်လုပ်ရန်"
                        className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">.MP3</span>
                      </button>
                      {(item.singleLineSrt || item.srt) && (
                        <button
                          onClick={() => handleDownloadSrt("single", item.singleLineSrt || item.srt, `lin_zaw_single_line_${item.id}.srt`)}
                          title="စာတန်းထိုး တစ်ကြောင်း (.SRT) ဒေါင်းလုဒ်လုပ်ရန်"
                          className="p-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">.SRT (၁ ကြောင်း)</span>
                        </button>
                      )}
                      {item.twoLineSrt && (
                        <button
                          onClick={() => handleDownloadSrt("two", item.twoLineSrt, `lin_zaw_two_lines_${item.id}.srt`)}
                          title="စာတန်းထိုး နှစ်ကြောင်း (.SRT) ဒေါင်းလုဒ်လုပ်ရန်"
                          className="p-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">.SRT (၂ ကြောင်း)</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Settings */}
        {activeTab === "settings" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-pink-500" />
                စတူဒီယို အချက်အလက်နှင့် ဆက်တင်များ
              </h2>
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">အပလီကေးရှင်း အမည်:</span>
                    <span className="text-white font-medium">လင်းဇော် အသံထွက် စတူဒီယို (Lin Zaw TTS Pro)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ဗားရှင်း:</span>
                    <span className="text-pink-400 font-mono">v2.5 Consistent MP3</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">အသံဖိုင် ဖော်မတ်:</span>
                    <span className="text-emerald-400 font-mono">.MP3 (MPEG-1 Audio Layer III)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">အသံထွက်တည်ငြိမ်မှု:</span>
                    <span className="text-emerald-400 font-medium">အသံပြောင်းလဲမှုမရှိဘဲ တစ်သမတ်တည်း ထွက်ရှိခြင်း</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500">
        <p>© 2026 လင်းဇော် TTS Studio Pro · High Fidelity Burmese Text to Speech & MP3 Downloader</p>
      </footer>
    </div>
  );
}
