import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Trash2, BatteryFull, BatteryMedium, BatteryWarning, Dices, GripVertical, Calendar as CalIcon, Layout, ChevronLeft, ChevronRight, Bot, X, Loader2, Send, Zap, Skull, Anchor, Trophy, Briefcase, Edit3 } from "lucide-react";
import confetti from "canvas-confetti";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import multiMonthPlugin from "@fullcalendar/multimonth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "./App.css";

// --- TYPESCRIPT BLUEPRINTS ---
interface Task {
  id: number;
  date: string;
  endDate?: string;
  title: string;
  status: boolean;
  energy?: "spicy" | "fidget" | "dopamine";
}

interface ChatMessage { role: 'user' | 'ai'; text: string; }

const getLocalISODate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
const getTodayStr = () => getLocalISODate(new Date());

const getTaskChunk = (dateStr: string) => {
  if (!dateStr.includes('T')) return 'morning'; 
  const hour = new Date(dateStr).getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
};

const playSound = (type: 'clack' | 'shred' | 'zen' | 'anchor') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (type === 'clack') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'square'; osc.frequency.setValueAtTime(600, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'shred') {
      const bufferSize = ctx.sampleRate * 0.3; const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate); const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buffer; const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      noise.connect(gain); gain.connect(ctx.destination); noise.start();
    } else if (type === 'zen') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(100, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 1.5);
      gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1.5);
    } else if (type === 'anchor') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(800, ctx.currentTime); osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) { console.error(e); }
};

