(() => {
  const vscode = acquireVsCodeApi();
  const textarea = document.getElementById('patterns');
  const btnSave = document.getElementById('save');
  const btnReload = document.getElementById('reload');
  const testInput = document.getElementById('test-path');
  const testBtn = document.getElementById('test-btn');
  const testResult = document.getElementById('test-result');

  function normalizeLines(text) {
    const normalized = text.replaceAll('\r', '');
    return normalized
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  function isInvalidDirRule(line) {
    if (!line.startsWith('dir:')) {
      return false;
    }
    const value = line.slice('dir:'.length).trim();
    if (!value) {
      return false;
    }
    return /[*?\[\]!]/.test(value);
  }

  function renderLines(lines) {
    textarea.value = lines.join('\n');
  }

  btnSave.addEventListener('click', () => {
    const patterns = normalizeLines(textarea.value);
    vscode.postMessage({ command: 'save', patterns });
  });

  btnReload.addEventListener('click', () => {
    vscode.postMessage({ command: 'reload' });
  });

  testBtn.addEventListener('click', () => {
    const value = testInput.value.trim();
    const lines = normalizeLines(textarea.value);
    const invalidDirRule = lines.find(isInvalidDirRule);
    if (invalidDirRule) {
      testResult.textContent = 'Directory rules do not support glob patterns';
      testResult.style.color = 'var(--vscode-testing-iconFailed, #f85149)';
      return;
    }
    testResult.textContent = 'Testing...';
    testResult.style.color = 'var(--vscode-descriptionForeground)';
    vscode.postMessage({ command: 'testPath', testPath: value });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'setPatterns') {
      renderLines(message.patterns || []);
    }
    if (message.command === 'testResult') {
      testResult.textContent = message.reason || (message.ignored ? 'Ignored' : 'Not ignored');
      testResult.style.color = message.ignored
        ? 'var(--vscode-testing-iconPassed, #2ea043)'
        : 'var(--vscode-testing-iconFailed, #f85149)';
    }
  });

  vscode.postMessage({ command: 'reload' });
})();
