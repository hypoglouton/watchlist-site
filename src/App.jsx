import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Trash2, Save, X, Maximize2, Minimize2 } from "lucide-react";

const STORAGE_KEY = "calendar-a4-v3-state";

const MONTHS_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const PRESET_TAGS = [
  { id: "rdv", label: "RDV", emoji: "📍", bg: "#fde047", text: "#000000", border: "#000000" },
  { id: "appel", label: "APPEL", emoji: "📞", bg: "#bef264", text: "#000000", border: "#000000" },
  { id: "travail", label: "TRAVAIL", emoji: "💼", bg: "#67e8f9", text: "#000000", border: "#000000" },
  { id: "important", label: "IMPORTANT", emoji: "⚠️", bg: "#f87171", text: "#ffffff", border: "#000000" },
  { id: "perso", label: "PERSO", emoji: "🏠", bg: "#f0abfc", text: "#000000", border: "#000000" },
  { id: "sante", label: "SANTÉ", emoji: "🩺", bg: "#fdba74", text: "#000000", border: "#000000" },
  { id: "margot", label: "MARGOT", emoji: "👧", bg: "#f9a8d4", text: "#000000", border: "#000000" },
  { id: "guitare", label: "GUITARE", emoji: "🎸", bg: "#c084fc", text: "#ffffff", border: "#000000" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatKey(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function getMonthMatrix(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const jsDay = firstOfMonth.getDay();
  const mondayIndex = (jsDay + 6) % 7;

  const cells = [];
  for (let i = 0; i < mondayIndex; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  return cells;
}

function buildMonths(count = 18) {
  const start = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    return {
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
      key: `${date.getFullYear()}-${date.getMonth()}`
    };
  });
}

function getPresetById(id) {
  return PRESET_TAGS.find((t) => t.id === id);
}

function createItemFromPreset(presetId) {
  const preset = getPresetById(presetId) || PRESET_TAGS[0];
  return {
    id: `${preset.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    presetId: preset.id,
    label: preset.label,
    emoji: preset.emoji,
    time: "",
    note: ""
  };
}

function loadSavedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(data) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function chipStyle(tag) {
  return {
    background: tag.bg,
    color: tag.text,
    border: `2px solid ${tag.border}`
  };
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    console.error("Fullscreen non disponible", e);
  }
}

function PresetChip({ preset }) {
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/preset-id", preset.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      style={chipStyle(preset)}
      className="preset-chip"
    >
      <div className="preset-title">
        <span className="preset-emoji">{preset.emoji}</span>
        <span>{preset.label}</span>
      </div>
      <div className="preset-subtitle">Glisser vers un jour</div>
    </button>
  );
}

function Sticker({ item, onClick }) {
  const tag = getPresetById(item.presetId);
  if (!tag) return null;

  return (
    <button
      onClick={onClick}
      style={chipStyle(tag)}
      className="sticker"
      title={item.note || item.label}
    >
      <div className="sticker-line">
        {item.time ? <span>{item.time}</span> : null}
        <span>{item.emoji}</span>
        <span className="sticker-text">{item.label}</span>
      </div>
      {item.note ? <div className="sticker-note">{item.note}</div> : null}
    </button>
  );
}

function EditModal({ open, item, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  if (!open || !draft) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">Modifier la vignette</div>
          <button onClick={onClose} className="icon-btn neutral-btn">
            <X size={16} />
          </button>
        </div>

        <div className="field">
          <label>Heure</label>
          <input
            type="time"
            value={draft.time || ""}
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Titre</label>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Note</label>
          <textarea
            rows={3}
            value={draft.note || ""}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </div>

        <div className="modal-actions">
          <button onClick={onDelete} className="danger-btn">
            <Trash2 size={16} />
            <span>Supprimer</span>
          </button>
          <button onClick={() => onSave(draft)} className="success-btn">
            <Save size={16} />
            <span>Enregistrer</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthPage({
  year,
  monthIndex,
  pageIndex,
  itemsByDay,
  onDropPreset,
  onOpenItem,
  onPrevMonth,
  onNextMonth,
  isFullscreen,
}) {
  const cells = getMonthMatrix(year, monthIndex);
  const today = new Date();

  return (
    <section className="page-wrap">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className={`sheet ${isFullscreen ? "sheet-fullscreen" : ""}`}
      >
        <header className="sheet-header">
          <div className="sheet-nav-shell">
            <div className="sheet-nav-row">
              <button
                onClick={() => onPrevMonth(pageIndex)}
                className="nav-btn prev-btn"
              >
                <ChevronLeft size={16} />
                <span>Précédent</span>
              </button>

              <div className="sheet-nav-center">
                <div className="indicator-label">Navigation</div>
                <h1 className="sheet-title">{MONTHS_FR[monthIndex]} {year}</h1>
              </div>

              <button
                onClick={() => onNextMonth(pageIndex)}
                className="nav-btn next-btn"
              >
                <span>Suivant</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="weekday-row">
          {DAYS_FR.map((day) => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>

        <div className="days-grid">
          {cells.map((cell, index) => {
            const key = cell.day ? formatKey(year, monthIndex, cell.day) : `empty-${index}`;
            const items = cell.day ? itemsByDay[key] || [] : [];
            const isToday =
              !!cell.day &&
              today.getFullYear() === year &&
              today.getMonth() === monthIndex &&
              today.getDate() === cell.day;

            return (
              <div
                key={key}
                onDragOver={(e) => cell.day && e.preventDefault()}
                onDrop={(e) => {
                  if (!cell.day) return;
                  const presetId = e.dataTransfer.getData("text/preset-id");
                  if (presetId) onDropPreset(formatKey(year, monthIndex, cell.day), presetId);
                }}
                className={`day-card ${cell.day ? "filled" : "empty"} ${isToday ? "today" : ""}`}
              >
                {cell.day ? (
                  <>
                    <div className="day-head">
                      <div className="day-number">{cell.day}</div>
                    </div>

                    <div className="tickets-wrap">
                      {items.length > 0 ? (
                        items.map((item) => (
                          <Sticker
                            key={item.id}
                            item={item}
                            onClick={() => onOpenItem(formatKey(year, monthIndex, cell.day), item)}
                          />
                        ))
                      ) : (
                        <div className="drop-hint">Déposer une vignette ici</div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}

export default function App() {
  const months = useMemo(() => buildMonths(18), []);
  const scrollRef = useRef(null);
  const [itemsByDay, setItemsByDay] = useState({});
  const [editing, setEditing] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setItemsByDay(loadSavedState());
    setIsFullscreen(!!document.fullscreenElement);
  }, []);

  useEffect(() => {
    saveState(itemsByDay);
  }, [itemsByDay]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA";
      if (!isTyping && e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const scrollToIndex = (index) => {
    const el = scrollRef.current;
    if (!el) return;
    const safeIndex = Math.max(0, Math.min(months.length - 1, index));
    el.scrollTo({ top: safeIndex * el.clientHeight, behavior: "smooth" });
  };

  const handleDropPreset = (dateKey, presetId) => {
    const nextItem = createItemFromPreset(presetId);
    setItemsByDay((prev) => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] || []), nextItem]
    }));
  };

  const handleOpenItem = (dateKey, item) => {
    setEditing({ dateKey, item });
  };

  const handleSaveItem = (nextItem) => {
    if (!editing) return;
    setItemsByDay((prev) => ({
      ...prev,
      [editing.dateKey]: (prev[editing.dateKey] || []).map((it) =>
        it.id === nextItem.id ? nextItem : it
      )
    }));
    setEditing(null);
  };

  const handleDeleteItem = () => {
    if (!editing) return;
    setItemsByDay((prev) => {
      const nextList = (prev[editing.dateKey] || []).filter((it) => it.id !== editing.item.id);
      const next = { ...prev };
      if (nextList.length > 0) next[editing.dateKey] = nextList;
      else delete next[editing.dateKey];
      return next;
    });
    setEditing(null);
  };

  return (
    <div className={`app-shell ${isFullscreen ? "app-fullscreen" : ""}`}>
      <div className="sidebar desktop-only">
        <div className="sidebar-head">
          <div className="sidebar-title">Vignettes</div>
          <div className="sidebar-subtitle">Glisser vers une journée</div>
        </div>
        <div className="sidebar-body">
          {PRESET_TAGS.map((preset) => (
            <PresetChip key={preset.id} preset={preset} />
          ))}
        </div>
      </div>

      <button
        className="fullscreen-btn"
        onClick={toggleFullscreen}
        title="Basculer en plein écran avec F"
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        <span>{isFullscreen ? "Quitter plein écran" : "Plein écran (F)"}</span>
      </button>

      <div className="mobile-preset-bar mobile-only">
        <div className="mobile-preset-title">Vignettes</div>
        <div className="mobile-preset-grid">
          {PRESET_TAGS.map((preset) => (
            <PresetChip key={preset.id} preset={preset} />
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="scroll-area">
        {months.map((month, index) => (
          <MonthPage
            key={month.key}
            year={month.year}
            monthIndex={month.monthIndex}
            pageIndex={index}
            itemsByDay={itemsByDay}
            onDropPreset={handleDropPreset}
            onOpenItem={handleOpenItem}
            onPrevMonth={(pageIndex) => scrollToIndex(pageIndex - 1)}
            onNextMonth={(pageIndex) => scrollToIndex(pageIndex + 1)}
            isFullscreen={isFullscreen}
          />
        ))}
      </div>

      <EditModal
        open={!!editing}
        item={editing?.item || null}
        onClose={() => setEditing(null)}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
      />

      <style>{`
        * { box-sizing: border-box; }
        body { background: #000; color: #111; }
        button, input, textarea { font: inherit; }
        .app-shell {
          height: 100vh;
          width: 100%;
          background: #000000;
          color: #111111;
          overflow: hidden;
        }
        .sidebar {
          position: fixed;
          left: 12px;
          top: 12px;
          bottom: 12px;
          width: 250px;
          z-index: 40;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border: 2px solid #000;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 18px 40px rgba(0,0,0,.35);
        }
        .sidebar-head {
          background: #f0abfc;
          border-bottom: 2px solid #000;
          padding: 16px;
        }
        .sidebar-title {
          font-size: 14px;
          line-height: 1;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .18em;
        }
        .sidebar-subtitle {
          margin-top: 8px;
          font-size: 12px;
          font-weight: 700;
          opacity: .85;
        }
        .sidebar-body {
          flex: 1;
          overflow: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #fff;
        }
        .preset-chip {
          width: 100%;
          border-radius: 18px;
          padding: 12px 14px;
          text-align: left;
          cursor: grab;
          box-shadow: 0 6px 16px rgba(0,0,0,.14);
        }
        .preset-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 900;
          letter-spacing: .04em;
        }
        .preset-emoji { font-size: 18px; }
        .preset-subtitle {
          margin-top: 6px;
          font-size: 11px;
          opacity: .8;
          font-weight: 700;
        }
        .fullscreen-btn {
          position: fixed;
          right: 14px;
          bottom: 14px;
          z-index: 55;
          border: 2px solid #000;
          border-radius: 14px;
          padding: 10px 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #ffffff;
          color: #000;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 12px 24px rgba(0,0,0,.28);
        }
        .scroll-area {
          height: 100vh;
          overflow-y: auto;
          scroll-snap-type: y mandatory;
          scroll-behavior: smooth;
          padding-left: 270px;
          -webkit-overflow-scrolling: touch;
        }
        .page-wrap {
          min-height: 100vh;
          width: 100%;
          scroll-snap-align: start;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0a0a;
          padding: 16px 24px;
        }
        .sheet {
          position: relative;
          width: 100%;
          max-width: 1180px;
          aspect-ratio: 210 / 297;
          border-radius: 28px;
          background: #ffffff;
          border: 2px solid #000;
          overflow: hidden;
          box-shadow: 0 24px 56px rgba(0,0,0,.35);
          display: flex;
          flex-direction: column;
          transition: max-width .18s ease;
        }
        .sheet-fullscreen {
          max-width: calc(100vw - 40px);
        }
        .sheet-header {
          flex-shrink: 0;
          background: #67e8f9;
          border-bottom: 2px solid #000;
          padding: 14px 18px;
        }
        .sheet-nav-shell {
          border: 2px solid #000;
          border-radius: 22px;
          background: #ffffff;
          padding: 12px 14px;
          box-shadow: 0 10px 22px rgba(0,0,0,.16);
        }
        .sheet-nav-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .nav-btn {
          border: 2px solid #000;
          border-radius: 12px;
          padding: 10px 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .prev-btn { background: #fde047; color: #000; }
        .next-btn { background: #bef264; color: #000; }
        .sheet-nav-center {
          min-width: 0;
          flex: 1;
          text-align: center;
          padding: 0 8px;
        }
        .indicator-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .18em;
          color: #555;
          font-weight: 800;
        }
        .sheet-title {
          margin: 6px 0 0;
          font-size: clamp(28px, 4vw, 50px);
          line-height: 1.05;
          font-weight: 900;
          color: #000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .weekday-row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
          padding: 10px 16px 0;
          background: #fff;
        }
        .weekday {
          border: 2px solid #000;
          border-radius: 12px;
          padding: 9px 6px;
          background: #fde047;
          color: #000;
          text-align: center;
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .days-grid {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
          padding: 12px 16px 16px;
          background: #fff;
        }
        .day-card {
          border-radius: 18px;
          padding: 10px;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .day-card.filled {
          border: 2px solid #000;
          background: #fafafa;
        }
        .day-card.empty {
          border: 2px solid transparent;
          background: #f2f2f2;
        }
        .day-card.today {
          box-shadow: 0 0 0 4px #ef4444 inset;
        }
        .day-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .day-number {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 2px solid #000;
          background: #000;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 900;
        }
        .tickets-wrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow: auto;
          padding-right: 2px;
        }
        .drop-hint {
          border: 2px dashed #000;
          border-radius: 12px;
          padding: 10px 8px;
          font-size: 11px;
          font-weight: 800;
          color: #666;
        }
        .sticker {
          width: 100%;
          border-radius: 12px;
          padding: 8px 10px;
          text-align: left;
          box-shadow: 0 4px 10px rgba(0,0,0,.12);
          cursor: pointer;
        }
        .sticker-line {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          line-height: 1.15;
          font-weight: 900;
        }
        .sticker-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sticker-note {
          margin-top: 5px;
          font-size: 11px;
          line-height: 1.2;
          opacity: .92;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(0,0,0,.62);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .modal-card {
          width: 100%;
          max-width: 420px;
          border-radius: 24px;
          border: 2px solid #000;
          background: #fff;
          padding: 18px;
          box-shadow: 0 24px 50px rgba(0,0,0,.35);
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .modal-title {
          font-size: 20px;
          font-weight: 900;
          color: #000;
        }
        .icon-btn {
          border-radius: 12px;
          padding: 9px;
          border: 2px solid #000;
          cursor: pointer;
        }
        .neutral-btn { background: #f3f4f6; color: #000; }
        .field { margin-bottom: 12px; }
        .field label {
          display: block;
          margin-bottom: 6px;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: #444;
        }
        .field input, .field textarea {
          width: 100%;
          border: 2px solid #000;
          border-radius: 12px;
          padding: 10px 12px;
          color: #000;
          background: #fff;
          outline: none;
        }
        .modal-actions {
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .danger-btn, .success-btn {
          border: 2px solid #000;
          border-radius: 12px;
          padding: 10px 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 900;
          cursor: pointer;
        }
        .danger-btn { background: #f87171; color: #fff; }
        .success-btn { background: #bef264; color: #000; }
        .mobile-preset-bar {
          position: fixed;
          left: 12px;
          right: 12px;
          top: 12px;
          z-index: 30;
          border: 2px solid #000;
          border-radius: 18px;
          background: #fff;
          padding: 12px;
          box-shadow: 0 12px 28px rgba(0,0,0,.28);
        }
        .mobile-preset-title {
          margin-bottom: 8px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .16em;
          font-weight: 900;
          color: #000;
        }
        .mobile-preset-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .desktop-only { display: flex; }
        .mobile-only { display: none; }

        @media (max-width: 1279px) {
          .desktop-only { display: none; }
          .mobile-only { display: block; }
          .scroll-area {
            padding-left: 0;
            padding-top: 98px;
          }
          .page-wrap {
            padding: 18px 12px 12px;
          }
          .fullscreen-btn {
            right: 12px;
            bottom: 12px;
            padding: 10px 12px;
          }
        }

        @media (max-width: 900px) {
          .sheet {
            aspect-ratio: auto;
            min-height: calc(100vh - 140px);
          }
          .sheet-header {
            padding: 10px;
          }
          .sheet-nav-shell {
            padding: 10px;
            border-radius: 18px;
          }
          .sheet-nav-row {
            gap: 8px;
          }
          .weekday-row, .days-grid {
            gap: 6px;
            padding-left: 10px;
            padding-right: 10px;
          }
          .days-grid {
            padding-bottom: 10px;
          }
          .day-number {
            width: 36px;
            height: 36px;
            font-size: 16px;
          }
          .weekday {
            font-size: 11px;
            padding: 8px 4px;
          }
          .sticker-line, .preset-title {
            font-size: 11px;
          }
          .nav-btn {
            padding: 8px 10px;
            font-size: 12px;
          }
          .sheet-title {
            font-size: clamp(24px, 4vw, 34px);
          }
          .fullscreen-btn span {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
