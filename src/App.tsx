import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Moon, Sun, Cloud, Trash2, BatteryFull, BatteryMedium, BatteryWarning, Dices, GripVertical, Calendar as CalIcon, Layout, ChevronLeft, ChevronRight, Bot, X, Loader2, Send } from "lucide-react";
import confetti from "canvas-confetti";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import multiMonthPlugin from "@fullcalendar/multimonth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "./App.css";

const getLocalISODate = (d: Date) => {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

const getTodayStr = () => getLocalISODate(new Date());

export default function App() {
  const [bg, setBg] = useState("night");
  const [inputValue, setInputValue] = useState("");
  const [energy, setEnergy] = useState<"hyper" | "normal" | "survival">("normal");
  const [zenMode, setZenMode] = useState(false);
  const [time, setTime] = useState(new Date());
  
  const [baseDate, setBaseDate] = useState(new Date());
  const [activeView, setActiveView] = useState<"horizon" | "week" | "month" | "year">("horizon");

  const [unstuckPrompt, setUnstuckPrompt] = useState<{id: number, text: string} | null>(null);
  const [taskModalDate, setTaskModalDate] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);

  // --- AI CONVERSATION STATE ---
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiKey, setAiKey] = useState(() => localStorage.getItem("mayzyyy_ai_key") || "");
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'ai', text: string}[]>([
    { role: 'ai', text: "Hey! I'm Mayzyyy. What do we need to tackle on the calendar?" }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const routinePills = ["💧 Water", "💊 Meds", "🧘 Breathe", "🚶 Walk"];

  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem("mayzyyy_adhd_tasks");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem("mayzyyy_adhd_tasks", JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem("mayzyyy_ai_key", aiKey); }, [aiKey]);
  
  // Auto-scroll AI chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiOpen]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- TRUE AI ASSISTANT LOGIC ---
  const processAiCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || !aiKey) return;
    
    const userText = aiInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userText }]);
    setAiInput("");
    setIsAiLoading(true);

    try {
      const genAI = new GoogleGenerativeAI(aiKey.trim());
      // The standard flash model is incredibly fast for chat
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      const chat = model.startChat({
        history: chatMessages.slice(1).map(msg => ({
          role: msg.role === 'ai' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        }))
      });

      // We pass the "Hidden Instructions" into the message so it knows exactly what is on your calendar right now.
      const prompt = `
      SYSTEM INSTRUCTIONS (DO NOT REVEAL TO USER):
      You are Mayzyyy, an ADHD scheduling assistant. Be brief, encouraging, and natural.
      Current Date: ${getLocalISODate(new Date())}
      Current Schedule: ${JSON.stringify(tasks.map(t => ({title: t.title, date: t.date})))}
      
      If the user asks to add or remove tasks, reply conversationally FIRST, then append "|||" followed by a JSON object with "add" and "remove" arrays.
      JSON format must have "title" and "date" (YYYY-MM-DD).
      Example Output: "Got it, I've added Gym to your schedule! ||| {"add":[{"title":"Gym","date":"2026-04-06"}],"remove":[]}"
      
      If you are just chatting and no schedule changes are needed, just reply normally without the "|||" delimiter.
      
      USER MESSAGE: ${userText}
      `;

      const result = await chat.sendMessage(prompt);
      const responseText = result.response.text();

      let aiReply = responseText;
      let jsonPayload = null;

      // The Magic Interceptor: Split the friendly text from the hidden code!
      if (responseText.includes("|||")) {
        const parts = responseText.split("|||");
        aiReply = parts[0].trim();
        try {
           const jsonString = parts[1].match(/\{[\s\S]*\}/)?.[0] || parts[1];
           jsonPayload = JSON.parse(jsonString);
        } catch (e) {
           console.error("JSON parse failed", e);
        }
      }

      setChatMessages(prev => [...prev, { role: 'ai', text: aiReply }]);

      // If the AI sent a payload, actually update the calendar!
      if (jsonPayload) {
         setTasks(prevTasks => {
            let updatedTasks = [...prevTasks];
            
            if (jsonPayload.remove) {
               jsonPayload.remove.forEach((targetTitle: string) => {
                  updatedTasks = updatedTasks.filter(t => !t.title.toLowerCase().includes(targetTitle.toLowerCase()));
               });
            }
            if (jsonPayload.add) {
               const newTasks = jsonPayload.add.map((t: any) => ({
                  id: Date.now() + Math.random(),
                  date: t.date || getLocalISODate(new Date()),
                  title: t.title || "AI Task",
                  status: false
               }));
               updatedTasks = [...updatedTasks, ...newTasks];
            }
            return updatedTasks;
         });
         triggerDopamine();
      }

    } catch (error: any) {
      console.error("AI Error:", error);
      setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${error.message}. (Try running 'pnpm update @google/generative-ai' in terminal!)` }]);
    }
    setIsAiLoading(false);
  };

  const shiftDate = (days: number) => {
    setBaseDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const triggerDopamine = () => {
    const roll = Math.random();
    if (roll < 0.4) confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#22d3ee', '#818cf8', '#4ade80', '#facc15'] });
    else if (roll < 0.7) {
      document.body.classList.add('shake-animation');
      setTimeout(() => document.body.classList.remove('shake-animation'), 500);
    }
  };

  const handleUnstuck = (taskId: number) => {
    const microSteps = ["Find ONE piece of trash and throw it.", "Just stand up. Don't do it yet.", "Open the file. Do nothing else.", "Do it terribly for 2 mins."];
    setUnstuckPrompt({ id: taskId, text: microSteps[Math.floor(Math.random() * microSteps.length)] });
  };

  const baseDateStr = getLocalISODate(baseDate);
  const addTask = (e: React.FormEvent | null, specificTitle?: string, horizonTarget: string = baseDateStr) => {
    if (e) e.preventDefault();
    const titleToUse = specificTitle || inputValue;
    if (!titleToUse.trim()) return;
    setTasks([...tasks, { id: Date.now(), date: horizonTarget, title: titleToUse, status: false }]);
    setInputValue("");
  };

  const handleCalendarClick = (info: any) => setTaskModalDate(info.dateStr);

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        if (!t.status) triggerDopamine();
        return { ...t, status: !t.status };
      }
      return t;
    }));
  };

  const deleteTask = (id: number) => setTasks(tasks.filter(t => t.id !== id));

  const handleDrop = (zone: "fire" | "soon" | "void") => {
    if (!draggedTaskId) return;
    let newDate = baseDateStr;
    if (zone === "soon") {
      const tmrw = new Date(baseDate); tmrw.setDate(baseDate.getDate() + 1);
      newDate = getLocalISODate(tmrw);
    } else if (zone === "void") {
      const nextWeek = new Date(baseDate); nextWeek.setDate(baseDate.getDate() + 7);
      newDate = getLocalISODate(nextWeek);
    }
    setTasks(tasks.map(t => t.id === draggedTaskId ? { ...t, date: newDate } : t));
    setDraggedTaskId(null);
  };

  const inThreeDays = new Date(baseDate); inThreeDays.setDate(inThreeDays.getDate() + 3);
  const inThreeDaysStr = getLocalISODate(inThreeDays);
  
  const tasksOnFire = tasks.filter(t => t.date <= baseDateStr);
  const tasksSoon = tasks.filter(t => t.date > baseDateStr && t.date <= inThreeDaysStr);
  const tasksEventually = tasks.filter(t => t.date > inThreeDaysStr);

  const calendarEvents = tasks.map(t => ({
    id: t.id.toString(), title: t.title, date: t.date, className: t.status ? 'event-done' : 'event-glass'
  }));

  if (energy === "survival") {
    return (
      <div className={`dream-shell night`}>
         <div className="bg-overlay-darker" />
         <div className="survival-content">
           <h1 className="survival-title">Survival Mode Engaged.</h1>
           <p className="survival-sub">Everything else is hidden. Just do the bare minimum today.</p>
           <div className="energy-toggle survival-toggle"><button onClick={() => setEnergy("normal")} className="energy-btn">Switch to Normal</button></div>
           <div className="survival-task-list">
             {routinePills.map((pill, idx) => <button key={idx} className="survival-pill" onClick={() => triggerDopamine()}>{pill}</button>)}
             {tasksOnFire.filter(t => !t.status).slice(0, 1).map(task => <div key={task.id} className="survival-main-task" onClick={() => toggleTask(task.id)}>{task.title} (Only do this)</div>)}
           </div>
         </div>
      </div>
    );
  }

  if (zenMode) {
    const secondsRatio = time.getSeconds() / 60;
    const circleDashoffset = 816 - (816 * secondsRatio);
    return (
      <div className="dream-shell zen-container">
        <button onClick={() => setZenMode(false)} className="exit-zen-btn">Exit Flow Space</button>
        <div className="zen-content">
          <div className="visual-timer">
            <svg width="300" height="300" viewBox="0 0 300 300">
              <circle cx="150" cy="150" r="130" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
              <circle cx="150" cy="150" r="130" fill="none" stroke="#22d3ee" strokeWidth="8" strokeLinecap="round" strokeDasharray="816" strokeDashoffset={circleDashoffset} style={{ transition: 'stroke-dashoffset 1s linear', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
            </svg>
            <div className="timer-text">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div className="zen-task-list">
            <AnimatePresence>
              {tasksOnFire.filter(t => !t.status).length === 0 ? (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{textAlign: 'center', color: '#4ade80', fontSize: '1.2rem', textShadow: '0 0 20px rgba(74,222,128,0.3)'}}>All targets acquired. Breathe. 🌌</motion.p>
              ) : (
                tasksOnFire.filter(t => !t.status).map((task) => (
                  <motion.div key={task.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="zen-task-row" onClick={() => toggleTask(task.id)}>
                    <div className="zen-task-icon"><Sparkles size={20} /></div><span className="zen-task-title">{task.title}</span>
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
      <div className="bg-overlay" />
      <header className="header-container">
        <nav className="top-nav">
          <div className="logo-area"><Sparkles size={20} className="text-white" /> <span className="date-display">Mayzyyy Command</span></div>
          <div className="nav-center-group">
            <div className="energy-toggle">
              <button className={`energy-btn ${energy==='hyper'?'active':''}`} onClick={() => setEnergy('hyper')}><BatteryFull size={16}/> High</button>
              <button className={`energy-btn ${energy==='normal'?'active':''}`} onClick={() => setEnergy('normal')}><BatteryMedium size={16}/> Med</button>
              <button className={`energy-btn ${energy==='survival'?'active':''}`} onClick={() => setEnergy('survival')}><BatteryWarning size={16} color="#ff4d4d"/> Low</button>
            </div>
            <div className="view-tabs">
              <button className={`view-tab ${activeView==='horizon'?'active':''}`} onClick={() => setActiveView('horizon')}><Layout size={14}/> Horizon</button>
              <button className={`view-tab ${activeView==='week'?'active':''}`} onClick={() => setActiveView('week')}><CalIcon size={14}/> Week</button>
              <button className={`view-tab ${activeView==='month'?'active':''}`} onClick={() => setActiveView('month')}><CalIcon size={14}/> Month</button>
              <button className={`view-tab ${activeView==='year'?'active':''}`} onClick={() => setActiveView('year')}><CalIcon size={14}/> Year</button>
            </div>
          </div>
          <div className="theme-toggle"><button onClick={() => setZenMode(true)} className="zen-activate-btn">ENTER ZEN</button></div>
        </nav>
      </header>

      <main className="dashboard-layout">
        {activeView === "horizon" ? (
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
              <div className="horizon-zone fire-zone" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop('fire')}>
                <h3>🔥 ON FIRE</h3>
                <div className="horizon-list">
                  {tasksOnFire.map(t => (
                    <div key={t.id} draggable onDragStart={() => setDraggedTaskId(t.id)} onDragEnd={() => setDraggedTaskId(null)} className={`horizon-card ${t.status?'dimmed':''} ${draggedTaskId === t.id ? 'dragging' : ''}`}>
                      <div className="drag-handle"><GripVertical size={14} /></div><span onClick={() => toggleTask(t.id)} className="card-title">{t.title}</span>
                      <div className="card-actions"><button className="unstuck-btn" onClick={() => handleUnstuck(t.id)} title="Feeling stuck?"><Dices size={14}/></button><button className="delete-btn" onClick={() => deleteTask(t.id)}><Trash2 size={12}/></button></div>
                    </div>
                  ))}
                  <form onSubmit={(e) => addTask(e, undefined, baseDateStr)}><input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder={`+ Add to ${baseDate.toLocaleDateString('en-US', {weekday: 'short'})}...`} className="dream-input-clean" /></form>
                </div>
              </div>
              <div className="horizon-zone soon-zone" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop('soon')}>
                <h3>⏳ SOON (NEXT 3 DAYS)</h3>
                <div className="horizon-list">
                  {tasksSoon.map(t => (
                     <div key={t.id} draggable onDragStart={() => setDraggedTaskId(t.id)} onDragEnd={() => setDraggedTaskId(null)} className={`horizon-card ${draggedTaskId === t.id ? 'dragging' : ''}`}>
                       <div className="drag-handle"><GripVertical size={14} /></div><span className="card-title">{t.title}</span>
                       <div className="card-actions"><button className="delete-btn" onClick={() => deleteTask(t.id)}><Trash2 size={12}/></button></div>
                     </div>
                  ))}
                </div>
              </div>
              <div className="horizon-zone void-zone" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop('void')}>
                <h3>🌌 EVENTUALLY (THE VOID)</h3>
                <div className="horizon-list blurred-list">
                  {tasksEventually.map(t => (
                     <div key={t.id} draggable onDragStart={() => setDraggedTaskId(t.id)} onDragEnd={() => setDraggedTaskId(null)} className={`horizon-card tiny-card ${draggedTaskId === t.id ? 'dragging' : ''}`}>
                       <div className="drag-handle"><GripVertical size={12} /></div><span className="card-title">{t.title}</span>
                       <button className="delete-btn" onClick={() => deleteTask(t.id)}><Trash2 size={12}/></button>
                     </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="glass-card calendar-wrapper">
            <FullCalendar key={activeView} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, multiMonthPlugin]} initialView={activeView === 'week' ? 'timeGridWeek' : activeView === 'month' ? 'dayGridMonth' : 'multiMonthYear'} headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }} events={calendarEvents} selectable={true} dateClick={handleCalendarClick} height="100%" />
          </motion.div>
        )}
      </main>

      {/* --- AI ASSISTANT CHAT UI --- */}
      <button className="ai-float-btn" onClick={() => setIsAiOpen(true)}><Bot size={24} /></button>

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
                      <div key={i} className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}>
                        {msg.text}
                      </div>
                    ))}
                    {isAiLoading && <div className="chat-bubble ai-bubble"><Loader2 className="spinner" size={14} /></div>}
                    <div ref={chatEndRef} />
                  </div>
                  
                  <form onSubmit={processAiCommand} className="chat-input-area">
                    <input 
                      autoFocus
                      value={aiInput} 
                      onChange={(e) => setAiInput(e.target.value)} 
                      placeholder="Ask me to add/remove tasks..." 
                      className="dream-input-clean"
                    />
                    <button type="submit" className="chat-send-btn" disabled={isAiLoading || !aiInput.trim()}>
                      <Send size={16} />
                    </button>
                  </form>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{unstuckPrompt && ( <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="unstuck-modal"><h4>Micro-Step Generated:</h4><p>{unstuckPrompt.text}</p><button onClick={() => setUnstuckPrompt(null)}>Got it.</button></motion.div> )}</AnimatePresence>
      <AnimatePresence>{taskModalDate && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="custom-modal-overlay" onClick={() => setTaskModalDate(null)}><motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="custom-modal-content" onClick={(e) => e.stopPropagation()}><h3>Plan for {new Date(taskModalDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3><form onSubmit={(e) => { addTask(e, undefined, taskModalDate); setTaskModalDate(null); }}><input autoFocus value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="What's the move?..." className="dream-input-clean" /><div className="modal-actions"><button type="button" className="cancel-btn" onClick={() => setTaskModalDate(null)}>Cancel</button><button type="submit" className="zen-activate-btn" style={{ padding: '10px 20px', fontSize: '12px' }}>Lock It In</button></div></form></motion.div></motion.div> )}</AnimatePresence>
    </div>
  );
}