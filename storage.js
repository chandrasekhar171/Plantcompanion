/**
 * Storage module — the only part of the app that touches localStorage.
 * All other modules call these functions; they never read/write storage directly.
 *
 * Keys:
 *   plantCompanion_plants              → JSON array of Plant objects
 *   plantCompanion_journal_[plantId]   → JSON array of JournalEntry objects
 */

const Storage = (() => {

  const PLANTS_KEY = 'plantCompanion_plants';
  const journalKey = (plantId) => `plantCompanion_journal_${plantId}`;

  /* ── Helpers ────────────────────────────────────────────────── */

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
        throw new Error('QUOTA_EXCEEDED');
      }
      throw e;
    }
  }

  /* ── Plant functions ────────────────────────────────────────── */

  /**
   * getAllPlants — returns every saved Plant object.
   * Returns [] if storage is empty or corrupted.
   */
  function getAllPlants() {
    return readJSON(PLANTS_KEY) ?? [];
  }

  /**
   * getPlant — returns a single Plant by id, or null if not found.
   */
  function getPlant(id) {
    return getAllPlants().find((p) => p.id === id) ?? null;
  }

  /**
   * savePlant — persists a complete new Plant object.
   * Generates an id if one is not provided.
   * Returns the saved plant (with id guaranteed).
   */
  function savePlant(plant) {
    const plants = getAllPlants();
    const toSave = { ...plant, id: plant.id || generateId() };
    plants.push(toSave);
    writeJSON(PLANTS_KEY, plants);
    return toSave;
  }

  /**
   * updatePlant — merges a partial fields object into an existing Plant.
   * Only the provided fields are changed; everything else is preserved.
   * Returns the updated plant, or null if the plant id was not found.
   */
  function updatePlant(id, fields) {
    const plants = getAllPlants();
    const index = plants.findIndex((p) => p.id === id);
    if (index === -1) return null;
    plants[index] = { ...plants[index], ...fields };
    writeJSON(PLANTS_KEY, plants);
    return plants[index];
  }

  /**
   * deletePlant — removes a Plant and all of its JournalEntry records.
   * Returns true if the plant existed and was deleted, false otherwise.
   */
  function deletePlant(id) {
    const plants = getAllPlants();
    const filtered = plants.filter((p) => p.id !== id);
    if (filtered.length === plants.length) return false;
    writeJSON(PLANTS_KEY, filtered);
    localStorage.removeItem(journalKey(id));
    return true;
  }

  /* ── Journal functions ──────────────────────────────────────── */

  /**
   * getJournalEntries — returns all JournalEntry objects for a plant,
   * ordered by timestamp ascending (oldest first).
   * Returns [] if none exist or storage is corrupted.
   */
  function getJournalEntries(plantId) {
    return readJSON(journalKey(plantId)) ?? [];
  }

  /**
   * saveJournalEntry — appends a new JournalEntry for a plant.
   * Generates an id if one is not provided.
   * Returns the saved entry (with id guaranteed).
   */
  function saveJournalEntry(entry) {
    const entries = getJournalEntries(entry.plantId);
    const toSave = { ...entry, id: entry.id || generateId() };
    entries.push(toSave);
    writeJSON(journalKey(entry.plantId), entries);
    return toSave;
  }

  /**
   * updateJournalEntry — merges partial fields into an existing JournalEntry.
   * Returns the updated entry, or null if the entry id was not found.
   */
  function updateJournalEntry(plantId, entryId, fields) {
    const entries = getJournalEntries(plantId);
    const index   = entries.findIndex(e => e.id === entryId);
    if (index === -1) return null;
    entries[index] = { ...entries[index], ...fields };
    writeJSON(journalKey(plantId), entries);
    return entries[index];
  }

  /* ── Chat functions ─────────────────────────────────────────── */

  const chatKey       = (plantId) => `plantCompanion_chat_${plantId}`;
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

  function getChatMessages(plantId) {
    const raw     = readJSON(chatKey(plantId)) ?? [];
    const cleaned = raw.filter(m => Date.now() - new Date(m.timestamp).getTime() < SIX_MONTHS_MS);
    if (cleaned.length !== raw.length) writeJSON(chatKey(plantId), cleaned);
    return cleaned;
  }

  function saveChatMessage(plantId, message) {
    const messages = getChatMessages(plantId);
    messages.push(message);
    writeJSON(chatKey(plantId), messages);
  }

  function clearOldChatMessages(plantId) {
    const messages = readJSON(chatKey(plantId)) ?? [];
    const cleaned  = messages.filter(m => Date.now() - new Date(m.timestamp).getTime() < SIX_MONTHS_MS);
    writeJSON(chatKey(plantId), cleaned);
  }

  /* ── Public API ─────────────────────────────────────────────── */

  return {
    generateId,
    getAllPlants,
    getPlant,
    savePlant,
    updatePlant,
    deletePlant,
    getJournalEntries,
    saveJournalEntry,
    updateJournalEntry,
    getChatMessages,
    saveChatMessage,
    clearOldChatMessages,
  };

})();
