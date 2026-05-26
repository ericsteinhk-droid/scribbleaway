import { useState, FormEvent } from 'react';
import type { Report } from '../../types';
import { WEATHER_OPTIONS } from '../../types';

interface Props {
  initial?: Report;
  onSave: (data: Omit<Report, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'entryCount' | 'attendeeCount'>) => Promise<void>;
  onCancel: () => void;
}

export default function ReportForm({ initial, onSave, onCancel }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(initial?.date ?? today);
  const [time, setTime] = useState(initial?.time ?? '');
  const [weather, setWeather] = useState(initial?.weather ?? '');
  const [authorName, setAuthorName] = useState(initial?.authorName ?? '');
  const [attendees, setAttendees] = useState<string[]>(initial?.attendees ?? ['']);
  const [saving, setSaving] = useState(false);

  function addAttendee() {
    setAttendees((a) => [...a, '']);
  }

  function updateAttendee(i: number, v: string) {
    setAttendees((a) => a.map((x, j) => (j === i ? v : x)));
  }

  function removeAttendee(i: number) {
    setAttendees((a) => a.filter((_, j) => j !== i));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      date,
      time: time || undefined,
      weather: weather || undefined,
      authorName: authorName.trim(),
      attendees: attendees.map((a) => a.trim()).filter(Boolean),
    });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Date *
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-evoq"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Heure
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-evoq"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Conditions météo
        </label>
        <select
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-evoq"
        >
          <option value="">— Sélectionner —</option>
          {WEATHER_OPTIONS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Architecte / Auteur *
        </label>
        <input
          type="text"
          required
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Marie Dupont, arch."
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-evoq"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Participants
          </label>
          <button
            type="button"
            onClick={addAttendee}
            className="text-xs text-evoq hover:text-evoq-dark font-medium"
          >
            + Ajouter
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {attendees.map((a, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={a}
                onChange={(e) => updateAttendee(i, e.target.value)}
                placeholder={`Participant ${i + 1}`}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-evoq"
              />
              {attendees.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAttendee(i)}
                  aria-label="Retirer"
                  className="touch-target flex items-center justify-center text-gray-400 hover:text-red-500"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 rounded-lg bg-evoq text-white text-sm font-medium hover:bg-evoq-dark disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {initial ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </form>
  );
}
