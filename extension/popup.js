const titleNode = document.querySelector('#page-title');
const urlNode = document.querySelector('#page-url');
const statusNode = document.querySelector('#status');
const collectionNode = document.querySelector('#collection');
let currentTab = null;

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentTab = tab;
  const title = tab?.title || 'Untitled page';
  const url = tab?.url || '';
  titleNode.textContent = title;
  urlNode.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
});

document.querySelector('#save-button').addEventListener('click', () => {
  if (!currentTab?.url || !/^https?:/.test(currentTab.url)) {
    statusNode.textContent = 'This page cannot be saved as a web link.';
    return;
  }
  const params = new URLSearchParams({ url: currentTab.url, title: currentTab.title || '', collection: collectionNode.value });
  chrome.storage.local.set({ lastSaved: { url: currentTab.url, title: currentTab.title || '', collection: collectionNode.value, savedAt: Date.now() } });
  window.location.href = `shelf://save?${params.toString()}`;
  statusNode.textContent = 'Opening Shelf…';
});

document.querySelector('#copy-button').addEventListener('click', async () => {
  if (!currentTab?.url) return;
  await navigator.clipboard.writeText(currentTab.url);
  statusNode.textContent = 'Link copied.';
});
