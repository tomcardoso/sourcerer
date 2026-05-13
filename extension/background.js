const MENU_PARENT = 'sourcerer-save';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_PARENT,
    title: 'Save to Sourcerer',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({ id: 'sourcerer-email', parentId: MENU_PARENT, title: 'Save as email',  contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'sourcerer-phone', parentId: MENU_PARENT, title: 'Save as phone',  contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'sourcerer-note',  parentId: MENU_PARENT, title: 'Save as note',   contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'sourcerer-contact', parentId: MENU_PARENT, title: 'Add as new contact', contexts: ['selection'] });
});

const FIELD_TYPE_MAP = {
  'sourcerer-email':   'email',
  'sourcerer-phone':   'phone',
  'sourcerer-note':    'note',
  'sourcerer-contact': 'contact',
};

chrome.contextMenus.onClicked.addListener(async (info) => {
  const action = FIELD_TYPE_MAP[info.menuItemId];
  if (!action || !info.selectionText) return;

  await chrome.storage.session.set({
    pendingContextSelection: {
      text: info.selectionText.trim(),
      action, // 'email' | 'phone' | 'note' | 'contact'
    },
  });

  // chrome.action.openPopup() requires Chrome 127+ and a user-gesture context.
  // Context menu clicks qualify; fall back silently if unavailable.
  try {
    await chrome.action.openPopup();
  } catch {
    // User can click the extension icon to open the popup manually.
  }
});
