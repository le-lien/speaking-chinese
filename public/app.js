const state = {
  cards: [],
  currentIndex: 0,
  shuffleMode: false,
  shuffleOrder: [],
  shufflePosition: 0,
  shuffleMatchCards: [],
  flipped: false,
  mode: "flashcard",
  exercise: "matching",
  collapsedSeries: new Set(),
  collapsedUnits: new Set(),
  selectedChinese: null,
  selectedEnglish: null,
  matchedIds: new Set(),
  answer: [],
  bank: null,
  unscrambleMessage: "",
  unscrambleGood: false,
  recorder: null,
  chunks: [],
};

const isStaticSite = Boolean(window.STATIC_CARDS);

const els = {
  seriesList: document.querySelector("#seriesList"),
  shuffleMode: document.querySelector("#shuffleMode"),
  flashcardMode: document.querySelector("#flashcardMode"),
  exerciseMode: document.querySelector("#exerciseMode"),
  flashcardPanel: document.querySelector("#flashcardPanel"),
  exercisePanel: document.querySelector("#exercisePanel"),
  flashcard: document.querySelector("#flashcard"),
  cardText: document.querySelector("#cardText"),
  cardLanguage: document.querySelector("#cardLanguage"),
  flipCard: document.querySelector("#flipCard"),
  previousCard: document.querySelector("#previousCard"),
  nextCard: document.querySelector("#nextCard"),
  shuffleBadge: document.querySelector("#shuffleBadge"),
  positionText: document.querySelector("#positionText"),
  player: document.querySelector("#player"),
  speedSelect: document.querySelector("#speedSelect"),
  matchingTab: document.querySelector("#matchingTab"),
  unscrambleTab: document.querySelector("#unscrambleTab"),
  matchingExercise: document.querySelector("#matchingExercise"),
  unscrambleExercise: document.querySelector("#unscrambleExercise"),
  matchChinese: document.querySelector("#matchChinese"),
  matchEnglish: document.querySelector("#matchEnglish"),
  matchFeedback: document.querySelector("#matchFeedback"),
  playUnscramble: document.querySelector("#playUnscramble"),
  resetUnscramble: document.querySelector("#resetUnscramble"),
  answerSlots: document.querySelector("#answerSlots"),
  characterBank: document.querySelector("#characterBank"),
  unscrambleFeedback: document.querySelector("#unscrambleFeedback"),
  recordButton: document.querySelector("#recordButton"),
  stopRecordButton: document.querySelector("#stopRecordButton"),
  recordingStatus: document.querySelector("#recordingStatus"),
  recordingList: document.querySelector("#recordingList"),
};

