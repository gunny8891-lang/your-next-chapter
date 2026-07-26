import React, { useState } from "react";
import {
  Footprints, Users, BookOpen, Compass, HeartHandshake, HeartPulse, Sparkles,
  ArrowRight, MapPin, Clock, Banknote, Check, RefreshCw, X, ChevronLeft, Sun
} from "lucide-react";

// ---------- design tokens ----------
const T = {
  bg: "#F5F1E6",
  surface: "#FFFFFF",
  ink: "#22301E",
  inkSoft: "#5B6B57",
  line: "#E3DBC8",
  primary: "#2F4A3C",
  primarySoft: "#7C9A82",
  accent: "#B8863B",
  accentSoft: "#EFDFB8",
};

const CATEGORY = {
  Move: { icon: Footprints, color: "#3E6B52" },
  Connect: { icon: Users, color: "#8A5A3B" },
  Learn: { icon: BookOpen, color: "#4A5C8A" },
  Explore: { icon: Compass, color: "#B8863B" },
  "Give Back": { icon: HeartHandshake, color: "#7A4A6B" },
  Wellness: { icon: HeartPulse, color: "#5B7A6B" },
  Joy: { icon: Sparkles, color: "#B0562F" },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ITINERARY = {
  Mon: [{ id: 1, title: "Riverside Walking Group", category: "Move", time: "9:00am", location: "Richmond Lock, 0.8mi", cost: "Free", why: "You said mornings suit you best, and you've enjoyed two walking groups this month." }],
  Tue: [{ id: 2, title: "Coffee with Margaret & John", category: "Connect", time: "11:00am", location: "The Brew House, 1.2mi", cost: "~£6", why: "Margaret's group has similar interests in local history and gardening." }],
  Wed: [{ id: 3, title: "Watercolour Taster Session", category: "Learn", time: "2:00pm", location: "Community Hall, 2.1mi", cost: "£8", why: "You mentioned wanting to pick up a new creative hobby this year." }],
  Thu: [{ id: 4, title: "Ham House & Gardens", category: "Explore", time: "10:30am", location: "National Trust, 3.4mi", cost: "£14.50 (member: free)", why: "Sunny forecast, and you've rated National Trust visits highly before." }],
  Fri: [{ id: 5, title: "Reading Volunteer — St. Mary's Primary", category: "Give Back", time: "9:30am", location: "St. Mary's, 1.5mi", cost: "Free", why: "You told us giving back to the local community was a goal for this year." }],
  Sat: [{ id: 6, title: "Gentle Yoga for Flexibility", category: "Wellness", time: "10:00am", location: "Riverside Studio, 0.9mi", cost: "£5", why: "A lighter day, balanced against Thursday's longer outing." }],
  Sun: [{ id: 7, title: "Afternoon Tea at The Orangery", category: "Joy", time: "3:00pm", location: "Kew Gardens, 3.0mi", cost: "£24", why: "A relaxed close to the week — you've flagged Sunday as your favourite treat day." }],
};

const SURPRISE = {
  title: "A Steam Railway & Sculpture Walk",
  location: "Bluebell Railway + Sheffield Park, 22mi",
  time: "Tue, all day",
  cost: "£31 total",
  why: "You've never been on a steam railway, but you rated the National Trust wildlife trip 5 stars — this pairs a scenic ride with a gardens walk you haven't tried.",
};

const ONBOARD_STEPS = [
  {
    q: "Hello — I'll get to know you in a short chat, then build your first week. Where should we start looking for things to do?",
    field: "location",
    options: ["Near Richmond, London", "Near York", "Near Bristol", "Somewhere else"],
  },
  {
    q: "Good. And roughly how far would you like to travel for a typical outing?",
    field: "radius",
    options: ["Walking distance only", "Up to 3 miles", "Up to 10 miles", "I'm happy to travel further"],
  },
  {
    q: "What sounds most like you on a free afternoon?",
    field: "personality",
    options: ["A long walk, just me", "Coffee with one or two friends", "A group class or club", "A day trip somewhere new"],
  },
  {
    q: "Last one — what would make this next chapter feel worthwhile?",
    field: "goal",
    options: ["Meeting new people", "Staying active", "Learning something new", "Giving back locally"],
  },
];

function Pill({ children, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        color: color,
        background: color + "1A",
        borderRadius: 999,
        padding: "4px 10px",
      }}
    >
      {children}
    </span>
  );
}

