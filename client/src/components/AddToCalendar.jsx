import { useState } from "react";
import { useApp, dateKey } from "../context/AppContext.jsx";

// Short, friendly date label for a YYYY-MM-DD key.
function shortDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A small control that drops a recommended session (cardio, flexibility, …) onto
// the calendar as an activity, on a date the user picks (defaults to today).
export default function AddToCalendar({ type, title }) {
  const { addActivity } = useApp();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(dateKey());
  const [added, setAdded] = useState(null);

  const add = () => {
    if (!date) return;
    addActivity(date, { type, title });
    setAdded(date);
    setOpen(false);
    setTimeout(() => setAdded(null), 3000);
  };

  if (added) {
    return <span className="add-cal-done">✓ Added to {shortDate(added)}</span>;
  }
  return open ? (
    <div className="add-cal">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button className="btn sm" type="button" onClick={add}>
        Add
      </button>
      <button className="btn ghost sm" type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  ) : (
    <button className="btn ghost sm" type="button" onClick={() => setOpen(true)}>
      + Add to calendar
    </button>
  );
}