export default function App() {
  const [bg] = useState("night");
  
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskTime, setNewTaskTime] = useState("");
  const [newTaskEnergy, setNewTaskEnergy] = useState<"spicy" | "fidget" | "dopamine">("fidget");

  const [energy, setEnergy] = useState<"hyper" | "normal" | "survival">("normal");
  const [zenMode, setZenMode] = useState(false);
  const [time, setTime] = useState(new Date());
  const [baseDate, setBaseDate] = useState(new Date());
  const [activeView, setActiveView] = useState<"horizon" | "week" | "month" | "year">("horizon");

  const [unstuckPrompt, setUnstuckPrompt] = useState<{id: number, text: string} | null>(null);
  const [taskModalDate, setTaskModalDate] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);

  const [tasks, setTasks] = useState<Task[]>(() => JSON.parse(localStorage.getItem("mayzyyy_adhd_tasks") || "[]"));
  const [aiKey, setAiKey] = useState(() => localStorage.getItem("mayzyyy_ai_key") || "");
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ role: 'ai', text: "Hey! I'm Mayzyyy. What do we need to tackle on the calendar?" }]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [hypeFile, setHypeFile] = useState<Task[]>(() => JSON.parse(localStorage.getItem("mayzyyy_hype") || "[]"));
  const [isHypeModalOpen, setIsHypeModalOpen] = useState(false);
  const [hypeSummary, setHypeSummary] = useState("");

  const [anchorContext, setAnchorContext] = useState<string | null>(() => localStorage.getItem("mayzyyy_anchor"));
  const [isAnchorModalOpen, setIsAnchorModalOpen] = useState(false);
  const [anchorInput, setAnchorInput] = useState("");

  const [isTranslatorOpen, setIsTranslatorOpen] = useState(false);
  const [translatorInput, setTranslatorInput] = useState("");
  const [translatorOutput, setTranslatorOutput] = useState("");

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState(""); 
  const [editTime, setEditTime] = useState("");
  const [editEnergy, setEditEnergy] = useState<"spicy" | "fidget" | "dopamine">("fidget");

  const clickTimeoutRef = useRef<any>(null);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickDateRef = useRef<string | null>(null);

  const routinePills = ["💧 Water", "💊 Meds", "🧘 Breathe", "🚶 Walk"];

  useEffect(() => { localStorage.setItem("mayzyyy_adhd_tasks", JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem("mayzyyy_ai_key", aiKey); }, [aiKey]);
  useEffect(() => { localStorage.setItem("mayzyyy_hype", JSON.stringify(hypeFile)); }, [hypeFile]);
  useEffect(() => { if (anchorContext) localStorage.setItem("mayzyyy_anchor", anchorContext); else localStorage.removeItem("mayzyyy_anchor"); }, [anchorContext]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, isAiOpen]);
  useEffect(() => { const timer = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); setIsAiOpen(prev => !prev); }
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') { e.preventDefault(); setIsAnchorModalOpen(true); }
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyM') { e.preventDefault(); setIsTranslatorOpen(true); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- UPDATED LOGIC: HIGH = GHOST SPICY, MED = GHOST FIDGET ---
  const getEnergyGhostClass = (taskEnergy?: string) => {
    if (!taskEnergy) return "";
    // MED Energy: User focuses on Spicy + Dopamine, so we ghost Fidget.
    if (energy === "normal" && taskEnergy === "fidget") return "task-ghosted";
    // HIGH Energy: User focuses on Fidget + Dopamine, so we ghost Spicy.
    if (energy === "hyper" && taskEnergy === "spicy") return "task-ghosted";
    return "";
  };

  const handleTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!translatorInput.trim() || !aiKey) return;
    setIsAiLoading(true);
    try {
      const genAI = new GoogleGenerativeAI(aiKey.trim());
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
      const prompt = `You are an expert corporate communicator protecting an employee with ADHD. Translate this raw, emotional, or blunt thought into a highly professional, polite, and constructive corporate email/message. RAW THOUGHT: "${translatorInput}"`;
      const result = await model.generateContent(prompt);
      setTranslatorOutput(result.response.text());
    } catch (e: any) { 
      console.error(e);
      alert(`AI Translator Error: ${e.message}`);
    }
    setIsAiLoading(false);
  };

  const generateHypeSummary = async () => {
    if (!aiKey || hypeFile.length === 0) return;
    setIsAiLoading(true);
    try {
      const genAI = new GoogleGenerativeAI(aiKey.trim());
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
      const prompt = `You are a career coach. Take this list of completed tasks and generate 3-5 impressive, professional bullet points for a performance review. Make the user sound incredibly organized and impactful. Even if the tasks are personal routines (like "Bedtime" or "Lunch"), spin them into hilarious, high-level corporate achievements (e.g. "Optimized daily bio-recovery protocols"). TASKS: ${JSON.stringify(hypeFile.map(t => t.title))}`;
      const result = await model.generateContent(prompt);
      setHypeSummary(result.response.text());
    } catch (e: any) { 
      console.error(e);
      alert(`Hype File AI Error: ${e.message}`); 
    }
    setIsAiLoading(false);
  };

  const processAiCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || !aiKey) return;
    
    const userText = aiInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userText }]);
    setAiInput(""); setIsAiLoading(true);

    try {
      const genAI = new GoogleGenerativeAI(aiKey.trim());
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
      const chat = model.startChat({ history: chatMessages.slice(1).map(msg => ({ role: msg.role === 'ai' ? 'model' : 'user', parts: [{ text: msg.text }] })) });

      const prompt = `
      SYSTEM INSTRUCTIONS:
      You are Mayzyyy, an ADHD scheduling assistant. You have FULL control over the calendar.
      Current Date/Time: ${new Date().toISOString()}
      Current Schedule: ${JSON.stringify(tasks.map((t: Task) => ({title: t.title, date: t.date, status: t.status ? "done" : "pending"})))}
      
      Reply conversationally FIRST, then append "|||" followed by a JSON object using these optional arrays:
      - "add": [{"title": "Task Name", "date": "YYYY-MM-DDTHH:mm:00", "energy": "spicy" | "fidget" | "dopamine"}] 
        * CRITICAL: You MUST categorize EVERY added task by setting the "energy" field correctly!
        * "spicy" = work, difficult tasks, heavy meetings.
        * "fidget" = easy chores, routines, water.
        * "dopamine" = fun, games, breaks.
      - "remove": ["Task Name to delete"]
      - "complete": ["Task Name to cross off"]
      
      USER MESSAGE: ${userText}
      `;

      const result = await chat.sendMessage(prompt);
      const responseText = result.response.text();
      let aiReply = responseText; let jsonPayload: any = null;

      if (responseText.includes("|||")) {
        const parts = responseText.split("|||"); aiReply = parts[0].trim();
        try { 
          const jsonStr = parts[1].substring(parts[1].indexOf('{'), parts[1].lastIndexOf('}') + 1);
          jsonPayload = JSON.parse(jsonStr); 
        } catch (e) { console.error("JSON parse failed", e); }
      }

      setChatMessages(prev => [...prev, { role: 'ai', text: aiReply }]);

      if (jsonPayload) {
         setTasks((prevTasks: Task[]) => {
            let updatedTasks = [...prevTasks];
            if (jsonPayload.remove) {
               jsonPayload.remove.forEach((target: any) => {
                  const targetTitle = typeof target === 'string' ? target : (target.title || "");
                  updatedTasks = updatedTasks.filter((t: Task) => !(t.title || "").toLowerCase().includes(targetTitle.toLowerCase()));
               });
            }
            if (jsonPayload.complete) {
               jsonPayload.complete.forEach((target: any) => {
                  const targetTitle = typeof target === 'string' ? target : (target.title || "");
                  updatedTasks = updatedTasks.map((t: Task) => (t.title || "").toLowerCase().includes(targetTitle.toLowerCase()) ? { ...t, status: true } : t);
               });
            }
            if (jsonPayload.add) {
               const newTasks: Task[] = [];
               jsonPayload.add.forEach((t: any) => {
                  const taskTitle = typeof t === 'string' ? t : (t.title || "AI Task");
                  const taskDate = t.date || getLocalISODate(new Date());
                  const hasTime = taskDate.includes('T');
                  const isMeeting = /meeting|call|zoom|sync|interview|1:1/i.test(taskTitle);
                  const assignedEnergy = t.energy || "fidget";

                  if (isMeeting && hasTime) {
                    const mainDateObj = new Date(taskDate);
                    const prepStart = new Date(mainDateObj.getTime() - 15 * 60000);
                    const meetingEnd = new Date(mainDateObj.getTime() + 60 * 60000);
                    const decompressEnd = new Date(meetingEnd.getTime() + 15 * 60000);
                    const formatIso = (d: Date) => { const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString(); return iso.substring(0, 19); };

                    newTasks.push({ id: Date.now() + Math.random(), date: formatIso(prepStart), endDate: formatIso(mainDateObj), title: `🛡️ Prep: ${taskTitle}`, status: false, energy: "fidget" });
                    newTasks.push({ id: Date.now() + Math.random(), date: taskDate, endDate: formatIso(meetingEnd), title: taskTitle, status: false, energy: "spicy" });
                    newTasks.push({ id: Date.now() + Math.random(), date: formatIso(meetingEnd), endDate: formatIso(decompressEnd), title: `🛡️ Decompress`, status: false, energy: "fidget" });
                  } else {
                    newTasks.push({ id: Date.now() + Math.random(), date: taskDate, title: taskTitle, status: false, energy: assignedEnergy });
                  }
               });
               updatedTasks = [...updatedTasks, ...newTasks];
            }
            return updatedTasks;
         });
         triggerDopamine(); 
      }
    } catch (error: any) { 
      setChatMessages(prev => [...prev, { role: 'ai', text: `AI Command Error: ${error.message}` }]); 
    }
    setIsAiLoading(false);
  };

  const fractureTask = async (task: Task) => {
    if (!aiKey) { setUnstuckPrompt({id: task.id, text: "Set your API key to use Task Fracturing!"}); return; }
    setIsAiLoading(true);
    try {
      const genAI = new GoogleGenerativeAI(aiKey.trim());
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
      const result = await model.generateContent(`You are an ADHD assistant. The user is paralyzed by this task: "${task.title}". Break it down into 3 tiny, ridiculously easy physical micro-steps. Return ONLY a valid JSON array of strings.`);
      const match = result.response.text().match(/\[.*\]/s);
      if (match) {
        const steps = JSON.parse(match[0]);
        setTasks((prev: Task[]) => {
          const filtered = prev.filter(t => t.id !== task.id);
          const newTasks = steps.map((s: string, i: number) => ({ id: Date.now() + i, date: task.date, title: s, status: false, energy: 'fidget' }));
          return [...filtered, ...newTasks];
        });
        playSound('clack'); triggerDopamine();
      }
    } catch (e: any) { 
      console.error(e);
      alert(`Fracture Error: ${e.message}`);
    }
    setIsAiLoading(false);
  };
  
  const shiftDate = (days: number) => { setBaseDate(prev => { const next = new Date(prev); next.setDate(next.getDate() + days); return next; }); };

  const triggerDopamine = () => {
    const roll = Math.random();
    if (roll < 0.4) confetti({ zIndex: 10000, particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#22d3ee', '#818cf8', '#4ade80', '#facc15'] });
    else if (roll < 0.7) { document.body.classList.add('shake-animation'); setTimeout(() => document.body.classList.remove('shake-animation'), 500); }
  };

  const handleUnstuck = (taskId: number) => {
    const microSteps = ["Find ONE piece of trash and throw it.", "Just stand up. Don't do it yet.", "Open the file. Do nothing else.", "Do it terribly for 2 mins."];
    setUnstuckPrompt({ id: taskId, text: microSteps[Math.floor(Math.random() * microSteps.length)] });
  };

  const handleManualAdd = (e: React.FormEvent, targetDate: string) => {
    if (e) e.preventDefault();
    if (!newTaskTitle.trim()) return;
    let finalDate = targetDate;
    if (newTaskTime) finalDate = `${targetDate.split('T')[0]}T${newTaskTime}:00`;

    setTasks([...tasks, { 
      id: Date.now(), 
      date: finalDate, 
      title: newTaskTitle, 
      status: false, 
      energy: newTaskEnergy 
    }]);

    setNewTaskTitle(""); setNewTaskTime(""); setNewTaskEnergy("fidget");
  };

  const startEditing = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDate(task.date.split('T')[0]); 
    setEditEnergy(task.energy || "fidget");
    
    if (task.date.includes('T')) {
      const d = new Date(task.date);
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      setEditTime(`${hours}:${mins}`);
    } else {
      setEditTime("");
    }
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim() || !editDate) return;

    let finalDate = editDate; 
    if (editTime) {
      finalDate = `${editDate}T${editTime}:00`; 
    }

    setTasks(tasks.map(t => 
      t.id === editingTask.id 
        ? { ...t, title: editTitle, date: finalDate, energy: editEnergy, endDate: undefined } 
        : t
    ));
    setEditingTask(null);
  };

  const handleFullCalendarEventChange = (info: any) => {
    const taskId = info.event.extendedProps.task?.id;
    if (!taskId) return;
    
    let newStart = info.event.startStr;
    if (newStart.includes('T')) newStart = newStart.substring(0, 19); 
    
    let newEnd = info.event.endStr;
    if (newEnd && newEnd.includes('T')) newEnd = newEnd.substring(0, 19);

    setTasks(prev => prev.map(t => 
      t.id === taskId 
        ? { ...t, date: newStart, endDate: newEnd || undefined } 
        : t
    ));
    playSound('clack');
  };

  const baseDateStr = getLocalISODate(baseDate);

  const handleCalendarClick = (info: any) => {
    const currentTime = new Date().getTime(); const timeDifference = currentTime - lastClickTimeRef.current; const dateOnly = info.dateStr.split('T')[0];
    if (timeDifference < 400 && lastClickDateRef.current === dateOnly) {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      setTaskModalDate(dateOnly); lastClickTimeRef.current = 0;
    } else {
      lastClickTimeRef.current = currentTime; lastClickDateRef.current = dateOnly;
      clickTimeoutRef.current = setTimeout(() => {}, 400);
    }
  };

  const toggleTask = (id: number) => {
    setTasks(tasks.map((t: Task) => {
      if (t.id === id) { if (!t.status) { triggerDopamine(); playSound('clack'); } return { ...t, status: !t.status }; }
      return t;
    }));
  };

  const deleteTask = (id: number) => { playSound('shred'); setTasks(tasks.filter((t: Task) => t.id !== id)); };

  const handleDrop = (e: React.DragEvent, zone: "fire" | "soon" | "void" | "shredder") => {
    e.preventDefault(); 
    const targetId = Number(e.dataTransfer.getData("taskId")) || draggedTaskId;
    if (!targetId) return;

    if (zone === "shredder") {
      playSound('shred');
      const taskToShred = tasks.find(t => t.id === targetId);
      if (taskToShred && (taskToShred.energy === 'spicy' || taskToShred.energy === 'dopamine' || taskToShred.title.includes('🛡️'))) {
        setHypeFile(prev => {
          if (prev.find(h => h.id === taskToShred.id)) return prev; 
          return [...prev, taskToShred];
        });
      }
      setTasks(tasks.filter((t: Task) => t.id !== targetId));
      setDraggedTaskId(null);
      return;
    }

    let newDate = baseDateStr;
    if (zone === "soon") { const tmrw = new Date(baseDate); tmrw.setDate(baseDate.getDate() + 1); newDate = getLocalISODate(tmrw); } 
    else if (zone === "void") { const nextWeek = new Date(baseDate); nextWeek.setDate(baseDate.getDate() + 7); newDate = getLocalISODate(nextWeek); }
    
    setTasks(tasks.map((t: Task) => t.id === targetId ? { ...t, date: newDate, endDate: undefined } : t));
    setDraggedTaskId(null);
  };

  const activateZenMode = () => { playSound('zen'); setZenMode(true); };

  const getWeekDays = (date: Date) => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i); return d;
    });
  };

  // --- CRITICAL FIX: DO NOT FILTER ARRAYS, JUST RENDER EVERYTHING ---
  // The ghosting class will visually hide them, so they stay in memory properly!
  const visibleTasks = tasks;

  const inThreeDays = new Date(baseDate); inThreeDays.setDate(inThreeDays.getDate() + 3);
  const inThreeDaysStr = getLocalISODate(inThreeDays);
  
  const tasksOnFire = visibleTasks.filter((t: Task) => t.date <= baseDateStr);
  const tasksSoon = visibleTasks.filter((t: Task) => t.date > baseDateStr && t.date <= inThreeDaysStr);
  const tasksEventually = visibleTasks.filter((t: Task) => t.date > inThreeDaysStr);

  const calendarEvents = visibleTasks.map((t: Task) => ({ 
    id: t.id.toString(), 
    title: t.title, 
    start: t.date, 
    end: t.endDate, 
    className: `${t.status ? 'event-done' : 'event-glass'} ${getEnergyGhostClass(t.energy)}`, 
    extendedProps: { task: t } 
  }));

  const weekDaysArray = getWeekDays(baseDate);

  if (energy === "survival") {
    return (
      <div className={`dream-shell night`}>
         <div className="bg-overlay-darker" />
         <div className="survival-content">
           <h1 className="survival-title">Survival Mode Engaged.</h1>
           <p className="survival-sub">Everything else is hidden. Just do the bare minimum today.</p>
           <div className="energy-toggle survival-toggle"><button onClick={() => setEnergy("normal")} className="energy-btn">Switch to Normal</button></div>
           <div className="survival-task-list">
             {routinePills.map((pill, idx) => <button key={idx} className="survival-pill" onClick={() => { playSound('clack'); triggerDopamine(); }}>{pill}</button>)}
             {tasksOnFire.filter((t: Task) => !t.status).slice(0, 1).map((task: Task) => <div key={task.id} className="survival-main-task" onClick={() => toggleTask(task.id)}>{task.title} (Only do this)</div>)}
           </div>
         </div>
      </div>
    );
  }

  if (zenMode) {
    const secondsRatio = time.getSeconds() / 60; const circleDashoffset = 816 - (816 * secondsRatio);
    return (
      <div className="dream-shell zen-container">
        <button onClick={() => setZenMode(false)} className="exit-zen-btn">Exit Flow Space</button>
        <div className="zen-content">
          <div className="visual-timer">
            <svg width="400" height="400" viewBox="0 0 300 300">
              <circle cx="150" cy="150" r="130" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="6" />
              <circle cx="150" cy="150" r="130" fill="none" stroke="#000" strokeWidth="16" strokeLinecap="round" strokeDasharray="816" strokeDashoffset={circleDashoffset} style={{ transition: 'stroke-dashoffset 1s linear', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
            </svg>
            <div className="timer-text">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div className="zen-task-list">
            <AnimatePresence>
              {tasksOnFire.filter((t: Task) => !t.status).length === 0 ? (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{textAlign: 'center', color: '#000', fontSize: '2rem', textTransform: 'uppercase', fontWeight: 900}}>All targets acquired. 🌌</motion.p>
              ) : (
                tasksOnFire.filter((t: Task) => !t.status).map((task: Task) => (
                  <motion.div key={task.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="zen-task-row" onClick={() => toggleTask(task.id)}>
                    <div className="zen-task-icon"><Sparkles size={24} /></div><span className="zen-task-title">{task.title}</span>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`dream-shell ${bg}`}>
      
      <AnimatePresence>
        {editingTask && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="custom-modal-overlay" style={{ zIndex: 10050 }} onClick={() => setEditingTask(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="custom-modal-content" onClick={e => e.stopPropagation()}>
              <h3 style={{fontSize: '2rem', margin: '0 0 20px 0'}}>EDIT TARGET</h3>
              <form onSubmit={saveEdit} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} className="dream-input-clean" placeholder="Task title..." required />
                <div style={{display: 'flex', gap: '10px'}}>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="dream-input-clean" style={{flex: 1}} required />
                  <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="dream-input-clean" style={{flex: 1}} />
                  <select value={editEnergy} onChange={e => setEditEnergy(e.target.value as any)} className="dream-input-clean" style={{flex: 1, cursor: 'pointer'}}>
                    <option value="fidget">🪀 Fidget</option>
                    <option value="spicy">🌶️ Spicy</option>
                    <option value="dopamine">🎮 Dopamine</option>
                  </select>
                </div>
                <button type="submit" className="zen-activate-btn" style={{padding: '15px', marginTop: '10px'}}>SAVE CHANGES</button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {anchorContext && (
          <motion.div initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }} className="anchor-banner">
            <div className="anchor-content">
              <Anchor size={32} />
              <div>
                <span className="anchor-label">YOU WERE DOING:</span>
                <span className="anchor-text">{anchorContext}</span>
              </div>
            </div>
            <button className="anchor-clear-btn" onClick={() => { playSound('clack'); setAnchorContext(null); }}>I'M BACK</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-overlay" />
      <header className="header-container">
        <nav className="top-nav">
          <div className="logo-area"><Sparkles size={20} className="text-white" /> <span className="date-display">Mayzyyy Command</span></div>
          <div className="nav-center-group">
            <div className="energy-toggle">
              <button className={`energy-btn ${energy==='hyper'?'active':''}`} onClick={() => setEnergy('hyper')}><BatteryFull size={16}/> High</button>
              <button className={`energy-btn ${energy==='normal'?'active':''}`} onClick={() => setEnergy('normal')}><BatteryMedium size={16}/> Med</button>
              <button className="energy-btn" onClick={() => setEnergy('survival')}><BatteryWarning size={16} color="#ff4d4d"/> Low</button>
            </div>
            <div className="view-tabs">
              <button className={`view-tab ${activeView==='horizon'?'active':''}`} onClick={() => setActiveView('horizon')}><Layout size={14}/> Horizon</button>
              <button className={`view-tab ${activeView==='week'?'active':''}`} onClick={() => setActiveView('week')}><CalIcon size={14}/> Week</button>
              <button className={`view-tab ${activeView==='month'?'active':''}`} onClick={() => setActiveView('month')}><CalIcon size={14}/> Month</button>
              <button className={`view-tab ${activeView==='year'?'active':''}`} onClick={() => setActiveView('year')}><CalIcon size={14}/> Year</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setIsTranslatorOpen(true)} className="view-tab" title="Ctrl+Shift+M"><Briefcase size={16} /> TRANSLATE</button>
            <button onClick={() => setIsHypeModalOpen(true)} className="view-tab"><Trophy size={16} /> HYPE FILE</button>
            <button onClick={activateZenMode} className="zen-activate-btn">ENTER ZEN</button>
          </div>
        </nav>
      </header>

      <main className="dashboard-layout">
        
        {/* HORIZON VIEW */}
        {activeView === "horizon" && (
          <div className="horizon-wrapper">
            <div className="global-time-travel">
              <button className="nav-arrow" onClick={() => shiftDate(-1)}><ChevronLeft size={24} /></button>
              <div className="current-travel-date">
                <h2>{baseDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}</h2>
                <span>{baseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <button className="nav-arrow" onClick={() => shiftDate(1)}><ChevronRight size={24} /></button>
              {getLocalISODate(baseDate) !== getTodayStr() && (<button className="return-today-btn" onClick={() => setBaseDate(new Date())}>Back to Today</button>)}
            </div>

            <div className="horizon-panel">
              <div className="horizon-zone fire-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, 'fire')}>
                <h3>🔥 ON FIRE</h3>
                <div className="horizon-list">
                  {tasksOnFire.map((t: Task) => (
                    <div key={t.id} draggable onDragStart={(e) => { setDraggedTaskId(t.id); e.dataTransfer.setData("taskId", t.id.toString()); }} onDragEnd={() => setDraggedTaskId(null)} className={`horizon-card ${t.status?'dimmed':''} ${draggedTaskId === t.id ? 'dragging' : ''} ${getEnergyGhostClass(t.energy)}`}>
                      <div className="drag-handle"><GripVertical size={14} /></div>
                      <span onClick={() => toggleTask(t.id)} onDoubleClick={() => startEditing(t)} className="card-title">
                        {t.energy === 'spicy' && '🌶️ '} {t.energy === 'fidget' && '🪀 '} {t.energy === 'dopamine' && '🎮 '}
                        {t.title}
                      </span>
                      <div className="card-actions">
                        <button className="unstuck-btn" onClick={(e) => { e.stopPropagation(); fractureTask(t); }} title="Fracture this task"><Zap size={14}/></button>
                        <button className="unstuck-btn" onClick={(e) => { e.stopPropagation(); startEditing(t); }} title="Edit Task"><Edit3 size={14}/></button>
                        <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}><Trash2 size={12}/></button>
                      </div>
                    </div>
                  ))}
                  <form onSubmit={(e) => handleManualAdd(e, baseDateStr)} className="compact-add-form" style={{ marginTop: '10px', borderTop: '2px dashed #000', paddingTop: '10px' }}>
                    <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder={`+ Add to ${baseDate.toLocaleDateString('en-US', {weekday: 'short'})}...`} className="dream-input-clean" required />
                    <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                      <input type="time" value={newTaskTime} onChange={e => setNewTaskTime(e.target.value)} className="dream-input-clean" style={{ padding: '8px', fontSize: '0.8rem' }} />
                      <select value={newTaskEnergy} onChange={e => setNewTaskEnergy(e.target.value as any)} className="dream-input-clean" style={{ padding: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                        <option value="fidget">🪀 Fidget</option>
                        <option value="spicy">🌶️ Spicy</option>
                        <option value="dopamine">🎮 Fun</option>
                      </select>
                      <button type="submit" className="zen-activate-btn" style={{ padding: '8px 12px' }}>+</button>
                    </div>
                  </form>
                </div>
              </div>
              
              <div className="horizon-zone soon-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, 'soon')}>
                <h3>⏳ SOON (NEXT 3 DAYS)</h3>
                <div className="horizon-list">
                  {tasksSoon.map((t: Task) => (
                     <div key={t.id} draggable onDragStart={(e) => { setDraggedTaskId(t.id); e.dataTransfer.setData("taskId", t.id.toString()); }} onDragEnd={() => setDraggedTaskId(null)} className={`horizon-card ${draggedTaskId === t.id ? 'dragging' : ''} ${getEnergyGhostClass(t.energy)}`}>
                       <div className="drag-handle"><GripVertical size={14} /></div>
                       <span onDoubleClick={() => startEditing(t)} className="card-title">
                          {t.energy === 'spicy' && '🌶️ '} {t.energy === 'fidget' && '🪀 '} {t.energy === 'dopamine' && '🎮 '}
                          {t.title}
                       </span>
                       <div className="card-actions">
                         <button className="unstuck-btn" onClick={(e) => { e.stopPropagation(); startEditing(t); }}><Edit3 size={12}/></button>
                         <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}><Trash2 size={12}/></button>
                       </div>
                     </div>
                  ))}
                </div>
              </div>
              
              <div className="horizon-zone void-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, 'void')}>
                <h3>🌌 EVENTUALLY (THE VOID)</h3>
                <div className="horizon-list blurred-list">
                  {tasksEventually.map((t: Task) => (
                     <div key={t.id} draggable onDragStart={(e) => { setDraggedTaskId(t.id); e.dataTransfer.setData("taskId", t.id.toString()); }} onDragEnd={() => setDraggedTaskId(null)} className={`horizon-card tiny-card ${draggedTaskId === t.id ? 'dragging' : ''} ${getEnergyGhostClass(t.energy)}`}>
                       <div className="drag-handle"><GripVertical size={12} /></div>
                       <span onDoubleClick={() => startEditing(t)} className="card-title">
                         {t.energy === 'spicy' && '🌶️ '} {t.energy === 'fidget' && '🪀 '} {t.energy === 'dopamine' && '🎮 '}
                         {t.title}
                       </span>
                       <div className="card-actions">
                         <button className="unstuck-btn" onClick={(e) => { e.stopPropagation(); startEditing(t); }}><Edit3 size={12}/></button>
                         <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}><Trash2 size={12}/></button>
                       </div>
                     </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="shredder-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, 'shredder')}>
              <Skull size={24} /> DROP TO SHRED (SPICY TASKS SAVE TO HYPE FILE)
            </div>
          </div>
        )}

        {/* --- CUSTOM WEEK CHUNK VIEW --- */}
        {activeView === "week" && (
          <div className="calendar-wrapper" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="custom-week-wrapper">
              
              <div className="week-grid-header">
                <div className="chunk-label-empty">
                  <div className="global-time-travel" style={{transform: 'scale(0.7)'}}>
                    <button className="nav-arrow" onClick={() => shiftDate(-7)}><ChevronLeft size={16} /></button>
                    <button className="nav-arrow" onClick={() => shiftDate(7)}><ChevronRight size={16} /></button>
                  </div>
                </div>
                {weekDaysArray.map(d => (
                  <div key={d.toISOString()} className="week-header-cell" onClick={() => setTaskModalDate(getLocalISODate(d))}>
                    <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div>{d.getDate()}</div>
                  </div>
                ))}
              </div>

              {[
                { id: 'morning', label: 'MORNING' },
                { id: 'afternoon', label: 'AFTERNOON' },
                { id: 'evening', label: 'EVENING' },
                { id: 'night', label: 'NIGHT' }
              ].map((chunk) => (
                <div key={chunk.id} className={`week-grid-row row-${chunk.id}`}>
                  <div className="chunk-label">{chunk.label}</div>
                  {weekDaysArray.map(d => {
                    const dayStr = getLocalISODate(d);
                    const dayTasks = visibleTasks.filter(t => t.date.startsWith(dayStr) && getTaskChunk(t.date) === chunk.id);
                    
                    return (
                      <div 
                        key={dayStr} 
                        className="week-day-cell" 
                        onClick={() => setTaskModalDate(dayStr)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const targetId = Number(e.dataTransfer.getData("taskId"));
                          if (!targetId) return;
                          const chunkHours: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '18:00', night: '22:00' };
                          const newDate = `${dayStr}T${chunkHours[chunk.id]}:00`;
                          setTasks(prev => prev.map(t => t.id === targetId ? { ...t, date: newDate, endDate: undefined } : t));
                          playSound('clack');
                        }}
                      >
                        {dayTasks.sort((a,b)=>a.date.localeCompare(b.date)).map(t => {
                          const timeStr = t.date.includes('T') ? new Date(t.date).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}) : 'ALL DAY';
                          return (
                            <div 
                              key={t.id} 
                              draggable 
                              onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("taskId", t.id.toString()); }}
                              className={`week-task-card ${t.status ? 'dimmed' : ''} ${getEnergyGhostClass(t.energy)}`} 
                              onDoubleClick={(e) => { e.stopPropagation(); startEditing(t); }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div className="week-task-time" style={{ marginBottom: 0, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>{timeStr}</div>
                                <div style={{display: 'flex', gap: '4px'}}>
                                  <button className="unstuck-btn" style={{ padding: '4px', boxShadow: '2px 2px 0px #000', border: '2px solid #000' }} onClick={(e) => { e.stopPropagation(); startEditing(t); }}><Edit3 size={12}/></button>
                                  <button className="delete-btn" style={{ padding: '4px', boxShadow: '2px 2px 0px #000', border: '2px solid #000' }} onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}><Trash2 size={12}/></button>
                                </div>
                              </div>
                              <div className="week-task-title" style={{cursor: 'pointer'}} onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                                {t.energy === 'spicy' && '🌶️ '} {t.energy === 'fidget' && '🪀 '} {t.energy === 'dopamine' && '🎮 '}
                                {t.title}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))}

            </div>
          </div>
        )}

        {/* MONTH & YEAR FULLCALENDAR */}
        {(activeView === "month" || activeView === "year") && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="calendar-wrapper">
            <FullCalendar 
              key={activeView} 
              plugins={[dayGridPlugin, interactionPlugin, multiMonthPlugin]} 
              initialView={activeView === 'month' ? 'dayGridMonth' : 'multiMonthYear'} 
              headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }} 
              events={calendarEvents} 
              selectable={true} 
              dateClick={handleCalendarClick} 
              eventClick={(info) => {
                const clickedTask = info.event.extendedProps.task;
                if(clickedTask) { startEditing(clickedTask); }
              }}
              editable={true}
              droppable={true}
              eventDrop={handleFullCalendarEventChange}
              eventResize={handleFullCalendarEventChange}
              height="100%" 
            />
          </motion.div>
        )}
      </main>

      <button className="ai-float-btn" onClick={() => setIsAiOpen(true)} title="Ctrl+Space to open"><Bot size={24} /></button>

      <AnimatePresence>
        {isTranslatorOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="custom-modal-overlay" onClick={() => setIsTranslatorOpen(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="custom-modal-content giant-day-card" style={{height: 'auto', maxHeight: '80vh', maxWidth: '800px'}} onClick={e => e.stopPropagation()}>
              <div className="giant-card-header">
                <h2>Corporate Translator</h2>
                <button className="close-giant-btn" onClick={() => setIsTranslatorOpen(false)}><X size={32} strokeWidth={3} /></button>
              </div>
              <form onSubmit={handleTranslate} style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                <label style={{fontWeight: 900, fontSize: '1.2rem', textAlign: 'left'}}>RAW THOUGHT (Brain Dump Here):</label>
                <textarea value={translatorInput} onChange={e => setTranslatorInput(e.target.value)} className="dream-input-clean" style={{minHeight: '150px'}} placeholder="What are you actually trying to say? Don't mask. Just type..." autoFocus />
                <button type="submit" className="zen-activate-btn" style={{padding: '20px', fontSize: '1.5rem'}} disabled={isAiLoading}>
                  {isAiLoading ? <Loader2 className="spinner" /> : "TRANSLATE TO CORPORATE SPEAK"}
                </button>
              </form>
              {translatorOutput && (
                <div style={{marginTop: '30px', textAlign: 'left', background: 'var(--color-soon)', padding: '20px', border: '4px solid #000'}}>
                  <h3 style={{margin: '0 0 10px 0', fontWeight: 900}}>SAFE TO SEND:</h3>
                  <p style={{margin: 0, fontSize: '1.2rem', whiteSpace: 'pre-wrap', fontWeight: 700}}>{translatorOutput}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAnchorModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="custom-modal-overlay" onClick={() => setIsAnchorModalOpen(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="custom-modal-content" onClick={e => e.stopPropagation()}>
              <h3 style={{fontSize: '2rem'}}>DROP AN ANCHOR</h3>
              <p style={{fontWeight: 700, marginBottom: '20px'}}>What were you just doing? Log it before you get distracted.</p>
              <form onSubmit={e => { e.preventDefault(); setAnchorContext(anchorInput); setAnchorInput(""); setIsAnchorModalOpen(false); playSound('anchor'); }}>
                <input autoFocus value={anchorInput} onChange={e => setAnchorInput(e.target.value)} placeholder="I was formatting the Q3 revenue..." className="dream-input-clean" />
                <button type="submit" className="zen-activate-btn" style={{width: '100%', marginTop: '20px', padding: '15px'}}>SET ANCHOR</button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isHypeModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="custom-modal-overlay" onClick={() => setIsHypeModalOpen(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="custom-modal-content giant-day-card" onClick={e => e.stopPropagation()}>
              <div className="giant-card-header">
                <h2>🏆 THE HYPE FILE</h2>
                <button className="close-giant-btn" onClick={() => setIsHypeModalOpen(false)}><X size={32} strokeWidth={3} /></button>
              </div>
              <p style={{fontSize: '1.5rem', fontWeight: 900, textAlign: 'left', marginTop: 0}}>Your Secret Work Ledger.</p>
              <div className="horizon-list giant-task-list" style={{flex: 1}}>
                {hypeFile.length === 0 ? (
                  <div className="empty-day-msg">SHRED SPICY TASKS TO BUILD YOUR HYPE FILE.</div>
                ) : (
                  hypeFile.map((t, idx) => (
                    <div key={idx} className="horizon-card giant-task-row">
                      <div className="task-time-badge">{t.date.split('T')[0]}</div>
                      <span className="card-title giant-card-title">
                        {t.energy === 'spicy' && '🌶️ '} {t.energy === 'fidget' && '🪀 '} {t.energy === 'dopamine' && '🎮 '}
                        {t.title}
                      </span>
                      <button className="delete-btn" onClick={() => setHypeFile(prev => prev.filter((_, i) => i !== idx))}><Trash2 size={24}/></button>
                    </div>
                  ))
                )}
              </div>
              {hypeSummary ? (
                <div style={{textAlign: 'left', background: 'var(--color-void)', padding: '20px', border: '4px solid #000'}}>
                   <h3 style={{margin: '0 0 10px 0', fontWeight: 900}}>PERFORMANCE REVIEW BULLETS:</h3>
                   <p style={{margin: 0, fontSize: '1.2rem', whiteSpace: 'pre-wrap', fontWeight: 700}}>{hypeSummary}</p>
                </div>
              ) : (
                <button onClick={generateHypeSummary} className="zen-activate-btn" style={{padding: '20px', fontSize: '1.5rem'}} disabled={isAiLoading || hypeFile.length === 0}>
                  {isAiLoading ? <Loader2 className="spinner" /> : "GENERATE PERFORMANCE REVIEW BULLETS"}
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAiOpen && (
          <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.9 }} className="ai-chat-panel">
            <div className="ai-chat-header">
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}><Sparkles size={16} color="#22d3ee" /> Mayzyyy AI</span>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                {aiKey && (<button onClick={() => setAiKey("")} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>Reset Key</button>)}
                <button onClick={() => setIsAiOpen(false)} className="close-ai-btn"><X size={18} /></button>
              </div>
            </div>
            <div className="ai-chat-body">
              {!aiKey ? (
                <div className="ai-key-setup">
                  <p>Welcome to your personal assistant. Paste your free Gemini API key here.</p>
                  <input type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder="AIzaSy..." className="dream-input-clean" />
                </div>
              ) : (
                <>
                  <div className="chat-history">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}>{msg.text}</div>
                    ))}
                    {isAiLoading && <div className="chat-bubble ai-bubble"><Loader2 className="spinner" size={14} /></div>}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={processAiCommand} className="chat-input-area">
                    <input autoFocus value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ctrl+Space brain dump..." className="dream-input-clean" />
                    <button type="submit" className="chat-send-btn" disabled={isAiLoading || !aiInput.trim()}><Send size={16} /></button>
                  </form>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{unstuckPrompt && ( <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="unstuck-modal"><h4>Micro-Step Generated:</h4><p>{unstuckPrompt.text}</p><button onClick={() => setUnstuckPrompt(null)}>Got it.</button></motion.div> )}</AnimatePresence>
      
      <AnimatePresence>
        {taskModalDate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="custom-modal-overlay" onClick={() => setTaskModalDate(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="custom-modal-content giant-day-card" onClick={(e) => e.stopPropagation()}>
              <div className="giant-card-header">
                <h2>{new Date(taskModalDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
                <button className="close-giant-btn" onClick={() => setTaskModalDate(null)}><X size={32} strokeWidth={3} /></button>
              </div>
              <div className="horizon-list giant-task-list">
                {visibleTasks.filter((t: Task) => t.date.startsWith(taskModalDate)).length === 0 ? (
                  <div className="empty-day-msg">NO TARGETS SET. YOU ARE FREE.</div>
                ) : (
                  visibleTasks.filter((t: Task) => t.date.startsWith(taskModalDate)).sort((a, b) => a.date.localeCompare(b.date)).map((t: Task) => {
                    const hasTime = t.date.includes('T');
                    let timeString = "ALL DAY";
                    if (hasTime) { const dateObj = new Date(t.date); timeString = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
                    return (
                      <div key={t.id} className={`horizon-card giant-task-row ${t.status ? 'dimmed' : ''} ${getEnergyGhostClass(t.energy)}`}>
                        <div className="task-time-badge">{timeString}</div>
                        <span onClick={() => toggleTask(t.id)} onDoubleClick={() => startEditing(t)} className="card-title giant-card-title">
                          {t.energy === 'spicy' && '🌶️ '} {t.energy === 'fidget' && '🪀 '} {t.energy === 'dopamine' && '🎮 '}
                          {t.title}
                        </span>
                        <div className="card-actions">
                          <button className="unstuck-btn giant-delete" onClick={(e) => { e.stopPropagation(); startEditing(t); }}><Edit3 size={24}/></button>
                          <button className="delete-btn giant-delete" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}><Trash2 size={24}/></button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              
              <form onSubmit={(e) => handleManualAdd(e, taskModalDate)} className="giant-add-form">
                <input autoFocus value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Type a new target..." className="dream-input-clean" required />
                <input type="time" value={newTaskTime} onChange={(e) => setNewTaskTime(e.target.value)} className="dream-input-clean" style={{width: 'auto', flex: 'none'}} />
                <select value={newTaskEnergy} onChange={(e) => setNewTaskEnergy(e.target.value as any)} className="dream-input-clean" style={{width: 'auto', flex: 'none', cursor: 'pointer'}}>
                  <option value="fidget">🪀 Fidget</option>
                  <option value="spicy">🌶️ Spicy</option>
                  <option value="dopamine">🎮 Dopamine</option>
                </select>
                <button type="submit" className="zen-activate-btn">LOCK IN</button>
              </form>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>    
    </div>
  );
}