function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const current = ONBOARD_STEPS[step];

  const choose = (opt) => {
    const next = { ...answers, [current.field]: opt };
    setAnswers(next);
    if (step < ONBOARD_STEPS.length - 1) {
      setTimeout(() => setStep(step + 1), 150);
    } else {
      setTimeout(() => onDone(next), 400);
    }
  };

  return (
    <div style={{ minHeight: "100%", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: T.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sun size={18} color={T.accentSoft} />
          </div>
          <span style={{ fontFamily: "Georgia, serif", fontSize: 19, color: T.primary, letterSpacing: 0.2 }}>Your Next Chapter</span>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
          {ONBOARD_STEPS.map((_, i) => (
            <div key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= step ? T.primary : T.line, transition: "background 0.3s" }} />
          ))}
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "28px 26px", marginBottom: 20 }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: 21, lineHeight: 1.5, color: T.ink, margin: 0 }}>{current.q}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {current.options.map((opt) => (
            <button
              key={opt}
              onClick={() => choose(opt)}
              style={{
                textAlign: "left",
                fontSize: 17,
                padding: "16px 20px",
                borderRadius: 12,
                border: `1.5px solid ${answers[current.field] === opt ? T.primary : T.line}`,
                background: answers[current.field] === opt ? T.primary : T.surface,
                color: answers[current.field] === opt ? "#fff" : T.ink,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "all 0.15s",
              }}
            >
              {opt}
              <ArrowRight size={16} style={{ opacity: 0.6 }} />
            </button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: T.inkSoft, marginTop: 20 }}>
          Step {step + 1} of {ONBOARD_STEPS.length}
        </p>
      </div>
    </div>
  );
}

