/**
 * UI module — renders data and handles user interactions.
 * Never touches localStorage directly (always goes via Storage module).
 * Never calls Claude directly (will go via AI module in Step 7).
 */

const UI = (() => {

  /* ── State ──────────────────────────────────────────────────── */
  let pendingPhotoBase64   = null;   // photo staged in Add Plant flow
  let journalPhotoBase64   = null;   // photo staged in journal entry
  let currentPlantId       = null;   // plant currently open
  let pendingDeleteId      = null;   // plant ID queued for deletion via long press
  let journalHistoryFilter = null;   // active care-action filter on journal history page
  let activePlantTab       = 'care-tips'; // which tab is active on the plant page
  let backDest             = 'my-plants'; // where the back button returns to
  let healthChart          = null;   // Chart.js instance, kept to allow destroy on re-render
  let pendingTagSelection  = [];     // confirmed tag selection (committed on Save Tags)
  let tagPickerCallback    = null;   // callback invoked with selected tags on Save Tags
  let myPlantsTagFilter    = null;   // active tag filter on My Plants page
  let changePhotoCallback  = null;   // callback invoked with a File when change-photo sheet picks one
  let reidentifyPending    = null;   // { photoBase64, commonName, speciesName, suggestedTags } between ID and confirm

  const TOGGLE_IDS = ['toggle-watered', 'toggle-fed', 'toggle-pruned', 'toggle-repotted'];

  /* ── Care action icon SVGs ──────────────────────────────────── */
  const CARE_ICONS = {
    Watered:  `<svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2C9 2 4 9 4 12C4 14.8 6.2 16.5 9 16.5C11.8 16.5 14 14.8 14 12C14 9 9 2 9 2Z" fill="#4A9FD4"/></svg>`,
    Fed:      `<svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="3.2" fill="#E8A838"/><path d="M9 1.5V4M9 14V16.5M1.5 9H4M14 9H16.5M3.7 3.7L5.4 5.4M12.6 12.6L14.3 14.3M3.7 14.3L5.4 12.6M12.6 5.4L14.3 3.7" stroke="#E8A838" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    Pruned:   `<svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="4.5" cy="13.5" r="2.2" stroke="#D4724A" stroke-width="1.5"/><circle cx="4.5" cy="4.5" r="2.2" stroke="#D4724A" stroke-width="1.5"/><line x1="6.3" y1="12.1" x2="15" y2="5" stroke="#D4724A" stroke-width="1.5" stroke-linecap="round"/><line x1="6.3" y1="5.9" x2="15" y2="13" stroke="#D4724A" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    Repotted: `<svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4.5 8.5H13.5L12.5 16H5.5L4.5 8.5Z" fill="#C4856A"/><rect x="3" y="6.5" width="12" height="2.5" rx="1.2" fill="#C4856A"/><path d="M9 6.5C9 6.5 7 4.5 7 3C7 2 7.8 1.5 9 1.5C10.2 1.5 11 2 11 3C11 4.5 9 6.5 9 6.5Z" fill="#7a9e76"/></svg>`,
  };

  /* ── Plant type tags ───────────────────────────────────────── */
  const PLANT_TAGS = [
    'Succulents & Cacti',
    'Tropicals',
    'Orchids',
    'Ferns',
    'Herbs',
    'Flowering',
    'Climbers & Trailers',
    'Trees & Bonsai',
    'Vegetables & Fruits',
    'Air Plants',
  ];

  const TAG_META = {
    'Succulents & Cacti': {
      color: '#4AADAC',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="7.5" y="5" width="3" height="11" rx="1.5" fill="#4AADAC"/><path d="M7.5 9H5.5Q4 9 4 7.5V6" stroke="#4AADAC" stroke-width="2" stroke-linecap="round"/><path d="M10.5 9H12.5Q14 9 14 7.5V6" stroke="#4AADAC" stroke-width="2" stroke-linecap="round"/></svg>`,
    },
    'Tropicals': {
      color: '#E8833A',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 16C6 12 3 9 4 6C5 3.5 7 2.5 9 4.5C11 2.5 13 3.5 14 6C15 9 12 12 9 16Z" fill="#E8833A"/></svg>`,
    },
    'Orchids': {
      color: '#9B6DB5',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 9C11 6 11.5 3 9 2C6.5 3 7 6 9 9Z" fill="#9B6DB5"/><path d="M9 9C11 6 11.5 3 9 2C6.5 3 7 6 9 9Z" fill="#9B6DB5" transform="rotate(72 9 9)"/><path d="M9 9C11 6 11.5 3 9 2C6.5 3 7 6 9 9Z" fill="#9B6DB5" transform="rotate(144 9 9)"/><path d="M9 9C11 6 11.5 3 9 2C6.5 3 7 6 9 9Z" fill="#9B6DB5" transform="rotate(216 9 9)"/><path d="M9 9C11 6 11.5 3 9 2C6.5 3 7 6 9 9Z" fill="#9B6DB5" transform="rotate(288 9 9)"/></svg>`,
    },
    'Ferns': {
      color: '#5A8A5E',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9.5 16C8.5 12 8 8 10 3" stroke="#5A8A5E" stroke-width="1.5" stroke-linecap="round"/><path d="M9.5 7C9.5 7 6 5.5 5 7C6 8 9.5 7 9.5 7Z" fill="#5A8A5E"/><path d="M9.5 10C9.5 10 6 8.5 5.5 10C6.5 11 9.5 10 9.5 10Z" fill="#5A8A5E"/><path d="M9 13C9 13 7 12 6.5 13.5C7.5 14 9 13 9 13Z" fill="#5A8A5E"/></svg>`,
    },
    'Herbs': {
      color: '#7BB34E',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><line x1="9" y1="16" x2="9" y2="6" stroke="#7BB34E" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="9" cy="5.5" rx="2.5" ry="3" fill="#7BB34E"/><ellipse cx="5.5" cy="9.5" rx="2.2" ry="2.8" fill="#7BB34E" transform="rotate(30 5.5 9.5)"/><ellipse cx="12.5" cy="9.5" rx="2.2" ry="2.8" fill="#7BB34E" transform="rotate(-30 12.5 9.5)"/></svg>`,
    },
    'Flowering': {
      color: '#D4527A',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 9C11.5 6.5 12.5 3 9 2C5.5 3 6.5 6.5 9 9Z" fill="#D4527A"/><path d="M9 9C11.5 6.5 12.5 3 9 2C5.5 3 6.5 6.5 9 9Z" fill="#D4527A" transform="rotate(90 9 9)"/><path d="M9 9C11.5 6.5 12.5 3 9 2C5.5 3 6.5 6.5 9 9Z" fill="#D4527A" transform="rotate(180 9 9)"/><path d="M9 9C11.5 6.5 12.5 3 9 2C5.5 3 6.5 6.5 9 9Z" fill="#D4527A" transform="rotate(270 9 9)"/></svg>`,
    },
    'Climbers & Trailers': {
      color: '#8B6F47',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 15C5 12 6.5 10.5 9 10.5C11 10.5 13 9 15 6" stroke="#8B6F47" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="6.5" cy="8" rx="2.5" ry="1.5" fill="#8B6F47" transform="rotate(40 6.5 8)"/><ellipse cx="12.5" cy="10.5" rx="2.5" ry="1.5" fill="#8B6F47" transform="rotate(-40 12.5 10.5)"/></svg>`,
    },
    'Trees & Bonsai': {
      color: '#3D6B4F',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><polygon points="9,2 15.5,12 2.5,12" fill="#3D6B4F"/><rect x="7.5" y="12" width="3" height="4" rx="1" fill="#3D6B4F"/></svg>`,
    },
    'Vegetables & Fruits': {
      color: '#D45A3A',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="11.5" r="5" fill="#D45A3A"/><path d="M9 6.5C9 4.5 11 3 11 3C11 3 10 5 9 6.5Z" fill="#5A8A5E"/><path d="M9 6.5C8 4 8.5 2.5 8.5 2.5C7.5 3.5 7.5 5 9 6.5Z" fill="#7BB34E"/></svg>`,
    },
    'Air Plants': {
      color: '#5A9EC4',
      icon:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><line x1="9" y1="2" x2="9" y2="16" stroke="#5A9EC4" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="9" x2="16" y2="9" stroke="#5A9EC4" stroke-width="2" stroke-linecap="round"/><line x1="3.5" y1="3.5" x2="14.5" y2="14.5" stroke="#5A9EC4" stroke-width="1.6" stroke-linecap="round"/><line x1="14.5" y1="3.5" x2="3.5" y2="14.5" stroke="#5A9EC4" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="9" r="2" fill="#5A9EC4"/></svg>`,
    },
  };

  /* ── DOM refs (resolved once on init) ──────────────────────── */
  let $title, $backBtn, $fabAnchor, $toast, $plantList, $gearBtn;
  let toastTimer;

  /* ── Helpers ────────────────────────────────────────────────── */

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    const diffDays = Math.floor((Date.now() - new Date(isoString)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7)  return `${diffDays} days ago`;
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short',
    });
  }

  function formatTimeAmPm(isoString) {
    const d    = new Date(isoString);
    let   h    = d.getHours();
    const min  = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${min} ${ampm}`;
  }

  function localDateKey(isoString) {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function formatDateHeader(isoString) {
    const diffDays = Math.floor((Date.now() - new Date(isoString)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  function formatSaveTimestamp(isoString) {
    const d    = new Date(isoString);
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let   h    = d.getHours();
    const min  = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `Saved on ${dd}/${mm}/${yyyy} ${h}:${min} ${ampm}`;
  }

  // Compresses a File to a JPEG data-URL capped at maxDim px on the longest side.
  // Keeps localStorage usage reasonable (uncompressed photos can exceed the 5 MB limit).
  function compressImage(file, maxDim = 800, quality = 0.80) {
    return new Promise((resolve, reject) => {
      if (file.size > 50 * 1024 * 1024) { reject(new Error('FILE_TOO_LARGE')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('READ_FAILED'));
      reader.onload = ({ target: { result } }) => {
        const img = new Image();
        img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
        img.onload = () => {
          try {
            const scale  = Math.min(1, maxDim / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch { reject(new Error('COMPRESS_FAILED')); }
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }

  const LEAF_SVG = `
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <ellipse cx="17" cy="14" rx="8" ry="11"
               fill="rgba(255,255,255,0.55)" transform="rotate(-10 17 14)"/>
      <line x1="17" y1="12" x2="17" y2="30"
            stroke="rgba(255,255,255,0.75)" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`.trim();

  const SAD_LEAF_SVG = `
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
      <ellipse cx="30" cy="16" rx="9" ry="12" fill="rgba(255,255,255,0.40)" transform="rotate(22 30 16)"/>
      <path d="M26 26 C25 32 23 37 21 43 C20 47 18 50 15 51" stroke="rgba(255,255,255,0.65)" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="21" cy="36" rx="5" ry="6" fill="rgba(255,255,255,0.22)" transform="rotate(-15 21 36)"/>
    </svg>`.trim();

  const OPEN_EYE_SVG   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const CLOSED_EYE_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  /* ── Toast ──────────────────────────────────────────────────── */

  function showToast(msg) {
    clearTimeout(toastTimer);
    $toast.textContent = msg;
    $toast.classList.add('show');
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2000);
  }

  function setTitle(text) {
    $title.innerHTML = '';
    $title.classList.remove('app-title--small', 'app-title--marquee');
    $title.style.removeProperty('--marquee-dist');

    const inner = document.createElement('span');
    inner.className = 'app-title__inner';
    inner.textContent = text;
    $title.appendChild(inner);

    void $title.offsetWidth;
    if (inner.offsetWidth <= $title.clientWidth) return;

    $title.classList.add('app-title--small');
    void $title.offsetWidth;
    if (inner.offsetWidth <= $title.clientWidth) return;

    const dist = $title.clientWidth - inner.offsetWidth;
    $title.style.setProperty('--marquee-dist', `${dist}px`);
    $title.classList.add('app-title--marquee');
  }

  /* ── View router ────────────────────────────────────────────── */

  function showView(name, data = {}) {
    // V1: no session persistence — page refresh always restarts from the initial view. By design.
    const hasKey = !!localStorage.getItem('plantCompanion_apiKey');

    // API key gate: no key → always onboarding, regardless of plant state
    if (!hasKey) {
      name = 'onboarding';
    } else if (name === 'my-plants' && Storage.getAllPlants().length === 0) {
      // Redirect to empty state when key exists but no plants saved yet
      name = 'home';
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${name}`).classList.add('active');
    requestAnimationFrame(() => { document.getElementById('page-root').scrollTop = 0; });
    $title.style.visibility = '';

    // Track view as a page_view event in Google Analytics
    if (typeof gtag === 'function') {
      gtag('event', 'page_view', { page_title: name, page_path: '/' + name });
    }

    if (name === 'onboarding') {
      backDest                 = 'my-plants';
      setTitle('Plant Companion');
      $title.style.visibility  = 'hidden';
      $backBtn.style.display   = 'none';
      $fabAnchor.style.display = 'none';
      $gearBtn.style.display   = 'none';
      document.getElementById('field-api-key').value     = '';
      document.getElementById('api-key-error').textContent = '';

    } else if (name === 'home') {
      backDest                 = 'my-plants';
      setTitle('Plant Companion');
      $title.style.visibility  = 'hidden';
      $backBtn.style.display   = 'none';
      $fabAnchor.style.display = 'none';
      $gearBtn.style.display   = '';

    } else if (name === 'my-plants') {
      backDest                 = 'my-plants';
      setTitle('Plant Companion');
      $backBtn.style.display   = 'none';
      $fabAnchor.style.display = '';
      $gearBtn.style.display   = '';
      renderMyPlants();

    } else if (name === 'add-plant') {
      backDest                 = 'my-plants';
      setTitle('Add Plant');
      $backBtn.style.display   = '';
      $fabAnchor.style.display = 'none';
      $gearBtn.style.display   = '';

    } else if (name === 'plant') {
      const plantId = data.plantId || currentPlantId;
      const plant   = Storage.getPlant(plantId);
      currentPlantId           = plantId;
      backDest                 = 'my-plants';
      setTitle(plant ? plant.commonName : 'Plant');
      $backBtn.style.display   = '';
      $fabAnchor.style.display = 'none';
      $gearBtn.style.display   = '';

      // Banner photo
      const banner    = document.getElementById('plant-banner');
      const bannerImg = document.getElementById('plant-banner-img');
      if (plant && plant.photoBase64) {
        bannerImg.onerror    = () => { banner.style.display = 'none'; };
        bannerImg.src        = plant.photoBase64;
        banner.style.display = 'block';
      } else {
        banner.style.display = 'none';
      }

      // Reset to Care Tips tab whenever the plant page is opened
      activePlantTab = 'care-tips';
      document.getElementById('tab-care-tips').classList.add('ct-tab--active');
      document.getElementById('tab-chat').classList.remove('ct-tab--active');
      document.getElementById('panel-care-tips').style.display = '';
      document.getElementById('panel-chat').style.display      = 'none';
      document.getElementById('care-tips-card').classList.remove('chat-active');

      renderPlantTags(plantId);
      renderHealthGraph(plantId);
      renderCareTips(plantId);
      renderJournalHistory(plantId);

    } else if (name === 'journal') {
      backDest                 = 'plant';
      setTitle('New Journal Entry');
      $backBtn.style.display   = '';
      $fabAnchor.style.display = 'none';
      $gearBtn.style.display   = '';
      resetJournalForm();

    } else if (name === 'journal-history') {
      backDest                 = 'plant';
      setTitle('Journal History');
      $backBtn.style.display   = '';
      $fabAnchor.style.display = 'none';
      $gearBtn.style.display   = '';
      journalHistoryFilter     = null;
      renderJournalHistoryPage();

    } else if (name === 'photo-timeline') {
      backDest                 = data.from || 'plant';
      setTitle('Photo Timeline');
      $backBtn.style.display   = '';
      $fabAnchor.style.display = 'none';
      $gearBtn.style.display   = '';
      renderPhotoTimeline();
    }
  }

  /* ── My Plants ──────────────────────────────────────────────── */

  function renderMyPlants() {
    const plants       = Storage.getAllPlants();
    const filterBar    = document.getElementById('mp-tag-filter');
    const filterScroll = document.getElementById('mp-tag-filter-scroll');

    // Filter bar — show all 10 tags when there are plants
    if (plants.length > 0) {
      filterBar.style.display = '';
      filterScroll.innerHTML = PLANT_TAGS.map(tag => {
        const meta   = TAG_META[tag];
        const active = myPlantsTagFilter === tag;
        return `<button class="mp-filter-pill${active ? ' mp-filter-pill--active' : ''}"
                  data-tag="${escapeHtml(tag)}"
                  style="color:${meta.color}"
                  type="button">${meta.icon}${escapeHtml(tag)}</button>`;
      }).join('');
    } else {
      filterBar.style.display = 'none';
    }

    if (plants.length === 0) {
      $plantList.innerHTML =
        '<li class="empty-hint">No plants yet — tap + to add your first one.</li>';
      return;
    }

    // Filter plants by active tag
    const displayed = myPlantsTagFilter
      ? plants.filter(p => p.tags && p.tags.includes(myPlantsTagFilter))
      : plants;

    if (displayed.length === 0) {
      $plantList.innerHTML = '<li class="empty-hint">No plants with this tag yet</li>';
      return;
    }

    $plantList.innerHTML = displayed.map(p => {
      const tagHtml = (p.tags && p.tags.length > 0)
        ? `<div class="plant-card__tags">${p.tags.map(tag => {
            const meta = TAG_META[tag] || { color: '#888', icon: '' };
            return `<span class="plant-tag-pill" style="color:${meta.color}">${meta.icon}${escapeHtml(tag)}</span>`;
          }).join('')}</div>`
        : '';
      return `
        <li>
          <div class="plant-card nm-raised"
               role="button" tabindex="0" data-id="${escapeHtml(p.id)}"
               aria-label="Open ${escapeHtml(p.commonName)}">
            <div class="plant-card__thumb">
              ${p.photoBase64
                ? `<img src="${p.photoBase64}" alt="" onerror="this.style.display='none'" />`
                : LEAF_SVG}
            </div>
            <div class="plant-card__info">
              <p class="plant-card__name">${escapeHtml(p.commonName)}</p>
              <p class="plant-card__meta">
                ${p.lastHealthScore != null ? `Health: ${p.lastHealthScore} / 10` : 'Health: —'}
              </p>
              <p class="plant-card__meta">Last watered: ${formatDate(p.lastWatered)}</p>
              ${tagHtml}
            </div>
          </div>
        </li>`;
    }).join('');

    $plantList.querySelectorAll('.plant-card').forEach(card => attachLongPress(card));
  }

  function toggleMyPlantsFilter(tag) {
    myPlantsTagFilter = myPlantsTagFilter === tag ? null : tag;
    renderMyPlants();
  }

  /* ── Long press + delete plant ──────────────────────────────── */

  function attachLongPress(card) {
    let timer        = null;
    let didLongPress = false;
    let onMove       = null;

    function clearTimer() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (onMove) { card.removeEventListener('touchmove', onMove); onMove = null; }
    }

    function start() {
      didLongPress = false;
      timer = setTimeout(() => {
        timer = null;
        didLongPress = true;
        openDeleteSheet(card.dataset.id);
      }, 600);
      onMove = clearTimer;
      card.addEventListener('touchmove', onMove, { passive: true });
    }

    card.addEventListener('touchstart',  start,      { passive: true });
    card.addEventListener('touchend',    clearTimer);
    card.addEventListener('touchcancel', clearTimer);
    card.addEventListener('mousedown',   start);
    card.addEventListener('mouseup',     clearTimer);
    card.addEventListener('mouseleave',  clearTimer);
    // suppress browser context menu triggered by long press on mobile
    card.addEventListener('contextmenu', e => e.preventDefault());

    card.addEventListener('click', () => {
      if (didLongPress) { didLongPress = false; return; }
      showView('plant', { plantId: card.dataset.id });
    });
  }

  function openDeleteSheet(plantId) {
    const plant = Storage.getPlant(plantId);
    if (!plant) return;
    pendingDeleteId = plantId;
    document.getElementById('delete-plant-name').textContent = plant.commonName;
    document.getElementById('delete-sheet').classList.add('open');
    document.getElementById('delete-backdrop').classList.add('open');
  }

  function closeDeleteSheet() {
    document.getElementById('delete-sheet').classList.remove('open');
    document.getElementById('delete-backdrop').classList.remove('open');
    pendingDeleteId = null;
  }

  function handleDeletePlant() {
    if (!pendingDeleteId) return;
    Storage.deletePlant(pendingDeleteId);
    closeDeleteSheet();
    showToast('Plant deleted');
    showView('my-plants');
  }

  /* ── Add Plant form ─────────────────────────────────────────── */

  /* ── Custom age pickers ─────────────────────────────────────── */

  function closeAllPickers() {
    document.querySelectorAll('.nm-picker.open')
            .forEach(el => el.classList.remove('open'));
    document.querySelectorAll('.nm-picker__panel.open')
            .forEach(el => el.classList.remove('open'));
  }

  function togglePicker(pickerId) {
    const picker = document.getElementById(pickerId);
    const panel  = document.getElementById(pickerId + '-panel');
    const wasOpen = panel.classList.contains('open');
    closeAllPickers();
    if (!wasOpen) {
      picker.classList.add('open');
      panel.classList.add('open');
      const sel = panel.querySelector('.selected');
      if (sel) sel.scrollIntoView({ block: 'center' });
    }
  }

  function setPickerValue(pickerId, value) {
    const picker = document.getElementById(pickerId);
    const panel  = document.getElementById(pickerId + '-panel');
    picker.dataset.value = value;
    picker.querySelector('.nm-picker__val').textContent = value;
    panel.querySelectorAll('.nm-picker__option').forEach(opt => {
      const match = parseInt(opt.dataset.value, 10) === value;
      opt.classList.toggle('selected', match);
      opt.setAttribute('aria-selected', match);
    });
  }

  function buildPicker(pickerId, count) {
    const panel = document.getElementById(pickerId + '-panel');

    panel.innerHTML =
      `<div class="nm-picker__list">` +
      Array.from({ length: count }, (_, i) =>
        `<div class="nm-picker__option${i === 0 ? ' selected' : ''}"
              data-value="${i}" role="option" aria-selected="${i === 0}">${i}</div>`
      ).join('') +
      `</div>`;

    panel.querySelectorAll('.nm-picker__option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        setPickerValue(pickerId, parseInt(opt.dataset.value, 10));
        closeAllPickers();
      });
    });

    document.getElementById(pickerId).addEventListener('click', (e) => {
      e.stopPropagation();
      togglePicker(pickerId);
    });
  }

  function initAgePickers() {
    buildPicker('picker-years',  51);
    buildPicker('picker-months', 12);
  }

  function resetPicker(pickerId) {
    setPickerValue(pickerId, 0);
    document.getElementById(pickerId).classList.remove('open');
    document.getElementById(pickerId + '-panel').classList.remove('open');
  }

  function openAddPlant() {
    pendingPhotoBase64  = null;
    pendingTagSelection = [];
    document.getElementById('photo-input').value               = '';
    document.getElementById('photo-placeholder').style.display = '';
    document.getElementById('photo-preview').style.display     = 'none';
    document.getElementById('photo-preview').src               = '';
    document.getElementById('field-common-name').value         = '';
    document.getElementById('field-species-name').value        = '';
    document.getElementById('add-plant-identified').style.display    = 'none';
    document.getElementById('add-plant-tags-grid').innerHTML         = '';
    document.getElementById('btn-retry-identification').style.display = 'none';
    resetPicker('picker-years');
    resetPicker('picker-months');
    setIdentifyStatus('');
    setAddPlantFieldsDisabled(false);
    showView('add-plant');
  }

  function setIdentifyStatus(msg, isError = false) {
    const el = document.getElementById('identify-status');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.toggle('visible', msg.length > 0);
  }

  function setAddPlantFieldsDisabled(disabled) {
    ['field-common-name', 'field-species-name', 'btn-save-plant', 'btn-cancel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
  }

  async function processAddPlantPhoto(file) {
    try {
      pendingPhotoBase64 = await compressImage(file);
    } catch {
      setIdentifyStatus('Could not load photo — try a different image', true);
      return;
    }
    document.getElementById('photo-placeholder').style.display = 'none';
    const preview = document.getElementById('photo-preview');
    preview.src           = pendingPhotoBase64;
    preview.style.display = 'block';

    setIdentifyStatus('Identifying plant\u2026');
    setAddPlantFieldsDisabled(true);

    let suggested = [];
    try {
      const { commonName, speciesName, suggestedTags } = await AI.identifyPlant(pendingPhotoBase64);
      document.getElementById('field-common-name').value  = commonName;
      document.getElementById('field-species-name').value = speciesName;
      suggested = suggestedTags || [];
      setIdentifyStatus('');
    } catch {
      setIdentifyStatus('Could not identify plant \u2014 please enter the name manually', true);
    } finally {
      setAddPlantFieldsDisabled(false);
    }

    pendingTagSelection = suggested;
    renderInlineTagPills();
    document.getElementById('add-plant-identified').style.display        = '';
    document.getElementById('btn-retry-identification').style.display    = '';
  }

  async function handleRetryIdentification() {
    if (!pendingPhotoBase64) return;
    const excludeName = document.getElementById('field-common-name').value.trim() || null;

    document.getElementById('add-plant-identified').style.display = 'none';
    setIdentifyStatus('Identifying…');
    setAddPlantFieldsDisabled(true);

    let suggested = [];
    try {
      const { commonName, speciesName, suggestedTags } = await AI.identifyPlant(pendingPhotoBase64, excludeName);
      document.getElementById('field-common-name').value  = commonName;
      document.getElementById('field-species-name').value = speciesName;
      suggested = suggestedTags || [];
      setIdentifyStatus('');
    } catch {
      setIdentifyStatus('Could not identify — please enter the name manually', true);
    } finally {
      setAddPlantFieldsDisabled(false);
    }

    pendingTagSelection = suggested;
    renderInlineTagPills();
    document.getElementById('add-plant-identified').style.display     = '';
    document.getElementById('btn-retry-identification').style.display = '';
  }

  async function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    await processAddPlantPhoto(file);
  }

  function handleSavePlant() {
    const commonName  = document.getElementById('field-common-name').value.trim();
    const speciesName = document.getElementById('field-species-name').value.trim();

    if (!commonName) {
      document.getElementById('field-common-name').focus();
      return;
    }

    const ageYears  = parseInt(document.getElementById('picker-years').dataset.value,  10) || 0;
    const ageMonths = parseInt(document.getElementById('picker-months').dataset.value, 10) || 0;

    try {
      Storage.savePlant({
        commonName,
        speciesName:     speciesName || 'Unknown Species',
        photoBase64:     pendingPhotoBase64,
        ageYears,
        ageMonths,
        ageIsKnown:      ageYears > 0 || ageMonths > 0,
        addedDate:       new Date().toISOString(),
        lastWatered:     null,
        lastHealthScore: null,
        lastAIUpdated:   null,
        tags:            pendingTagSelection,
      });
    } catch {
      showToast('Could not save — storage is full');
      return;
    }

    showView('my-plants');
    showToast('Plant added!');
  }

  /* ── Change Photo action sheet ─────────────────────────────── */

  function openChangePhotoSheet(onFileSelected) {
    changePhotoCallback = onFileSelected;
    document.getElementById('change-photo-sheet').classList.add('open');
    document.getElementById('change-photo-backdrop').classList.add('open');
  }

  function closeChangePhotoSheet() {
    document.getElementById('change-photo-sheet').classList.remove('open');
    document.getElementById('change-photo-backdrop').classList.remove('open');
    changePhotoCallback = null;
  }

  function handleChangePhotoFileSelected(e) {
    const cb = changePhotoCallback;   // capture before close nulls it
    closeChangePhotoSheet();
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (cb) cb(file);
  }

  /* ── Re-identify plant ──────────────────────────────────────── */

  async function handleReidentifyPlant() {
    openChangePhotoSheet(async (file) => {
      let compressed;
      try {
        compressed = await compressImage(file);
      } catch {
        showToast('Could not load photo — try a different image');
        return;
      }

      setAnalysisStatus('Identifying…');

      try {
        const { commonName, speciesName, suggestedTags } = await AI.identifyPlant(compressed);
        reidentifyPending = { photoBase64: compressed, commonName, speciesName, suggestedTags: suggestedTags || [] };
        setAnalysisStatus('');
        openReidentifySheet(reidentifyPending);
      } catch {
        setAnalysisStatus('');
        showToast('Could not identify — try again');
      }
    });
  }

  function openReidentifySheet(data) {
    document.getElementById('reidentify-preview').src           = data.photoBase64;
    document.getElementById('reidentify-common-name').value     = data.commonName;
    document.getElementById('reidentify-species-name').value    = data.speciesName;
    document.getElementById('reidentify-sheet').classList.add('open');
    document.getElementById('reidentify-backdrop').classList.add('open');
  }

  function closeReidentifySheet() {
    document.getElementById('reidentify-sheet').classList.remove('open');
    document.getElementById('reidentify-backdrop').classList.remove('open');
    reidentifyPending = null;
  }

  async function handleReidentifyRetry() {
    if (!reidentifyPending) return;
    const excludeName = document.getElementById('reidentify-common-name').value.trim() || null;
    const retryBtn    = document.getElementById('btn-reidentify-retry');
    retryBtn.disabled = true;
    retryBtn.textContent = 'Identifying…';

    try {
      const { commonName, speciesName, suggestedTags } = await AI.identifyPlant(reidentifyPending.photoBase64, excludeName);
      reidentifyPending = { ...reidentifyPending, commonName, speciesName, suggestedTags: suggestedTags || [] };
      document.getElementById('reidentify-common-name').value  = commonName;
      document.getElementById('reidentify-species-name').value = speciesName;
    } catch {
      showToast('Could not identify — try again');
    } finally {
      retryBtn.disabled    = false;
      retryBtn.textContent = 'Retry';
    }
  }

  function handleReidentifyConfirm() {
    if (!reidentifyPending) return;
    const commonName  = document.getElementById('reidentify-common-name').value.trim()  || reidentifyPending.commonName;
    const speciesName = document.getElementById('reidentify-species-name').value.trim() || reidentifyPending.speciesName;
    const { photoBase64, suggestedTags } = reidentifyPending;

    closeReidentifySheet();

    Storage.updatePlant(currentPlantId, { commonName, speciesName, photoBase64 });

    const bannerImg = document.getElementById('plant-banner-img');
    const banner    = document.getElementById('plant-banner');
    bannerImg.src        = photoBase64;
    banner.style.display = 'block';
    setTitle(commonName);
    renderPlantTags(currentPlantId);
    showToast('Plant updated');

    openTagPicker(suggestedTags, newTags => {
      Storage.updatePlant(currentPlantId, { tags: newTags });
      renderPlantTags(currentPlantId);
    });
  }

  /* ── Journal form ───────────────────────────────────────────── */

  function resetJournalForm() {
    TOGGLE_IDS.forEach(id => {
      const el = document.getElementById(id);
      el.dataset.on = 'false';
      el.classList.remove('on');
      el.setAttribute('aria-checked', 'false');
    });
    journalPhotoBase64 = null;
    document.getElementById('journal-photo-input').value               = '';
    document.getElementById('journal-photo-placeholder').style.display = '';
    const prev = document.getElementById('journal-photo-preview');
    prev.src           = '';
    prev.style.display = 'none';
    document.getElementById('journal-notes').value = '';
  }

  function openJournalEntry() {
    showView('journal');
  }

  /* ── Journal history ────────────────────────────────────────── */

  function renderEntryCard(entry) {
    const care = [
      entry.watered  && 'Watered',
      entry.fed      && 'Fed',
      entry.pruned   && 'Pruned',
      entry.repotted && 'Repotted',
    ].filter(Boolean);

    const careHtml = care.length
      ? `<div class="history-entry__care-tags">${care.map(a => `<span class="care-badge care-badge--${a.toLowerCase()}">${CARE_ICONS[a] ?? ''}${escapeHtml(a)}</span>`).join('')}</div>`
      : `<div class="history-entry__care-tags"><span class="history-entry__no-care">No care actions</span></div>`;

    const notesHtml = entry.notes
      ? `<p class="history-entry__notes">${escapeHtml(entry.notes)}</p>`
      : '';

    const photoHtml = entry.photoBase64
      ? `<img class="history-entry__photo" src="${entry.photoBase64}" alt="" onerror="this.style.display='none'" />`
      : '';

    return `
      <div class="history-entry nm-raised">
        <div class="history-entry__header">
          <span class="history-entry__time">${formatTimeAmPm(entry.timestamp)}</span>
        </div>
        ${photoHtml}
        ${notesHtml}
        ${careHtml}
      </div>`;
  }

  function renderHealthGraph(plantId) {
    const body    = document.getElementById('health-graph-body');
    const empty   = document.getElementById('health-graph-empty');
    const entries = Storage.getJournalEntries(plantId);

    // Only use entries that have a scored health value, newest-last for the timeline
    const scored = [...entries]
      .filter(e => e.healthScore != null)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-10);

    // Destroy previous chart instance so canvas can be reused
    if (healthChart) { healthChart.destroy(); healthChart = null; }

    if (scored.length === 0) {
      body.style.display  = 'none';
      empty.style.display = '';
      return;
    }

    body.style.display  = '';
    empty.style.display = 'none';

    const labels = scored.map(e =>
      new Date(e.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    );
    const scores = scored.map(e => e.healthScore);

    healthChart = new Chart(
      document.getElementById('health-graph-canvas'),
      {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data:            scores,
            borderColor:     '#7a9e76',
            backgroundColor: 'rgba(122, 158, 118, 0.15)',
            borderWidth:     2.5,
            pointBackgroundColor: '#4d6b49',
            pointRadius:     5,
            pointHoverRadius: 7,
            tension:         0.35,
            fill:            true,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: ctx => `Health: ${ctx.parsed.y} / 10`,
          }}},
          scales: {
            x: {
              grid:  { color: 'rgba(30,55,28,0.07)' },
              ticks: { color: '#7a8f78', font: { size: 11 } },
            },
            y: {
              min:   1,
              max:   10,
              ticks: { stepSize: 1, color: '#7a8f78', font: { size: 11 } },
              grid:  { color: 'rgba(30,55,28,0.07)' },
            },
          },
        },
      }
    );
  }

  function renderCareTips(plantId) {
    const entries = Storage.getJournalEntries(plantId);
    const content = document.getElementById('care-tips-content');
    const empty   = document.getElementById('care-tips-empty');

    const latest = [...entries]
      .filter(e => e.aiSnippets && e.aiSnippets.length > 0)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    if (!latest) {
      content.style.display = 'none';
      empty.style.display   = '';
      return;
    }

    content.style.display = '';
    empty.style.display   = 'none';

    const contextEl = document.getElementById('care-tips-context');
    const listEl    = document.getElementById('care-tips-list');
    const updatedEl = document.getElementById('care-tips-updated');

    const isNonPlant = latest.healthScore === null && latest.aiContext === null;

    if (isNonPlant) {
      contextEl.style.display = 'none';
      listEl.innerHTML = `<li style="list-style:none;padding-left:0;font-size:14px;color:#8a6d3b;font-style:italic;">${escapeHtml(latest.aiSnippets[0])}</li>`;
    } else {
      contextEl.style.display = '';
      contextEl.textContent = latest.aiContext || '';
      listEl.innerHTML = latest.aiSnippets.map(s => `<li>${escapeHtml(s)}</li>`).join('');
    }

    updatedEl.textContent =
      'Last updated: ' + formatSaveTimestamp(latest.timestamp).replace('Saved on ', '');
  }

  async function handleRefreshAnalysis() {
    const entries = Storage.getJournalEntries(currentPlantId);
    if (entries.length === 0) {
      showToast('No journal entries to analyse');
      return;
    }

    const plant      = Storage.getPlant(currentPlantId);
    const refreshBtn = document.getElementById('btn-refresh-analysis');
    const latest     = [...entries].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    )[0];

    setAnalysisStatus('Analysing plant\u2026');
    refreshBtn.disabled = true;

    try {
      const { healthScore, aiContext, snippets } = await AI.analyseJournal(plant, entries);
      Storage.updateJournalEntry(currentPlantId, latest.id, {
        healthScore,
        aiContext,
        aiSnippets: snippets,
      });
      Storage.updatePlant(currentPlantId, {
        lastHealthScore: healthScore,
        lastAIUpdated:   new Date().toISOString(),
      });
      renderHealthGraph(currentPlantId);
      renderCareTips(currentPlantId);
    } catch (err) {
      console.warn('Refresh failed:', err);
      showToast('Could not refresh \u2014 using last saved insights');
    } finally {
      setAnalysisStatus('');
      refreshBtn.disabled = false;
    }
  }

  function renderJournalHistory(plantId) {
    const container = document.getElementById('journal-history');
    const entries   = Storage.getJournalEntries(plantId);

    if (entries.length === 0) {
      container.innerHTML =
        '<p class="history-empty">No journal entries yet — start your first journal entry above</p>';
      return;
    }

    const latest = [...entries].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    )[0];

    container.innerHTML = `
      <div class="history-date-group">
        <h3 class="history-date-label">${escapeHtml(formatDateHeader(latest.timestamp))}</h3>
        ${renderEntryCard(latest)}
      </div>`;
  }

  /* ── Journal History page ───────────────────────────────────── */

  function renderJournalHistoryPage() {
    // Sync pill active states
    document.querySelectorAll('.jh-filter-pill').forEach(pill => {
      const on = pill.dataset.action === journalHistoryFilter;
      pill.classList.toggle('active', on);
      pill.setAttribute('aria-pressed', String(on));
    });

    const container = document.getElementById('jh-entries');
    let entries     = Storage.getJournalEntries(currentPlantId);

    if (journalHistoryFilter) {
      const key = journalHistoryFilter.toLowerCase();
      entries = entries.filter(e => e[key]);
    }

    if (entries.length === 0) {
      container.innerHTML = journalHistoryFilter
        ? '<p class="history-empty">No entries match this filter</p>'
        : '<p class="history-empty">No journal entries yet</p>';
      return;
    }

    const sorted = [...entries].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    const groups = [];
    const seen   = {};
    sorted.forEach(entry => {
      const dk = localDateKey(entry.timestamp);
      if (!seen[dk]) {
        seen[dk] = { label: formatDateHeader(entry.timestamp), entries: [] };
        groups.push(seen[dk]);
      }
      seen[dk].entries.push(entry);
    });

    container.innerHTML = groups.map(group => `
      <div class="history-date-group">
        <h3 class="history-date-label">${escapeHtml(group.label)}</h3>
        ${group.entries.map(renderEntryCard).join('')}
      </div>`
    ).join('');
  }

  function toggleJHFilter(action) {
    journalHistoryFilter = journalHistoryFilter === action ? null : action;
    renderJournalHistoryPage();
  }

  /* ── Photo Timeline ─────────────────────────────────────────── */

  function renderPhotoTimeline() {
    const container = document.getElementById('pt-items');
    const plant     = Storage.getPlant(currentPlantId);
    if (!plant) { container.innerHTML = ''; return; }

    const journalEntries = [...Storage.getJournalEntries(currentPlantId)]
      .filter(e => e.photoBase64)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const items = [
      { date: plant.addedDate, photo: plant.photoBase64, subtitle: 'Profile photo' },
      ...journalEntries.map(e => ({ date: e.timestamp, photo: e.photoBase64, subtitle: null })),
    ];

    container.innerHTML = items.map(item => {
      const subtitleHtml = item.subtitle
        ? `<p class="pt-subtitle">${escapeHtml(item.subtitle)}</p>`
        : '';

      return `
        <div class="pt-item">
          <p class="pt-date">${escapeHtml(formatDateHeader(item.date))}</p>
          <img class="pt-photo" src="${item.photo}" alt="" onerror="this.style.display='none'" />
          ${subtitleHtml}
        </div>`;
    }).join('');
  }

  async function handleJournalPhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      journalPhotoBase64 = await compressImage(file);
    } catch {
      showToast('Could not load photo — try a different image');
      return;
    }
    document.getElementById('journal-photo-placeholder').style.display = 'none';
    const preview = document.getElementById('journal-photo-preview');
    preview.src           = journalPhotoBase64;
    preview.style.display = 'block';
  }

  function setAnalysisStatus(msg) {
    const el = document.getElementById('analysis-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('visible', msg.length > 0);
  }

  async function handleSaveJournalEntry() {
    const hasAction = TOGGLE_IDS.some(id => document.getElementById(id).dataset.on === 'true');
    const hasNotes  = document.getElementById('journal-notes').value.trim() !== '';
    if (!hasAction && !hasNotes && journalPhotoBase64 === null) {
      showToast('Add a care action, photo, or note first');
      return;
    }

    const entry = {
      plantId:     currentPlantId,
      timestamp:   new Date().toISOString(),
      watered:     document.getElementById('toggle-watered').dataset.on  === 'true',
      fed:         document.getElementById('toggle-fed').dataset.on      === 'true',
      pruned:      document.getElementById('toggle-pruned').dataset.on   === 'true',
      repotted:    document.getElementById('toggle-repotted').dataset.on === 'true',
      photoBase64: journalPhotoBase64,
      notes:       document.getElementById('journal-notes').value.trim(),
      healthScore: null,
      aiSnippets:  null,
      aiContext:   null,
    };

    let saved;
    try {
      saved = Storage.saveJournalEntry(entry);
    } catch {
      showToast('Could not save — storage is full');
      return;
    }
    if (entry.watered) Storage.updatePlant(currentPlantId, { lastWatered: entry.timestamp });
    showToast('Saved');
    showView('plant');

    // Run analysis in the background — does not block navigation or history render
    setAnalysisStatus('Analysing plant\u2026');
    try {
      const plant   = Storage.getPlant(currentPlantId);
      const entries = Storage.getJournalEntries(currentPlantId);
      const { healthScore, aiContext, snippets } = await AI.analyseJournal(plant, entries);
      Storage.updateJournalEntry(currentPlantId, saved.id, {
        healthScore,
        aiContext,
        aiSnippets: snippets,
      });
      Storage.updatePlant(currentPlantId, {
        lastHealthScore: healthScore,
        lastAIUpdated:   new Date().toISOString(),
      });
      renderHealthGraph(currentPlantId);
      renderCareTips(currentPlantId);
    } catch (err) {
      console.warn('Journal analysis failed:', err);
      showToast('Saved — tap Refresh to generate insights');
    } finally {
      setAnalysisStatus('');
    }
  }

  /* ── Tag picker ─────────────────────────────────────────────── */

  function openTagPicker(preSelected, onSave) {
    pendingTagSelection = [...(preSelected || [])];
    tagPickerCallback   = onSave;
    document.getElementById('tag-picker-identified').style.display = 'none';
    renderTagPickerGrid();
    document.getElementById('tag-picker-sheet').classList.add('open');
    document.getElementById('tag-picker-backdrop').classList.add('open');
  }

  function closeTagPicker() {
    pendingTagSelection = [];
    document.getElementById('tag-picker-sheet').classList.remove('open');
    document.getElementById('tag-picker-backdrop').classList.remove('open');
    tagPickerCallback = null;
  }

  function handleTagPickerSave() {
    const cb   = tagPickerCallback;
    const tags = [...pendingTagSelection];
    closeTagPicker();
    if (cb) cb(tags);
  }

  function renderTagPickerGrid() {
    const grid = document.getElementById('tag-picker-grid');
    const full = pendingTagSelection.length >= 3;
    grid.innerHTML = PLANT_TAGS.map(tag => {
      const meta     = TAG_META[tag];
      const selected = pendingTagSelection.includes(tag);
      const dimmed   = !selected && full;
      return `<button class="tag-picker__pill${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}"
                data-tag="${escapeHtml(tag)}"
                style="${selected ? `background:${meta.color}` : ''}"
                type="button">${meta.icon}${escapeHtml(tag)}</button>`;
    }).join('');
  }

  function renderInlineTagPills() {
    const grid = document.getElementById('add-plant-tags-grid');
    const full = pendingTagSelection.length >= 3;
    grid.innerHTML = PLANT_TAGS.map(tag => {
      const meta     = TAG_META[tag];
      const selected = pendingTagSelection.includes(tag);
      const dimmed   = !selected && full;
      return `<button class="tag-picker__pill${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}"
                data-tag="${escapeHtml(tag)}"
                style="${selected ? `background:${meta.color}` : ''}"
                type="button">${meta.icon}${escapeHtml(tag)}</button>`;
    }).join('');
  }

  function toggleTagPickerPill(tag) {
    if (pendingTagSelection.includes(tag)) {
      pendingTagSelection = pendingTagSelection.filter(t => t !== tag);
    } else if (pendingTagSelection.length < 3) {
      pendingTagSelection = [...pendingTagSelection, tag];
    }
    renderTagPickerGrid();
  }

  /* ── Plant page tags ─────────────────────────────────────────── */

  function renderPlantTags(plantId) {
    const plant = Storage.getPlant(plantId);
    const pills = document.getElementById('plant-tags-pills');
    if (!plant) return;
    const tags = plant.tags && plant.tags.length > 0 ? plant.tags : [];

    const tagPills = tags.map(tag => {
      const meta = TAG_META[tag] || { color: '#888', icon: '' };
      return `<span class="plant-tag-pill" style="color:${meta.color}">${meta.icon}${escapeHtml(tag)}</span>`;
    }).join('');

    const addPill = tags.length < 3
      ? `<button class="plant-tag-add-pill" type="button">${tags.length === 0 ? '+ Add Tags' : '+'}</button>`
      : '';

    pills.innerHTML = tagPills + addPill;
    pills.style.opacity        = '';
    pills.style.pointerEvents  = '';
  }

  async function handleOpenTagPicker() {
    const plant = Storage.getPlant(currentPlantId);
    if (!plant) return;

    const pills = document.getElementById('plant-tags-pills');
    const tags  = plant.tags && plant.tags.length > 0 ? plant.tags : [];

    if (tags.length > 0) {
      openTagPicker(tags, newTags => {
        Storage.updatePlant(currentPlantId, { tags: newTags });
        renderPlantTags(currentPlantId);
      });
      return;
    }

    // Zero tags — fetch AI suggestions while dimming the row
    pills.style.opacity       = '0.5';
    pills.style.pointerEvents = 'none';
    const suggested = await AI.suggestTags(plant);
    pills.style.opacity       = '';
    pills.style.pointerEvents = '';

    openTagPicker(suggested, newTags => {
      Storage.updatePlant(currentPlantId, { tags: newTags });
      renderPlantTags(currentPlantId);
    });
  }

  /* ── API key handlers ──────────────────────────────────────── */

  function handleSaveApiKey() {
    const key = document.getElementById('field-api-key').value.trim();
    const err = document.getElementById('api-key-error');
    if (!key.startsWith('sk-ant-')) {
      err.textContent = 'Key must start with sk-ant-';
      return;
    }
    err.textContent = '';
    localStorage.setItem('plantCompanion_apiKey', key);
    showView('my-plants');
  }

  function openSettings() {
    const raw    = localStorage.getItem('plantCompanion_apiKey') || '';
    const masked = raw.length > 8
      ? raw.slice(0, 8) + '•'.repeat(Math.min(raw.length - 8, 20))
      : raw;
    document.getElementById('settings-key-display').textContent   = masked || '—';
    document.getElementById('settings-key-row').style.display     = '';
    document.getElementById('settings-new-key-row').style.display = 'none';
    document.getElementById('settings-key-input').value           = '';
    document.getElementById('btn-confirm-key').classList.remove('ready');
    document.getElementById('settings-sheet').classList.add('open');
    document.getElementById('settings-backdrop').classList.add('open');
  }

  function closeSettings() {
    document.getElementById('settings-sheet').classList.remove('open');
    document.getElementById('settings-backdrop').classList.remove('open');
    if (!localStorage.getItem('plantCompanion_apiKey')) {
      showView('my-plants');
    }
  }

  function handleDeleteSettingsKey() {
    localStorage.removeItem('plantCompanion_apiKey');
    document.getElementById('settings-key-row').style.display     = 'none';
    document.getElementById('settings-new-key-row').style.display = '';
    document.getElementById('settings-key-input').focus();
  }

  function handleConfirmSettingsKey() {
    const input = document.getElementById('settings-key-input');
    const key   = input.value.trim();
    if (!key.startsWith('sk-ant-')) {
      input.style.boxShadow = 'inset 4px 4px 10px rgba(176,90,58,0.35), inset -4px -4px 10px var(--shadow-light)';
      setTimeout(() => { input.style.boxShadow = ''; }, 900);
      return;
    }
    localStorage.setItem('plantCompanion_apiKey', key);
    const btn = document.getElementById('btn-confirm-key');
    btn.classList.add('success');
    setTimeout(() => {
      btn.classList.remove('success');
      closeSettings();
    }, 550);
  }

  function toggleApiKeyVisibility() {
    const field  = document.getElementById('field-api-key');
    const toggle = document.getElementById('btn-toggle-key-visibility');
    if (field.type === 'password') {
      field.type         = 'text';
      toggle.innerHTML   = CLOSED_EYE_SVG;
      toggle.setAttribute('aria-label', 'Hide API key');
    } else {
      field.type         = 'password';
      toggle.innerHTML   = OPEN_EYE_SVG;
      toggle.setAttribute('aria-label', 'Show API key');
    }
  }

  /* ── Toggle setup ───────────────────────────────────────────── */

  function setupToggles() {
    TOGGLE_IDS.forEach(id => {
      document.getElementById(id).addEventListener('click', () => {
        const el  = document.getElementById(id);
        const isOn = el.dataset.on === 'true';
        el.dataset.on = String(!isOn);
        el.classList.toggle('on', !isOn);
        el.setAttribute('aria-checked', String(!isOn));
      });
    });
  }

  function renderMarkdown(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/\n/g,             '<br>');
  }

  /* ── Chat tab ──────────────────────────────────────────────── */

  function switchPlantTab(tab) {
    activePlantTab = tab;
    const isCare = tab === 'care-tips';
    document.getElementById('tab-care-tips').classList.toggle('ct-tab--active',  isCare);
    document.getElementById('tab-chat').classList.toggle('ct-tab--active',       !isCare);
    document.getElementById('panel-care-tips').style.display = isCare  ? '' : 'none';
    document.getElementById('panel-chat').style.display      = !isCare ? '' : 'none';
    document.getElementById('care-tips-card').classList.toggle('chat-active', !isCare);
    if (!isCare) renderChatHistory(currentPlantId);
  }

  function buildBubbleWrap(role, content, timestamp) {
    const wrap   = document.createElement('div');
    wrap.className = `chat-bubble-wrap chat-bubble-wrap--${role}`;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble--${role}`;
    if (role === 'assistant') {
      bubble.innerHTML = renderMarkdown(content);
    } else {
      bubble.textContent = content;
    }

    const time   = document.createElement('p');
    time.className = 'chat-bubble__time';
    time.textContent = formatTimeAmPm(timestamp);

    wrap.appendChild(bubble);
    wrap.appendChild(time);
    return wrap;
  }

  function renderChatHistory(plantId) {
    const messages  = Storage.getChatMessages(plantId);
    const container = document.getElementById('chat-messages');
    const earlier   = document.getElementById('chat-earlier');

    container.querySelectorAll('.chat-bubble-wrap').forEach(el => el.remove());
    messages.forEach(msg => container.appendChild(buildBubbleWrap(msg.role, msg.content, msg.timestamp)));

    earlier.style.display = container.scrollHeight > container.clientHeight + 1 ? '' : 'none';
    container.scrollTop   = container.scrollHeight;
  }

  function showTypingIndicator() {
    const container = document.getElementById('chat-messages');
    const wrap      = document.createElement('div');
    wrap.className  = 'chat-bubble-wrap chat-bubble-wrap--assistant';
    wrap.id         = 'chat-typing-wrap';

    const bubble    = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble--assistant chat-typing';
    bubble.innerHTML = '<span class="chat-dots"><span></span><span></span><span></span></span>';

    wrap.appendChild(bubble);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById('chat-typing-wrap');
    if (el) el.remove();
  }

  async function handleChatSend() {
    const input   = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const text    = input.value.trim();
    if (!text) return;

    const plant = Storage.getPlant(currentPlantId);
    if (!plant) return;

    input.disabled   = true;
    sendBtn.disabled = true;
    input.value      = '';

    const userTimestamp = new Date().toISOString();
    const container     = document.getElementById('chat-messages');
    container.appendChild(buildBubbleWrap('user', text, userTimestamp));
    container.scrollTop = container.scrollHeight;

    showTypingIndicator();

    try {
      const history   = Storage.getChatMessages(currentPlantId);
      const response  = await AI.chatWithPlant(plant, history, text, Storage.getJournalEntries(currentPlantId));

      removeTypingIndicator();

      const assistantTimestamp = new Date().toISOString();
      container.appendChild(buildBubbleWrap('assistant', response, assistantTimestamp));
      container.scrollTop = container.scrollHeight;

      Storage.saveChatMessage(currentPlantId, {
        id: Storage.generateId(), role: 'user', content: text, timestamp: userTimestamp,
      });
      Storage.saveChatMessage(currentPlantId, {
        id: Storage.generateId(), role: 'assistant', content: response, timestamp: assistantTimestamp,
      });

    } catch {
      removeTypingIndicator();
      showToast("Couldn't send — check your connection");
    }

    input.disabled   = false;
    sendBtn.disabled = false;
    input.focus();
  }

  /* ── Init ───────────────────────────────────────────────────── */

  function init() {
    $title      = document.getElementById('app-title');
    $backBtn    = document.getElementById('back-btn');
    $fabAnchor  = document.getElementById('fab-anchor');
    $toast      = document.getElementById('toast');
    $plantList  = document.getElementById('plant-list');
    $gearBtn    = document.getElementById('btn-settings');

    initAgePickers();
    setupToggles();

    // Close any open picker when tapping outside one
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nm-picker-wrap')) closeAllPickers();
    });

    // Back button — returns to the context-appropriate view
    $backBtn.addEventListener('click', () => showView(backDest));

    // Home screen
    document.getElementById('btn-get-started')
            .addEventListener('click', openAddPlant);

    // Add Plant flow
    document.getElementById('fab-add')
            .addEventListener('click', openAddPlant);
    document.getElementById('btn-cancel')
            .addEventListener('click', () => showView('my-plants'));
    document.getElementById('btn-save-plant')
            .addEventListener('click', handleSavePlant);

    // Plant page
    document.getElementById('btn-open-journal')
            .addEventListener('click', openJournalEntry);
    document.getElementById('btn-refresh-analysis')
            .addEventListener('click', handleRefreshAnalysis);

    // Journal form
    document.getElementById('btn-journal-save')
            .addEventListener('click', handleSaveJournalEntry);
    document.getElementById('btn-journal-cancel')
            .addEventListener('click', () => showView('plant'));
    document.getElementById('journal-photo-area')
            .addEventListener('click', () => {
              openChangePhotoSheet(async (file) => {
                const preview     = document.getElementById('journal-photo-preview');
                const placeholder = document.getElementById('journal-photo-placeholder');
                journalPhotoBase64 = null;
                preview.style.display     = 'none';
                placeholder.style.display = '';
                try {
                  journalPhotoBase64    = await compressImage(file);
                  preview.src           = journalPhotoBase64;
                  preview.style.display = 'block';
                  placeholder.style.display = 'none';
                } catch {
                  showToast('Could not load photo — try a different image');
                }
              });
            });

    // Settings
    $gearBtn.addEventListener('click', openSettings);
    document.getElementById('settings-backdrop')
            .addEventListener('click', closeSettings);
    document.getElementById('btn-delete-key')
            .addEventListener('click', handleDeleteSettingsKey);
    document.getElementById('btn-confirm-key')
            .addEventListener('click', handleConfirmSettingsKey);
    document.getElementById('settings-key-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleConfirmSettingsKey();
    });
    document.getElementById('settings-key-input').addEventListener('input', (e) => {
      document.getElementById('btn-confirm-key').classList.toggle(
        'ready', e.target.value.trim().startsWith('sk-ant-')
      );
    });

    // Plant page — Care Tips / Chat tabs
    document.getElementById('tab-care-tips')
            .addEventListener('click', () => switchPlantTab('care-tips'));
    document.getElementById('tab-chat')
            .addEventListener('click', () => switchPlantTab('chat'));

    // Chat — send on button click or Enter key
    document.getElementById('chat-send-btn')
            .addEventListener('click', handleChatSend);
    document.getElementById('chat-input')
            .addEventListener('keydown', e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
            });

    // Leaf send button icon (Lucide leaf)
    document.getElementById('chat-send-btn').innerHTML =
      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>` +
      `<path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>` +
      `</svg>`;

    // Plant page — View Journal History
    document.getElementById('btn-view-history')
            .addEventListener('click', () => showView('journal-history'));

    // Plant page — banner gallery icon → photo timeline
    document.getElementById('btn-banner-gallery')
            .addEventListener('click', () => showView('photo-timeline', { plantId: currentPlantId, from: 'plant' }));

    // Journal History page — Photo Timeline button
    document.getElementById('btn-photo-timeline')
            .addEventListener('click', () => showView('photo-timeline', { plantId: currentPlantId, from: 'journal-history' }));

    // Journal History page — care-action filter pills
    document.querySelectorAll('.jh-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => toggleJHFilter(pill.dataset.action));
    });

    // Delete plant sheet
    document.getElementById('delete-backdrop')
            .addEventListener('click', closeDeleteSheet);
    document.getElementById('btn-delete-cancel')
            .addEventListener('click', closeDeleteSheet);
    document.getElementById('btn-delete-confirm')
            .addEventListener('click', handleDeletePlant);

    // Tag picker sheet
    document.getElementById('tag-picker-backdrop')
            .addEventListener('click', closeTagPicker);
    document.getElementById('btn-tag-skip')
            .addEventListener('click', closeTagPicker);
    document.getElementById('btn-tag-save')
            .addEventListener('click', handleTagPickerSave);
    document.getElementById('btn-tag-retry')
            .addEventListener('click', handleRetryIdentification);
    document.getElementById('tag-picker-grid')
            .addEventListener('click', e => {
              const pill = e.target.closest('.tag-picker__pill');
              if (pill && !pill.classList.contains('dimmed')) toggleTagPickerPill(pill.dataset.tag);
            });

    // Add Plant — inline tag grid
    document.getElementById('btn-retry-identification')
            .addEventListener('click', handleRetryIdentification);
    document.getElementById('add-plant-tags-grid')
            .addEventListener('click', e => {
              const pill = e.target.closest('.tag-picker__pill');
              if (!pill || pill.classList.contains('dimmed')) return;
              const tag = pill.dataset.tag;
              if (pendingTagSelection.includes(tag)) {
                pendingTagSelection = pendingTagSelection.filter(t => t !== tag);
              } else if (pendingTagSelection.length < 3) {
                pendingTagSelection = [...pendingTagSelection, tag];
              }
              renderInlineTagPills();
            });

    // My Plants tag filter bar (delegated)
    document.getElementById('mp-tag-filter-scroll')
            .addEventListener('click', e => {
              const pill = e.target.closest('.mp-filter-pill');
              if (pill) toggleMyPlantsFilter(pill.dataset.tag);
            });

    // Plant page — tag row click opens picker
    document.getElementById('plant-tags-pills')
            .addEventListener('click', handleOpenTagPicker);

    // Add Plant — tapping anywhere in the upload area opens Change Photo sheet
    document.getElementById('photo-upload-area')
            .addEventListener('click', () => {
              openChangePhotoSheet(async (file) => {
                pendingTagSelection = [];
                document.getElementById('field-common-name').value  = '';
                document.getElementById('field-species-name').value = '';
                await processAddPlantPhoto(file);
              });
            });

    // Change Photo action sheet
    document.getElementById('change-photo-backdrop')
            .addEventListener('click', closeChangePhotoSheet);
    document.getElementById('btn-change-photo-cancel')
            .addEventListener('click', closeChangePhotoSheet);
    document.getElementById('change-photo-input-camera')
            .addEventListener('change', handleChangePhotoFileSelected);
    document.getElementById('change-photo-input-gallery')
            .addEventListener('change', handleChangePhotoFileSelected);

    // Plant page — tapping banner photo or camera overlay opens re-identify flow
    document.getElementById('plant-banner-img')
            .addEventListener('click', handleReidentifyPlant);
    document.getElementById('btn-banner-camera')
            .addEventListener('click', (e) => { e.stopPropagation(); handleReidentifyPlant(); });

    // Re-identify confirmation sheet
    document.getElementById('reidentify-backdrop')
            .addEventListener('click', closeReidentifySheet);
    document.getElementById('btn-reidentify-cancel')
            .addEventListener('click', closeReidentifySheet);
    document.getElementById('btn-reidentify-retry')
            .addEventListener('click', handleReidentifyRetry);
    document.getElementById('btn-reidentify-confirm')
            .addEventListener('click', handleReidentifyConfirm);

    // Onboarding
    document.getElementById('btn-save-api-key')
            .addEventListener('click', handleSaveApiKey);
    document.getElementById('btn-toggle-key-visibility')
            .addEventListener('click', toggleApiKeyVisibility);
    document.getElementById('field-api-key').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSaveApiKey();
    });
    document.getElementById('field-api-key').addEventListener('input', () => {
      document.getElementById('api-key-error').textContent = '';
    });

    showView('my-plants');

    document.fonts.ready.then(() => {
      const inner = $title.querySelector('.app-title__inner');
      if (inner) setTitle(inner.textContent);
    });
  }

  return { init, showToast };

})();

document.addEventListener('DOMContentLoaded', UI.init);
