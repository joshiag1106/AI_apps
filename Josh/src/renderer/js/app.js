/**
 * Renderer entry point: owns tabs, panes and every user-facing command.
 *
 * State lives in one place. A tab holds a split tree (see split-tree.js) plus
 * a map of pane id to TerminalPane, and the DOM is rebuilt from that tree
 * whenever the layout changes. Menu items, keyboard shortcuts and the command
 * palette all dispatch through the same `commands` table, so a command has
 * exactly one implementation regardless of how it was triggered.
 */
(function () {
  'use strict';

  const api = window.josh;
  const SplitTree = window.SplitTree;
  const Themes = window.Themes;

  const el = (id) => document.getElementById(id);

  const state = {
    settings: null,
    info: null,
    prefersDark: true,
    themeName: 'Tokyo Night',
    theme: null,
    tabs: [],
    activeTabId: null,
    paneSequence: 0,
    tabSequence: 0,
  };

  const panesBySession = new Map();
  let tabStrip = null;
  let palette = null;

  // ---- Tab and pane lookup -------------------------------------------------

  const activeTab = () => state.tabs.find((tab) => tab.id === state.activeTabId) || null;

  function activePane() {
    const tab = activeTab();
    return tab ? tab.panes.get(tab.activePaneId) || null : null;
  }

  // ---- Layout --------------------------------------------------------------

  /** Rebuild a tab's DOM from its split tree, reusing existing pane elements. */
  function renderTab(tab) {
    tab.element.replaceChildren(buildNode(tab, tab.tree, 'root'));
    const paneCount = SplitTree.leaves(tab.tree).length;
    tab.element.classList.toggle('multi', paneCount > 1);
    markFocusedPane(tab);
    fitAll(tab);
  }

  function buildNode(tab, node, path) {
    if (SplitTree.isLeaf(node)) {
      const pane = tab.panes.get(node.id);
      if (!pane) return document.createElement('div');
      pane.element.style.flexGrow = '1';
      pane.element.style.flexBasis = '0';
      return pane.element;
    }

    const box = document.createElement('div');
    box.className = 'split';
    box.dataset.dir = node.direction;

    node.children.forEach((child, index) => {
      const childElement = buildNode(tab, child, path + '.' + index);
      childElement.style.flexGrow = String(node.sizes[index] != null ? node.sizes[index] : 0.5);
      childElement.style.flexBasis = '0';
      box.appendChild(childElement);
      if (index === 0 && node.children.length > 1) {
        box.appendChild(makeResizer(tab, node, path, box));
      }
    });

    return box;
  }

  /**
   * Divider drag. Flex ratios are adjusted directly during the drag so it
   * stays smooth on large scrollbacks; the tree is only updated on release,
   * which is also when panes are re-fitted and the PTYs are told their size.
   */
  function makeResizer(tab, node, path, container) {
    const resizer = document.createElement('div');
    resizer.className = 'resizer';

    resizer.addEventListener('mousedown', (event) => {
      event.preventDefault();
      resizer.classList.add('dragging');

      const horizontal = node.direction === 'row';
      const rect = container.getBoundingClientRect();
      const first = container.children[0];
      const second = container.children[2];
      let ratio = node.sizes[0] != null ? node.sizes[0] : 0.5;

      const onMove = (moveEvent) => {
        const position = horizontal
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height;
        ratio = Math.min(1 - SplitTree.MIN_SIZE, Math.max(SplitTree.MIN_SIZE, position));
        if (first) first.style.flexGrow = String(ratio);
        if (second) second.style.flexGrow = String(1 - ratio);
      };

      const onUp = () => {
        resizer.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        tab.tree = SplitTree.resize(tab.tree, path, ratio);
        fitAll(tab);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    return resizer;
  }

  function fitAll(tab) {
    for (const pane of tab.panes.values()) pane.fit();
    updateStatus();
  }

  function markFocusedPane(tab) {
    for (const [id, pane] of tab.panes) {
      pane.element.classList.toggle('focused', id === tab.activePaneId);
    }
  }

  // ---- Tabs ----------------------------------------------------------------

  async function createTab(cwd) {
    state.tabSequence += 1;
    const tab = {
      id: 't' + state.tabSequence,
      title: 'Terminal',
      tree: null,
      panes: new Map(),
      activePaneId: null,
      element: document.createElement('div'),
    };
    tab.element.className = 'tabpanel';
    el('workspace').appendChild(tab.element);
    state.tabs.push(tab);

    let pane;
    try {
      pane = await addPane(tab, cwd);
    } catch (error) {
      tab.element.remove();
      state.tabs = state.tabs.filter((entry) => entry !== tab);
      throw error;
    }

    tab.tree = SplitTree.leaf(pane.id);
    tab.activePaneId = pane.id;

    activateTab(tab.id);
    return tab;
  }

  async function addPane(tab, cwd) {
    state.paneSequence += 1;
    const pane = new window.TerminalPane({
      id: 'p' + state.paneSequence,
      settings: state.settings,
      theme: state.theme,
      onTitle: (paneId, title) => onPaneTitle(tab, paneId, title),
      onFocus: (paneId) => focusPane(tab, paneId),
    });

    tab.panes.set(pane.id, pane);
    tab.element.appendChild(pane.element); // must be in the DOM before measuring

    try {
      const session = await pane.start(cwd);
      panesBySession.set(session.sessionId, pane);
      if (tab.title === 'Terminal') {
        tab.title = basename(session.shell);
        renderTabs();
      }
    } catch (error) {
      pane.dispose();
      tab.panes.delete(pane.id);
      throw error;
    }
    return pane;
  }

  function activateTab(id) {
    state.activeTabId = id;
    for (const tab of state.tabs) {
      tab.element.classList.toggle('active', tab.id === id);
    }
    renderTabs();
    const tab = activeTab();
    if (tab) {
      renderTab(tab);
      const pane = tab.panes.get(tab.activePaneId);
      if (pane) pane.focus();
    }
    updateStatus();
  }

  function closeTab(id) {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;
    const tab = state.tabs[index];

    for (const pane of tab.panes.values()) {
      if (pane.sessionId) panesBySession.delete(pane.sessionId);
      pane.dispose();
    }
    tab.element.remove();
    state.tabs.splice(index, 1);

    if (state.tabs.length === 0) {
      api.win.close().catch(function () {});
      return;
    }
    const next = state.tabs[Math.min(index, state.tabs.length - 1)];
    activateTab(next.id);
  }

  function renderTabs() {
    tabStrip.render(
      state.tabs.map((tab) => ({ id: tab.id, title: tab.title })),
      state.activeTabId
    );
  }

  function onPaneTitle(tab, paneId, title) {
    if (paneId !== tab.activePaneId) return;
    const clean = String(title || '').slice(0, 120);
    if (clean && clean !== tab.title) {
      tab.title = clean;
      renderTabs();
    }
  }

  function focusPane(tab, paneId) {
    tab.activePaneId = paneId;
    markFocusedPane(tab);
    const pane = tab.panes.get(paneId);
    if (pane) pane.focus();
    updateStatus();
  }

  // ---- Splits --------------------------------------------------------------

  async function splitActive(direction) {
    const tab = activeTab();
    if (!tab) return;
    const target = tab.activePaneId;
    const source = tab.panes.get(target);
    const cwd = source ? source.cwd : null;

    const pane = await addPane(tab, cwd);
    tab.tree = SplitTree.splitLeaf(tab.tree, target, pane.id, direction);
    tab.activePaneId = pane.id;
    renderTab(tab);
    pane.focus();
  }

  function closeActivePane() {
    const tab = activeTab();
    if (!tab) return;
    const paneId = tab.activePaneId;
    const pane = tab.panes.get(paneId);
    if (!pane) return;

    if (SplitTree.leaves(tab.tree).length === 1) {
      closeTab(tab.id);
      return;
    }

    const neighbour = SplitTree.neighbourOf(tab.tree, paneId);
    if (pane.sessionId) panesBySession.delete(pane.sessionId);
    pane.dispose();
    tab.panes.delete(paneId);
    tab.tree = SplitTree.removeLeaf(tab.tree, paneId);
    tab.activePaneId = neighbour;
    renderTab(tab);
    const next = tab.panes.get(neighbour);
    if (next) next.focus();
  }

  /** A shell that exited on its own closes its pane, matching a real terminal. */
  function onSessionExit(sessionId) {
    const pane = panesBySession.get(sessionId);
    if (!pane) return;
    panesBySession.delete(sessionId);

    for (const tab of state.tabs) {
      if (!tab.panes.has(pane.id)) continue;
      if (SplitTree.leaves(tab.tree).length === 1) {
        closeTab(tab.id);
      } else {
        const neighbour = SplitTree.neighbourOf(tab.tree, pane.id);
        pane.dispose();
        tab.panes.delete(pane.id);
        tab.tree = SplitTree.removeLeaf(tab.tree, pane.id);
        if (tab.activePaneId === pane.id) tab.activePaneId = neighbour;
        renderTab(tab);
      }
      return;
    }
  }

  // ---- Theme and settings --------------------------------------------------

  function applyTheme() {
    state.themeName = Themes.resolve(state.settings, state.prefersDark);
    state.theme = Themes.applyToDocument(state.themeName);
    for (const tab of state.tabs) {
      for (const pane of tab.panes.values()) pane.setTheme(state.theme);
    }
    updateStatus();
  }

  function applySettings(next) {
    state.settings = next;
    for (const tab of state.tabs) {
      for (const pane of tab.panes.values()) pane.applySettings(next);
    }
    applyTheme();
  }

  async function patchSettings(partial) {
    try {
      applySettings(await api.settings.set(partial));
    } catch {
      /* settings are best-effort; a failed write must not break the session */
    }
  }

  function zoom(delta) {
    const size = Math.min(72, Math.max(6, state.settings.fontSize + delta));
    patchSettings({ fontSize: size });
  }

  // ---- Status bar ----------------------------------------------------------

  function updateStatus() {
    const pane = activePane();
    el('status-shell').textContent = pane && pane.shell ? basename(pane.shell) : '';
    const cwd = pane && pane.cwd ? pane.cwd : '';
    el('status-cwd').textContent = cwd;
    el('status-cwd').title = cwd;
    el('status-size').textContent =
      pane && pane.term ? pane.term.cols + ' x ' + pane.term.rows : '';
    el('status-theme').textContent = state.themeName;
  }

  function basename(value) {
    return String(value || '')
      .split(/[\\/]/)
      .pop();
  }

  // ---- Find bar ------------------------------------------------------------

  function openFind() {
    el('findbar').hidden = false;
    const input = el('find-input');
    input.focus();
    input.select();
  }

  function closeFind() {
    el('findbar').hidden = true;
    const pane = activePane();
    if (pane) pane.focus();
  }

  function runFind(backwards) {
    const query = el('find-input').value;
    const pane = activePane();
    if (!pane || !query) return;
    if (backwards) pane.findPrevious(query);
    else pane.findNext(query);
  }

  // ---- Commands ------------------------------------------------------------

  const commands = {
    'tab:new': () => {
      const pane = activePane();
      createTab(pane ? pane.cwd : null).catch(reportFailure);
    },
    'tab:close': () => closeTab(state.activeTabId),
    'tab:next': () => cycleTab(1),
    'tab:prev': () => cycleTab(-1),
    'split:right': () => splitActive('row').catch(reportFailure),
    'split:down': () => splitActive('column').catch(reportFailure),
    'pane:close': closeActivePane,
    'edit:copy': () => {
      const pane = activePane();
      if (!pane) return;
      const selection = pane.getSelection();
      if (selection) api.clipboard.write(selection).catch(function () {});
    },
    'edit:paste': async () => {
      const pane = activePane();
      if (!pane) return;
      const text = await api.clipboard.read().catch(() => '');
      pane.paste(text);
    },
    'edit:selectAll': () => {
      const pane = activePane();
      if (pane) pane.selectAll();
    },
    'edit:clear': () => {
      const pane = activePane();
      if (pane) pane.clear();
    },
    'find:open': openFind,
    'palette:open': openPalette,
    'zoom:in': () => zoom(1),
    'zoom:out': () => zoom(-1),
    'zoom:reset': () => patchSettings({ fontSize: 14 }),
  };

  function cycleTab(delta) {
    if (state.tabs.length < 2) return;
    const index = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
    const next = (index + delta + state.tabs.length) % state.tabs.length;
    activateTab(state.tabs[next].id);
  }

  function reportFailure(error) {
    const pane = activePane();
    const message = error && error.message ? error.message : 'command failed';
    if (pane) pane.write('\r\n\x1b[31mjosh: ' + message + '\x1b[0m\r\n');
  }

  function openPalette() {
    const entries = [
      { label: 'New Tab', hint: accel('T'), run: commands['tab:new'] },
      { label: 'Close Tab', hint: accel('W'), run: commands['tab:close'] },
      { label: 'Split Right', hint: accel('D'), run: commands['split:right'] },
      { label: 'Split Down', run: commands['split:down'] },
      { label: 'Close Pane', run: commands['pane:close'] },
      { label: 'Find in Terminal', hint: accel('F'), run: openFind },
      { label: 'Clear Terminal', hint: accel('K'), run: commands['edit:clear'] },
      { label: 'Zoom In', run: commands['zoom:in'] },
      { label: 'Zoom Out', run: commands['zoom:out'] },
      { label: 'Reset Zoom', run: commands['zoom:reset'] },
      {
        label: 'Toggle Copy on Select (' + (state.settings.copyOnSelect ? 'on' : 'off') + ')',
        run: () => patchSettings({ copyOnSelect: !state.settings.copyOnSelect }),
      },
      { label: 'Follow System Theme', run: () => patchSettings({ theme: 'auto' }) },
    ];

    for (const name of Themes.NAMES) {
      entries.push({
        label: 'Theme: ' + name,
        hint: Themes.THEMES[name].dark ? 'dark' : 'light',
        run: () => patchSettings({ theme: name }),
      });
    }

    palette.open(entries);
  }

  /** Render an accelerator the way this platform writes it. */
  function accel(key) {
    return state.info && state.info.platform === 'darwin' ? 'Cmd+' + key : 'Ctrl+Shift+' + key;
  }

  // ---- Wiring --------------------------------------------------------------

  function wireEvents() {
    api.on('pty:data', (payload) => {
      const pane = panesBySession.get(payload.sessionId);
      if (pane) pane.write(payload.data);
    });

    api.on('pty:exit', (payload) => onSessionExit(payload.sessionId));

    api.on('pty:cwd', (payload) => {
      const pane = panesBySession.get(payload.sessionId);
      if (pane) {
        pane.cwd = payload.cwd;
        updateStatus();
      }
    });

    api.on('menu:action', (action) => {
      const command = commands[action];
      if (command) command();
    });

    api.on('theme:changed', (payload) => {
      state.prefersDark = Boolean(payload && payload.dark);
      applyTheme();
    });

    api.on('settings:changed', (next) => applySettings(next));

    el('btn-newtab').addEventListener('click', commands['tab:new']);
    el('find-next').addEventListener('click', () => runFind(false));
    el('find-prev').addEventListener('click', () => runFind(true));
    el('find-close').addEventListener('click', closeFind);

    el('find-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runFind(event.shiftKey);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeFind();
      }
    });

    palette.onDismiss = () => {
      const pane = activePane();
      if (pane) pane.focus();
    };

    // Double-clicking empty title-bar space matches the platform convention.
    el('titlebar-fill').addEventListener('dblclick', () => {
      api.win.toggleMaximize().catch(function () {});
    });

    window.addEventListener('resize', () => {
      const tab = activeTab();
      if (tab) fitAll(tab);
    });

    // Remember where each tab was, so the next launch can reopen there.
    window.addEventListener('beforeunload', () => {
      if (!state.settings || !state.settings.restoreSession) return;
      const directories = state.tabs
        .map((tab) => {
          const pane = tab.panes.get(tab.activePaneId);
          return pane && pane.cwd ? pane.cwd : null;
        })
        .filter(Boolean)
        .slice(0, 20);
      api.settings.set({ lastSession: directories }).catch(function () {});
    });
  }

  // ---- Boot ----------------------------------------------------------------

  async function boot() {
    state.info = await api.os.info();
    document.body.dataset.platform = state.info.platform;
    state.prefersDark = state.info.darkMode;
    state.settings = await api.settings.get();
    applyTheme();

    tabStrip = new window.TabStrip(el('tabstrip'), {
      onSelect: activateTab,
      onClose: closeTab,
    });
    palette = new window.CommandPalette({
      backdrop: el('palette-backdrop'),
      input: el('palette-input'),
      list: el('palette-list'),
    });

    wireEvents();

    const restore =
      state.settings.restoreSession && Array.isArray(state.settings.lastSession)
        ? state.settings.lastSession
        : [];

    let opened = 0;
    for (const directory of restore) {
      // A directory deleted since the last run must not stop the restore.
      try {
        await createTab(directory);
        opened += 1;
      } catch {
        /* skip this one and carry on */
      }
    }
    if (opened === 0) await createTab(null);
  }

  boot().catch((error) => {
    document.body.textContent =
      'Josh failed to start: ' + (error && error.message ? error.message : error);
  });
})();