function currentCard() {
  return state.cards[state.currentIndex];
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function makeShuffleOrder(startIndex = state.currentIndex) {
  const indexes = state.cards.map((_, index) => index);
  const rest = shuffle(indexes.filter((index) => index !== startIndex));
  state.shuffleOrder = [startIndex, ...rest];
  state.shufflePosition = 0;
  state.currentIndex = startIndex;
}

function setActiveMode(mode) {
  state.mode = mode;
  els.flashcardMode.classList.toggle("active", mode === "flashcard");
  els.exerciseMode.classList.toggle("active", mode === "exercise");
  els.flashcardPanel.hidden = mode !== "flashcard";
  els.exercisePanel.hidden = mode !== "exercise";
  if (mode === "exercise") renderExercise();
}

function setExercise(type) {
  state.exercise = type;
  if (type === "matching") resetMatchingRound();
  els.matchingTab.classList.toggle("active", type === "matching");
  els.unscrambleTab.classList.toggle("active", type === "unscramble");
  els.matchingExercise.hidden = type !== "matching";
  els.unscrambleExercise.hidden = type !== "unscramble";
  renderExercise();
}

function playChineseAudio() {
  const card = currentCard();
  playCardChineseAudio(card);
}

function playCardChineseAudio(card) {
  if (!card) return;
  els.player.src = `${card.audio.cn}?v=${Date.now()}`;
  els.player.playbackRate = Number(els.speedSelect.value);
  els.player.play();
}

function selectCard(index) {
  state.currentIndex = Math.max(0, Math.min(index, state.cards.length - 1));
  state.shuffleMode = false;
  state.flipped = false;
  state.matchedIds = new Set();
  state.shuffleMatchCards = [];
  state.selectedChinese = null;
  state.selectedEnglish = null;
  state.answer = [];
  state.bank = null;
  state.unscrambleMessage = "";
  state.unscrambleGood = false;
  focusCurrentUnitOnly();
  render();
}

function selectShuffleCard(index) {
  state.currentIndex = Math.max(0, Math.min(index, state.cards.length - 1));
  state.flipped = false;
  state.matchedIds = new Set();
  state.shuffleMatchCards = [];
  state.selectedChinese = null;
  state.selectedEnglish = null;
  state.answer = [];
  state.bank = null;
  state.unscrambleMessage = "";
  state.unscrambleGood = false;
  focusCurrentUnitOnly();
  render();
}

function toggleShuffleMode() {
  state.shuffleMode = !state.shuffleMode;
  if (state.shuffleMode) {
    makeShuffleOrder();
  }
  focusCurrentUnitOnly();
  state.matchedIds = new Set();
  state.shuffleMatchCards = [];
  render();
}

function resetMatchingRound() {
  state.matchedIds = new Set();
  state.selectedChinese = null;
  state.selectedEnglish = null;
  state.shuffleMatchCards = [];
}

function moveCard(direction) {
  if (!state.cards.length) return;
  if (state.shuffleMode) {
    if (!state.shuffleOrder.length) makeShuffleOrder();
    state.shufflePosition += direction;
    if (state.shufflePosition >= state.shuffleOrder.length) {
      makeShuffleOrder();
    } else if (state.shufflePosition < 0) {
      state.shufflePosition = state.shuffleOrder.length - 1;
    }
    selectShuffleCard(state.shuffleOrder[state.shufflePosition]);
    return;
  }
  selectCard(state.currentIndex + direction);
}

function renderSeriesList() {
  const grouped = new Map();
  for (const card of state.cards) {
    const seriesKey = `Series ${card.series}`;
    const unitKey = `Unit ${card.unit}`;
    if (!grouped.has(seriesKey)) grouped.set(seriesKey, new Map());
    if (!grouped.get(seriesKey).has(unitKey)) grouped.get(seriesKey).set(unitKey, []);
    grouped.get(seriesKey).get(unitKey).push(card);
  }

  els.seriesList.innerHTML = "";
  for (const [series, units] of grouped) {
    const seriesEl = document.createElement("div");
    seriesEl.className = "series-group";
    const seriesCollapsed = false;
    const seriesHeader = document.createElement("div");
    seriesHeader.className = "nav-heading series-title";
    seriesHeader.appendChild(toggleButton(seriesCollapsed, `${series} visibility`, () => {
      toggleSetValue(state.collapsedSeries, series);
      renderSeriesList();
      renderCard();
    }));
    seriesHeader.appendChild(document.createTextNode(series));
    seriesEl.appendChild(seriesHeader);

    const unitsEl = document.createElement("div");
    unitsEl.className = "series-content";
    unitsEl.hidden = seriesCollapsed;

    for (const [unit, cards] of units) {
      const unitKey = `${series}:${unit}`;
      const unitCollapsed = unitKey !== currentUnitKey();
      const unitEl = document.createElement("div");
      unitEl.className = "unit-group";
      const unitHeader = document.createElement("div");
      unitHeader.className = "nav-heading unit-title";
      unitHeader.appendChild(toggleButton(unitCollapsed, `${series} ${unit} visibility`, () => {
        selectCard(state.cards.findIndex((item) => item.id === cards[0].id));
      }));
      unitHeader.appendChild(document.createTextNode(unit));
      unitEl.appendChild(unitHeader);

      const sentenceList = document.createElement("div");
      sentenceList.className = "sentence-list";
      sentenceList.hidden = unitCollapsed;
      for (const card of cards) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sentence-button";
        button.textContent = `${card.sentence}. ${card.cn}`;
        button.dataset.id = card.id;
        button.addEventListener("click", () => selectCard(state.cards.findIndex((item) => item.id === card.id)));
        sentenceList.appendChild(button);
      }
      unitEl.appendChild(sentenceList);
      unitsEl.appendChild(unitEl);
    }

    seriesEl.appendChild(unitsEl);
    els.seriesList.appendChild(seriesEl);
  }
}

function toggleButton(collapsed, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-toggle";
  button.textContent = collapsed ? "›" : "⌄";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", String(!collapsed));
  button.addEventListener("click", onClick);
  return button;
}

function toggleSetValue(set, value) {
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
}

function collapseAllUnits() {
  state.collapsedUnits = new Set(
    state.cards.map((card) => `Series ${card.series}:Unit ${card.unit}`)
  );
}

function currentUnitKey() {
  const card = currentCard();
  return card ? `Series ${card.series}:Unit ${card.unit}` : "";
}