function ItemDetail({ item, onClose, onAction, status }) {
  const Icon = CATEGORY[item.category].icon;
  const color = CATEGORY[item.category].color;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(34,48,30,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "24px 24px 32px", maxHeight: "80vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <Pill color={color}><Icon size={13} /> {item.category}</Pill>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkSoft }}><X size={20} /></button>
        </div>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: T.ink, margin: "0 0 16px" }}>{item.title}</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.inkSoft, fontSize: 15 }}><Clock size={16} /> {item.time}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.inkSoft, fontSize: 15 }}><MapPin size={16} /> {item.location}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.inkSoft, fontSize: 15 }}><Banknote size={16} /> {item.cost}</div>
        </div>

        <div style={{ background: T.bg, borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.primary, margin: "0 0 4px", letterSpacing: 0.3 }}>WHY WE PICKED THIS</p>
          <p style={{ fontSize: 14.5, color: T.ink, margin: 0, lineHeight: 1.5 }}>{item.why}</p>
        </div>

        {status === "accepted" ? (
          <button style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: T.primary, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
            Book this — opens provider site
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onAction("skipped")} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `1.5px solid ${T.line}`, background: T.surface, color: T.inkSoft, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Skip</button>
            <button onClick={() => onAction("swapped")} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `1.5px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><RefreshCw size={14} /> Swap</button>
            <button onClick={() => onAction("accepted")} style={{ flex: 1.4, padding: "14px", borderRadius: 12, border: "none", background: T.primary, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={15} /> Accept</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ThisWeek({ profile, onRestart }) {
  const [activeDay, setActiveDay] = useState("Mon");
  const [statuses, setStatuses] = useState({});
  const [openItem, setOpenItem] = useState(null);
  const [surpriseStatus, setSurpriseStatus] = useState(null);

  const items = ITINERARY[activeDay];

  return (
    <div style={{ minHeight: "100%", background: T.bg }}>
      <div style={{ background: T.primary, padding: "22px 20px 26px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sun size={16} color="#fff" />
              </div>
              <span style={{ fontFamily: "Georgia, serif", fontSize: 17, color: "#fff" }}>Your Next Chapter</span>
            </div>
            <button onClick={onRestart} style={{ background: "none", border: "none", color: "#EAE3D0", fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <ChevronLeft size={13} /> restart demo
            </button>
          </div>
          <p style={{ color: "#EAE3D0", fontSize: 13, margin: "0 0 4px", letterSpacing: 0.4, fontWeight: 600 }}>YOUR PERFECT WEEK</p>
          <h1 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: 26, margin: 0 }}>
            {profile.location?.replace("Near ", "") || "This week"}
          </h1>

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            {DAYS.map((d) => {
              const cat = ITINERARY[d][0].category;
              const color = CATEGORY[cat].color;
              const s = statuses[ITINERARY[d][0].id];
              return (
                <button
                  key={d}
                  onClick={() => setActiveDay(d)}
                  style={{
                    flex: 1,
                    padding: "10px 4px",
                    borderRadius: 10,
                    border: "none",
                    background: activeDay === d ? "#fff" : "rgba(255,255,255,0.14)",
                    color: activeDay === d ? T.primary : "#EAE3D0",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{d}</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s === "skipped" ? "transparent" : color, border: s === "skipped" ? `1px solid ${color}` : "none" }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
        {items.map((item) => {
          const Icon = CATEGORY[item.category].icon;
          const color = CATEGORY[item.category].color;
          const status = statuses[item.id];
          return (
            <div
              key={item.id}
              onClick={() => setOpenItem(item)}
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                borderRadius: 16,
                padding: "18px 20px",
                marginBottom: 14,
                cursor: "pointer",
                opacity: status === "skipped" ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Pill color={color}><Icon size={13} /> {item.category}</Pill>
                {status === "accepted" && <Pill color={T.primary}><Check size={12} /> Accepted</Pill>}
                {status === "skipped" && <Pill color={T.inkSoft}>Skipped</Pill>}
              </div>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: 19, color: T.ink, margin: "12px 0 8px" }}>{item.title}</h3>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, color: T.inkSoft, display: "flex", alignItems: "center", gap: 5 }}><Clock size={13} /> {item.time}</span>
                <span style={{ fontSize: 13.5, color: T.inkSoft, display: "flex", alignItems: "center", gap: 5 }}><MapPin size={13} /> {item.location}</span>
                <span style={{ fontSize: 13.5, color: T.inkSoft, display: "flex", alignItems: "center", gap: 5 }}><Banknote size={13} /> {item.cost}</span>
              </div>
            </div>
          );
        })}

        {/* Surprise Me card */}
        <div
          onClick={() => setOpenItem({ ...SURPRISE, id: "surprise", category: "Explore" })}
          style={{
            marginTop: 28,
            borderRadius: 18,
            padding: "20px 22px",
            background: `linear-gradient(135deg, ${T.accentSoft}, #fff)`,
            border: `1.5px solid ${T.accent}`,
            cursor: "pointer",
          }}
        >
          <Pill color={T.accent}><Sparkles size={13} /> Surprise Me — this week</Pill>
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 19, color: T.ink, margin: "12px 0 6px" }}>{SURPRISE.title}</h3>
          <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0 }}>{SURPRISE.location} · {SURPRISE.cost}</p>
        </div>
      </div>

      {openItem && (
        <ItemDetail
          item={openItem}
          status={openItem.id === "surprise" ? surpriseStatus : statuses[openItem.id]}
          onClose={() => setOpenItem(null)}
          onAction={(action) => {
            if (openItem.id === "surprise") setSurpriseStatus(action);
            else setStatuses((s) => ({ ...s, [openItem.id]: action }));
            setOpenItem(null);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("onboarding");
  const [profile, setProfile] = useState({});

  return (
    <div style={{ fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", width: "100%", minHeight: 640, background: T.bg }}>
      {screen === "onboarding" ? (
        <Onboarding onDone={(a) => { setProfile(a); setScreen("week"); }} />
      ) : (
        <ThisWeek profile={profile} onRestart={() => setScreen("onboarding")} />
      )}
    </div>
  );
}
