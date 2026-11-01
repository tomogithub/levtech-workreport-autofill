const form = document.querySelector("#settingsForm");
const pageStatus = document.querySelector("#pageStatus");
const result = document.querySelector("#result");
const applyButton = document.querySelector("#applyButton");

const fields = {
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime"),
  breakTime: document.querySelector("#breakTime"),
  workContent: document.querySelector("#workContent"),
  weekdaysOnly: document.querySelector("#weekdaysOnly"),
  overwrite: document.querySelector("#overwrite")
};

const defaults = {
  startTime: "10:00",
  endTime: "19:00",
  breakTime: "01:00",
  workContent: "開発業務",
  weekdaysOnly: true,
  overwrite: false
};

document.addEventListener("DOMContentLoaded", init);
form.addEventListener("submit", applyValues);

async function init() {
  const settings = await chrome.storage.local.get(defaults);
  setFormValues(settings);
  await refreshStatus();
}

async function refreshStatus() {
  try {
    const tab = await getActiveTab();
    const status = await chrome.tabs.sendMessage(tab.id, { type: "GET_REPORT_STATUS" });

    if (!status?.ok) {
      setUnavailable("作業報告の詳細画面（/p/work-report/…）で開いてください。ページを再読み込みすると認識される場合があります。");
      return;
    }

    pageStatus.textContent = `${status.month || "作業報告書"} / ${status.workdays}営業日（土日祝除く） / 入力済み${status.filledRows}日`;
    applyButton.disabled = false;
  } catch {
    setUnavailable("作業報告の詳細画面（/p/work-report/…）で開いてください。ページを再読み込みすると認識される場合があります。");
  }
}

async function applyValues(event) {
  event.preventDefault();
  clearError();

  const settings = getFormValues();
  const validation = validateSettings(settings);
  if (!validation.ok) {
    showError(validation.message);
    return;
  }

  applyButton.disabled = true;
  result.textContent = "入力中...";

  try {
    await chrome.storage.local.set(settings);
    const tab = await getActiveTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "APPLY_WORKREPORT_VALUES",
      settings
    });

    if (!response?.ok) {
      throw new Error(response?.error || "入力できませんでした。");
    }

    result.textContent = `${response.changed}日分を入力しました。スキップ: ${response.skipped}日`;
    await refreshStatus();
  } catch (error) {
    showError(error.message || "入力できませんでした。");
  } finally {
    applyButton.disabled = false;
  }
}

function setFormValues(settings) {
  fields.startTime.value = settings.startTime;
  fields.endTime.value = settings.endTime;
  fields.breakTime.value = settings.breakTime;
  fields.workContent.value = settings.workContent;
  fields.weekdaysOnly.checked = settings.weekdaysOnly;
  fields.overwrite.checked = settings.overwrite;
}

function getFormValues() {
  return {
    startTime: normalizeTimeText(fields.startTime.value),
    endTime: normalizeTimeText(fields.endTime.value),
    breakTime: normalizeTimeText(fields.breakTime.value),
    workContent: fields.workContent.value.trim(),
    weekdaysOnly: fields.weekdaysOnly.checked,
    overwrite: fields.overwrite.checked
  };
}

function validateSettings(settings) {
  for (const [key, label] of [
    ["startTime", "開始時間"],
    ["endTime", "終了時間"],
    ["breakTime", "休憩時間"]
  ]) {
    if (!isValidTime(settings[key])) {
      return { ok: false, message: `${label}は 10:00 のように入力してください。` };
    }
  }

  if (toMinutes(settings.endTime) <= toMinutes(settings.startTime)) {
    return { ok: false, message: "終了時間は開始時間より後にしてください。" };
  }

  if (toMinutes(settings.breakTime) >= toMinutes(settings.endTime) - toMinutes(settings.startTime)) {
    return { ok: false, message: "休憩時間が勤務時間以上になっています。" };
  }

  if (!settings.workContent) {
    return { ok: false, message: "作業内容を入力してください。" };
  }

  return { ok: true };
}

function normalizeTimeText(value) {
  return String(value || "").trim().replace(/[：]/g, ":");
}

function isValidTime(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function toMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("現在のタブを取得できませんでした。");
  }
  return tab;
}

function setUnavailable(message) {
  pageStatus.textContent = message;
  applyButton.disabled = true;
}

function showError(message) {
  result.textContent = message;
  result.classList.add("isError");
}

function clearError() {
  result.classList.remove("isError");
}