function focusCurrentUnitOnly() {
  collapseAllUnits();
  const key = currentUnitKey();
  if (key) state.collapsedUnits.delete(key);
  renderSeriesList();
}

function renderCard() {
  const card = currentCard();
  if (!card) {
    els.cardText.textContent = "No cards found";
    return;
  }
  els.cardText.textContent = state.flipped ? card.en || "English text not added yet" : card.cn;
  els.cardLanguage.textContent = "";
  els.flashcard.classList.toggle("english", state.flipped);
  els.positionText.textContent = state.shuffleMode
    ? `${state.shufflePosition + 1} / ${state.shuffleOrder.length || state.cards.length}`
    : `${state.currentIndex + 1} / ${state.cards.length}`;
  els.shuffleBadge.hidden = !state.shuffleMode;
  els.player.src = card.audio.cn;
  els.shuffleMode.classList.toggle("active", state.shuffleMode);
  els.shuffleMode.setAttribute("aria-pressed", String(state.shuffleMode));
  document.body.classList.toggle("shuffle-active", state.shuffleMode);

  document.querySelectorAll(".sentence-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.id === card.id);
  });
}

function renderExercise() {
  if (state.exercise === "matching") renderMatching();
  if (state.exercise === "unscramble") renderUnscramble();
}

function renderMatching() {
  const unitCards = state.shuffleMode ? getShuffleMatchCards() : state.cards.filter((card) => {
    const active = currentCard();
    return active && card.series === active.series && card.unit === active.unit;
  });
  const matchableCards = unitCards.filter((card) => card.cn && card.en);
  const chineseCards = unitCards;
  const englishCards = shuffle(matchableCards);
  els.matchChinese.innerHTML = "";
  els.matchEnglish.innerHTML = "";
  els.matchFeedback.textContent = "";
  els.matchFeedback.className = "feedback";

  if (!matchableCards.length) {
    els.matchFeedback.textContent = "English text has not been added for these cards yet.";
    return;
  }

  for (const card of chineseCards.filter((card) => card.en)) {
    els.matchChinese.appendChild(matchButton(card, "cn"));
  }
  for (const card of englishCards) {
    els.matchEnglish.appendChild(matchButton(card, "en"));
  }
}

function getShuffleMatchCards() {
  if (!state.shuffleMatchCards.length) {
    state.shuffleMatchCards = shuffle(state.cards.filter((card) => card.cn && card.en)).slice(0, 10);
  }
  return state.shuffleMatchCards;
}

function matchButton(card, language) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "match-choice";
  button.textContent = language === "cn" ? card.cn : card.en;
  button.disabled = state.matchedIds.has(card.id);
  if (button.disabled) button.classList.add("correct");
  button.addEventListener("click", () => {
    playCardChineseAudio(card);
    if (language === "cn") state.selectedChinese = card;
    if (language === "en") state.selectedEnglish = card;
    checkMatch();
    updateMatchSelection();
  });
  button.dataset.id = card.id;
  button.dataset.language = language;
  return button;
}

function updateMatchSelection() {
  document.querySelectorAll(".match-choice").forEach((button) => {
    const selected =
      (button.dataset.language === "cn" && state.selectedChinese?.id === button.dataset.id) ||
      (button.dataset.language === "en" && state.selectedEnglish?.id === button.dataset.id);
    button.classList.toggle("selected", selected);
  });
}

function checkMatch() {
  if (!state.selectedChinese || !state.selectedEnglish) return;
  const correct = state.selectedChinese.id === state.selectedEnglish.id;
  els.matchFeedback.textContent = correct ? "Correct" : "Try again";
  els.matchFeedback.className = `feedback ${correct ? "good" : "bad"}`;
  if (correct) state.matchedIds.add(state.selectedChinese.id);
  state.selectedChinese = null;
  state.selectedEnglish = null;
  setTimeout(renderMatching, 350);
}

function renderUnscramble() {
  const card = currentCard();
  if (!card) return;
  const characters = [...card.cn].filter((character) => character.trim());
  if (!state.answer.length) {
    state.bank = shuffle(characters.map((character, index) => ({ character, index })));
  }

  els.answerSlots.innerHTML = "";
  els.characterBank.innerHTML = "";
  els.unscrambleFeedback.textContent = state.unscrambleMessage;
  els.unscrambleFeedback.className = `feedback ${state.unscrambleMessage ? (state.unscrambleGood ? "good" : "bad") : ""}`;

  characters.forEach((_, index) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "slot";
    slot.textContent = state.answer[index]?.character || "·";
    slot.addEventListener("click", () => {
      state.answer.splice(index, 1);
      renderUnscramble();
    });
    els.answerSlots.appendChild(slot);
  });

  for (const item of state.bank || []) {
    const used = state.answer.some((answer) => answer.index === item.index);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "character-chip";
    chip.textContent = item.character;
    chip.disabled = used;
    chip.addEventListener("click", () => {
      state.answer.push(item);
      checkUnscramble();
      renderUnscramble();
    });
    els.characterBank.appendChild(chip);
  }
}

