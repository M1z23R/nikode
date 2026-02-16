import { EditorView, hoverTooltip } from '@codemirror/view';

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export interface VariableInfo {
  name: string;
  value: string | undefined;
  isSecret: boolean;
}

export type VariableResolver = (name: string) => VariableInfo | undefined;
export type VariableSaver = (name: string, value: string) => void;

export interface VariableTooltipConfig {
  resolver: VariableResolver;
  onSave?: VariableSaver;
}

/**
 * Creates a hover tooltip extension for {{variable}} patterns.
 */
export function variableTooltip(config: VariableTooltipConfig) {
  return hoverTooltip((view, pos) => {
    const { from, text } = view.state.doc.lineAt(pos);
    const posInLine = pos - from;

    let match: RegExpExecArray | null;
    VARIABLE_PATTERN.lastIndex = 0;

    while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
      const varStart = match.index;
      const varEnd = match.index + match[0].length;

      if (posInLine >= varStart && posInLine <= varEnd) {
        const varName = match[1];
        const info = config.resolver(varName);

        return {
          pos: from + varStart,
          end: from + varEnd,
          above: true,
          create: () => createTooltipDOM(varName, info, config.onSave)
        };
      }
    }

    return null;
  });
}

function createTooltipDOM(
  name: string,
  info: VariableInfo | undefined,
  onSave?: VariableSaver
): { dom: HTMLElement } {
  const container = document.createElement('div');
  container.className = 'cm-var-tooltip';

  const value = info?.value ?? '';
  const isSecret = info?.isSecret ?? false;
  const isDefined = info?.value !== undefined;

  // Name row
  const nameRow = document.createElement('div');
  nameRow.className = 'cm-var-tooltip-name';
  nameRow.innerHTML = `<span class="label">Variable</span><span class="value">${name}</span>`;
  container.appendChild(nameRow);

  // Value row
  const valueRow = document.createElement('div');
  valueRow.className = 'cm-var-tooltip-row';

  const input = document.createElement('input');
  input.type = isSecret ? 'password' : 'text';
  input.className = 'cm-var-tooltip-input';
  input.value = value;
  input.placeholder = isDefined ? '' : 'Enter value...';

  if (!isDefined) {
    input.classList.add('undefined');
  }

  valueRow.appendChild(input);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'cm-var-tooltip-actions';

  // Toggle visibility (for secrets)
  if (isSecret) {
    const toggleBtn = createBtn(eyeOffIcon, 'Show/hide');
    let visible = false;
    toggleBtn.addEventListener('click', () => {
      visible = !visible;
      input.type = visible ? 'text' : 'password';
      toggleBtn.innerHTML = visible ? eyeIcon : eyeOffIcon;
    });
    actions.appendChild(toggleBtn);
  }

  // Copy
  if (isDefined) {
    const copyBtn = createBtn(copyIcon, 'Copy');
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(value);
      copyBtn.innerHTML = checkIcon;
      copyBtn.classList.add('success');
      setTimeout(() => {
        copyBtn.innerHTML = copyIcon;
        copyBtn.classList.remove('success');
      }, 1200);
    });
    actions.appendChild(copyBtn);
  }

  // Save
  if (onSave) {
    const saveBtn = createBtn(saveIcon, 'Save');

    const doSave = () => {
      const newValue = input.value.trim();
      if (newValue && newValue !== value) {
        onSave(name, newValue);
        saveBtn.innerHTML = checkIcon;
        saveBtn.classList.add('success');
        input.classList.remove('undefined');
        setTimeout(() => {
          saveBtn.innerHTML = saveIcon;
          saveBtn.classList.remove('success');
        }, 1200);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSave();
      }
    });

    saveBtn.addEventListener('click', doSave);
    actions.appendChild(saveBtn);
  }

  valueRow.appendChild(actions);
  container.appendChild(valueRow);

  // Status indicator
  if (!isDefined) {
    const status = document.createElement('div');
    status.className = 'cm-var-tooltip-status';
    status.textContent = 'Not defined in environment';
    container.appendChild(status);
  }

  setTimeout(() => input.focus(), 0);

  return { dom: container };
}

function createBtn(icon: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'cm-var-tooltip-btn';
  btn.title = title;
  btn.innerHTML = icon;
  btn.type = 'button';
  return btn;
}

const eyeIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

const eyeOffIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

const copyIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const saveIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

const checkIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

/**
 * Theme extension for variable tooltips.
 */
export const variableTooltipTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-var-tooltip': {
    background: 'var(--ui-bg)',
    border: '1px solid var(--ui-border-strong)',
    borderRadius: '8px',
    padding: '14px 16px',
    boxShadow: '0 4px 16px var(--ui-shadow)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    minWidth: '240px',
    maxWidth: '360px',
  },
  '.cm-var-tooltip-name': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--ui-border)',
  },
  '.cm-var-tooltip-name .label': {
    fontSize: '11px',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    color: 'var(--ui-text-muted)',
  },
  '.cm-var-tooltip-name .value': {
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--ui-text)',
  },
  '.cm-var-tooltip-row': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '2px 0',
  },
  '.cm-var-tooltip-input': {
    flex: '1',
    minWidth: '0',
    padding: '8px 12px',
    border: '1px solid var(--ui-border)',
    borderRadius: '6px',
    background: 'var(--ui-bg-secondary)',
    color: 'var(--ui-text)',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    outline: 'none',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  '.cm-var-tooltip-input:focus': {
    borderColor: 'var(--ui-border-strong)',
    background: 'var(--ui-bg)',
  },
  '.cm-var-tooltip-input.undefined': {
    borderStyle: 'dashed',
  },
  '.cm-var-tooltip-input::placeholder': {
    color: 'var(--ui-text-muted)',
    fontStyle: 'italic',
  },
  '.cm-var-tooltip-actions': {
    display: 'flex',
    gap: '4px',
    flexShrink: '0',
  },
  '.cm-var-tooltip-btn': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: '0',
    border: 'none',
    borderRadius: '6px',
    background: 'var(--ui-bg-tertiary)',
    color: 'var(--ui-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.12s ease',
  },
  '.cm-var-tooltip-btn:hover': {
    background: 'var(--ui-border-strong)',
    color: 'var(--ui-text)',
  },
  '.cm-var-tooltip-btn:active': {
    transform: 'scale(0.95)',
  },
  '.cm-var-tooltip-btn.success': {
    background: 'var(--ui-success)',
    color: '#fff',
  },
  '.cm-var-tooltip-status': {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid var(--ui-border)',
    fontSize: '11px',
    color: 'var(--ui-warning)',
    fontWeight: '500',
  },
});
