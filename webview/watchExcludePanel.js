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