function checkUnscramble() {
  const card = currentCard();
  const target = [...card.cn].filter((character) => character.trim()).join("");
  const answer = state.answer.map((item) => item.character).join("");
  if (answer.length !== target.length) return;
  const correct = answer === target;
  state.unscrambleMessage = correct ? "Correct" : `Try again: ${card.cn}`;
  state.unscrambleGood = correct;
}

function resetUnscramble() {
  state.answer = [];
  state.bank = null;
  state.unscrambleMessage = "";
  state.unscrambleGood = false;
  renderUnscramble();
}

async function loadRecordings() {
  if (isStaticSite) {
    els.recordingStatus.textContent = "Recordings are available in the local server version.";
    els.recordButton.disabled = true;
    els.stopRecordButton.disabled = true;
    return;
  }
  const response = await fetch("/api/recordings");
  const data = await response.json();
  els.recordingList.innerHTML = "";
  for (const recording of data.recordings) {
    const item = document.createElement("div");
    item.className = "recording-item";
    const input = document.createElement("input");
    input.value = recording.title;
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = `/recordings/${recording.filename}`;
    const row = document.createElement("div");
    row.className = "recording-row";
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "secondary-button";
    rename.textContent = "Rename";
    rename.addEventListener("click", async () => {
      await fetch(`/api/recordings/${recording.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.value }),
      });
      loadRecordings();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      await fetch(`/api/recordings/${recording.id}`, { method: "DELETE" });
      loadRecordings();
    });
    row.append(rename, remove);
    item.append(input, audio, row);
    els.recordingList.appendChild(item);
  }
}

async function startRecording() {
  if (isStaticSite) {
    els.recordingStatus.textContent = "Recordings are available in the local server version.";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    els.recordingStatus.textContent = "Recording is not available in this browser.";
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.chunks = [];
  state.recorder = new MediaRecorder(stream);
  state.recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) state.chunks.push(event.data);
  });
  state.recorder.addEventListener("stop", saveRecording);
  state.recorder.start();
  els.recordButton.disabled = true;
  els.stopRecordButton.disabled = false;
  els.recordingStatus.textContent = "Recording...";
}

async function saveRecording() {
  const blob = new Blob(state.chunks, { type: "audio/webm" });
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  const card = currentCard();
  await fetch("/api/recordings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `${card.id} recording`,
      cardId: card.id,
      audio: dataUrl,
    }),
  });
  state.recorder.stream.getTracks().forEach((track) => track.stop());
  els.recordButton.disabled = false;
  els.stopRecordButton.disabled = true;
  els.recordingStatus.textContent = "Saved";
  loadRecordings();
}

function render() {
  renderCard();
  renderExercise();
}

async function init() {
  if (isStaticSite) {
    state.cards = window.STATIC_CARDS;
  } else {
    const response = await fetch("/api/cards");
    const data = await response.json();
    state.cards = data.cards;
  }
  focusCurrentUnitOnly();
  render();
  loadRecordings();
}

els.flashcard.addEventListener("click", playChineseAudio);
els.flipCard.addEventListener("click", () => {
  state.flipped = !state.flipped;
  renderCard();
});
els.shuffleMode.addEventListener("click", toggleShuffleMode);
els.previousCard.addEventListener("click", () => moveCard(-1));
els.nextCard.addEventListener("click", () => moveCard(1));
els.flashcardMode.addEventListener("click", () => setActiveMode("flashcard"));
els.exerciseMode.addEventListener("click", () => setActiveMode("exercise"));
els.matchingTab.addEventListener("click", () => setExercise("matching"));
els.unscrambleTab.addEventListener("click", () => setExercise("unscramble"));
els.playUnscramble.addEventListener("click", playChineseAudio);
els.resetUnscramble.addEventListener("click", resetUnscramble);
els.speedSelect.addEventListener("change", () => {
  els.player.playbackRate = Number(els.speedSelect.value);
});
els.recordButton.addEventListener("click", startRecording);
els.stopRecordButton.addEventListener("click", () => state.recorder?.stop());

init();
