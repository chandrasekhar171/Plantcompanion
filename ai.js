const AI = (() => {

  const MODEL   = 'claude-haiku-4-5';
  const API_URL = 'https://api.anthropic.com/v1/messages';

  function getApiKey() {
    return localStorage.getItem('plantCompanion_apiKey') || '';
  }

  /**
   * identifyPlant — sends a compressed plant photo to Claude vision and
   * returns { commonName, speciesName }. Throws on network or parse failure.
   */
  async function identifyPlant(base64DataUrl, excludeName = null) {
    const MODEL_IDENTIFY = 'claude-sonnet-4-5';
    const [header, data] = base64DataUrl.split(',');
    const mediaType = header.match(/data:([^;]+)/)[1]; // e.g. "image/jpeg"

    const excludeClause = excludeName
      ? ` You previously suggested "${excludeName}" but the user rejected it. Do NOT suggest that name again unless you are 95%+ certain it is correct — give your next best identification instead.`
      : '';

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':                              getApiKey(),
        'anthropic-version':                      '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type':                           'application/json',
      },
      body: JSON.stringify({
        model:      MODEL_IDENTIFY,
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type:   'image',
                source: { type: 'base64', media_type: mediaType, data },
              },
              {
                type: 'text',
                text: `Identify the plant species in the image and return ONLY a JSON object with three fields: speciesName, commonName, and suggestedTags (array of 0-3 strings chosen from this exact list: ["Succulents & Cacti","Tropicals","Orchids","Ferns","Herbs","Flowering","Climbers & Trailers","Trees & Bonsai","Vegetables & Fruits","Air Plants"]). Nothing else.${excludeClause}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error', response.status, errText);
      throw new Error(`API ${response.status}`);
    }

    const json  = await response.json();
    const raw   = json.content[0].text.trim();
    // Strip any markdown code fences Claude may add defensively
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(clean);

    if (!result.commonName || !result.speciesName) throw new Error('Unexpected shape');
    if (!Array.isArray(result.suggestedTags)) result.suggestedTags = [];
    return result;
  }

  /**
   * analyseJournal — sends plant profile + photos + recent journal entries
   * to Claude and returns { healthScore, aiContext, snippets }.
   * healthScore and aiContext may be null for non-plant responses.
   * Throws on network or parse failure.
   */
  async function analyseJournal(plant, entries) {
    const recent = [...entries]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10)
      .map(e => ({
        timestamp: e.timestamp,
        watered:   e.watered,
        fed:       e.fed,
        pruned:    e.pruned,
        repotted:  e.repotted,
        notes:     e.notes || '',
      }));

    const profile = {
      commonName:  plant.commonName,
      speciesName: plant.speciesName,
      ageYears:    plant.ageYears,
      ageMonths:   plant.ageMonths,
      addedDate:   plant.addedDate,
      ...(plant.tags && plant.tags.length > 0 ? { tags: plant.tags } : {}),
    };

    // ── Photo blocks ───────────────────────────────────────────────
    function toImageBlock(dataUrl) {
      const [header, data] = dataUrl.split(',');
      const mediaType = header.match(/data:([^;]+)/)[1];
      return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
    }

    const imageBlocks = [];
    let   photoInstruction = '';

    // Always include the plant profile photo if one exists
    if (plant.photoBase64) {
      imageBlocks.push(toImageBlock(plant.photoBase64));
    }

    // Find the most recent journal entry that has a photo
    const latestWithPhoto = [...entries]
      .filter(e => e.photoBase64)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    if (latestWithPhoto) {
      const ageMs       = Date.now() - new Date(latestWithPhoto.timestamp).getTime();
      const thirtyDays  = 30 * 24 * 60 * 60 * 1000;
      if (ageMs <= thirtyDays) {
        // Recent journal photo — send it alongside the profile photo
        imageBlocks.push(toImageBlock(latestWithPhoto.photoBase64));
        photoInstruction =
          'Two photos are provided: the first is the plant\'s profile photo, ' +
          'the second is from a recent journal entry. ' +
          'Compare them to assess any visible changes over time.\n';
      } else {
        // Stale journal photo — profile photo only; remind user via a snippet
        photoInstruction =
          'The last journal photo is over a month old — include this as one of your snippets: ' +
          '\'Your last plant photo is over a month old, upload a fresh photo in your next ' +
          'journal entry for more accurate insights\'.\n';
      }
      // No journal photo at all → profile photo only, no reminder needed
    }

    // ── Prompt ─────────────────────────────────────────────────────
    const promptText =
      'You are a plant care expert. Analyse the plant profile and recent journal entries below, ' +
      'then return ONLY a valid JSON object with exactly three fields: ' +
      'healthScore (integer 1–10, or null if the subject is not a plant), ' +
      'aiContext (one sentence about what to expect for this plant' +
      (profile.ageYears === 0 && profile.ageMonths === 0 ? '' : ' at this age') +
      ' in the current season, or null if not a plant), ' +
      'snippets (array of 3–5 strings covering what\'s going well, what needs attention, and care tips). ' +
      'Nothing else.\n\n' +
      'Scoring criteria: 1–3 = neglected or showing serious issues; ' +
      '4–6 = adequate care with room for improvement; ' +
      '7–8 = well cared for; 9–10 = thriving with optimal care.\n' +
      'Base the health score primarily on care action frequency and consistency relative to the species\' typical needs. ' +
      'User notes are secondary context — a positive note does not override poor care patterns.\n' +
      (profile.ageYears === 0 && profile.ageMonths === 0
        ? 'Plant age is unknown — omit any age references from aiContext.\n'
        : '') +
      'If the profile photo or plant name does not appear to be a plant, return a JSON where ' +
      'healthScore is null, aiContext is null, and snippets contains exactly one string: ' +
      '\'This does not appear to be a plant — upload a clear photo of your plant during the ' +
      'next journal entry for better insights\'.\n' +
      photoInstruction +
      '\nPlant: '    + JSON.stringify(profile) + '\n' +
      'Current date: ' + new Date().toISOString() + '\n' +
      'Recent journal entries (newest first): ' + JSON.stringify(recent);

    // ── Request ────────────────────────────────────────────────────
    // Use a content array when photos are present, plain string otherwise
    const messageContent = imageBlocks.length > 0
      ? [...imageBlocks, { type: 'text', text: promptText }]
      : promptText;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':                              getApiKey(),
        'anthropic-version':                      '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type':                           'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 512,
        messages:   [{ role: 'user', content: messageContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic analyse error', response.status, errText);
      throw new Error(`API ${response.status}`);
    }

    const json   = await response.json();
    const raw    = json.content[0].text.trim();
    const clean  = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(clean);

    // healthScore and aiContext may be null for non-plant responses
    if (!Array.isArray(result.snippets))                                    throw new Error('Unexpected shape');
    if (result.healthScore !== null && typeof result.healthScore !== 'number') throw new Error('Unexpected shape');
    if (result.aiContext   !== null && typeof result.aiContext   !== 'string') throw new Error('Unexpected shape');
    return result;
  }

  /**
   * chatWithPlant — sends a conversation turn to Claude and returns the
   * assistant's reply as a plain string. Throws on network or API failure.
   */
  async function chatWithPlant(plant, conversationHistory, newMessage, journalEntries = []) {
    const parts = [];
    if (plant.ageYears  > 0) parts.push(`${plant.ageYears} year${plant.ageYears  !== 1 ? 's' : ''}`);
    if (plant.ageMonths > 0) parts.push(`${plant.ageMonths} month${plant.ageMonths !== 1 ? 's' : ''}`);
    const ageStr  = parts.length > 0 ? parts.join(' and ') + ' old' : 'unknown age';
    const tagsStr = plant.tags && plant.tags.length > 0 ? ` Tags: ${plant.tags.join(', ')}.` : '';

    // Keyword detection — silently expand to full history when user asks for it
    const wantsFullHistory = /more history|older entries|full history|read more|all entries|more journal/i.test(newMessage);

    const sorted = [...journalEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const contextEntries = wantsFullHistory ? sorted : sorted.slice(0, 5);

    function formatJournalContext(entries) {
      return entries.map(e => {
        const date    = new Date(e.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const actions = [e.watered && 'Watered', e.fed && 'Fed', e.pruned && 'Pruned', e.repotted && 'Repotted']
          .filter(Boolean).join(', ') || 'No care actions';
        const health  = e.healthScore != null ? ` Health: ${e.healthScore}/10.` : '';
        const notes   = e.notes ? ` "${e.notes.length > 100 ? e.notes.slice(0, 100) + '…' : e.notes}"` : '';
        return `- ${date}: ${actions}.${health}${notes}`;
      }).join('\n');
    }

    const journalContext = contextEntries.length > 0
      ? `\n\nJournal history (${wantsFullHistory ? 'all' : 'last 5'} entries, newest first):\n${formatJournalContext(contextEntries)}`
      : '';

    const systemPrompt =
      `You are a knowledgeable plant care assistant. ` +
      `The user is asking about their plant: ${plant.commonName} (${plant.speciesName}), ${ageStr}.${tagsStr} ` +
      `Give practical, specific advice. Be concise and conversational.` +
      journalContext;

    const messages = [
      ...conversationHistory.slice(-20).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: newMessage },
    ];

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':                              getApiKey(),
        'anthropic-version':                      '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type':                           'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 280,
        system:     systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic chat error', response.status, errText);
      throw new Error(`API ${response.status}`);
    }

    const json = await response.json();
    return json.content[0].text.trim();
  }

  /**
   * suggestTags — text-only Haiku call returning an array of 0-3 tag strings.
   * Never throws — returns [] on any error.
   */
  async function suggestTags(plant) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key':                              getApiKey(),
          'anthropic-version':                      '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type':                           'application/json',
        },
        body: JSON.stringify({
          model:      MODEL,
          max_tokens: 128,
          messages: [{
            role: 'user',
            content: `Given the plant "${plant.commonName}" (${plant.speciesName}), return ONLY a JSON array of 0-3 tags chosen from this exact list: ["Succulents & Cacti","Tropicals","Orchids","Ferns","Herbs","Flowering","Climbers & Trailers","Trees & Bonsai","Vegetables & Fruits","Air Plants"]. Nothing else.`,
          }],
        }),
      });
      if (!response.ok) return [];
      const json  = await response.json();
      const raw   = json.content[0].text.trim();
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const tags  = JSON.parse(clean);
      return Array.isArray(tags) ? tags.slice(0, 3) : [];
    } catch {
      return [];
    }
  }

  return { identifyPlant, analyseJournal, chatWithPlant, suggestTags };

})();
