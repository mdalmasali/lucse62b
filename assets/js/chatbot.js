(function () {
  if (document.getElementById('cb62-btn')) return;

  const WORKER = 'https://lucse62b-api.sy164425.workers.dev';

  const style = document.createElement('style');
  style.textContent = `
    #cb62-btn {
      position: fixed; bottom: 24px; right: 24px;
      width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none; cursor: pointer; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(99,102,241,.45);
      transition: transform .2s, box-shadow .2s;
    }
    #cb62-btn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(99,102,241,.6); }
    #cb62-btn svg { width: 24px; height: 24px; fill: #fff; }

    #cb62-win {
      position: fixed; bottom: 88px; right: 24px;
      width: 340px; max-height: 520px;
      background: var(--card, #1a1a2e);
      border: 1px solid var(--border, rgba(255,255,255,.1));
      border-radius: 18px; z-index: 9998;
      display: flex; flex-direction: column;
      box-shadow: 0 12px 48px rgba(0,0,0,.5);
      overflow: hidden;
      opacity: 0; transform: translateY(14px) scale(.96);
      pointer-events: none;
      transition: opacity .22s, transform .22s;
    }
    #cb62-win.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }

    #cb62-head {
      padding: 13px 16px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    #cb62-head-left { display: flex; align-items: center; gap: 10px; }
    #cb62-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: rgba(255,255,255,.2);
      display: flex; align-items: center; justify-content: center; font-size: 17px;
    }
    #cb62-title { font-size: .84rem; font-weight: 700; color: #fff; line-height: 1.2; }
    #cb62-sub { font-size: .67rem; color: rgba(255,255,255,.75); }
    #cb62-close {
      background: none; border: none; color: rgba(255,255,255,.8);
      cursor: pointer; font-size: 1.1rem; padding: 2px 5px; line-height: 1;
    }
    #cb62-close:hover { color: #fff; }

    #cb62-msgs {
      flex: 1; overflow-y: auto; padding: 14px 12px;
      display: flex; flex-direction: column; gap: 9px;
      min-height: 200px; max-height: 340px;
    }
    #cb62-msgs::-webkit-scrollbar { width: 3px; }
    #cb62-msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }

    .cb-msg {
      max-width: 88%; padding: 9px 13px;
      border-radius: 14px; font-size: .79rem; line-height: 1.55;
      word-break: break-word; white-space: pre-wrap;
    }
    .cb-msg.bot {
      background: rgba(255,255,255,.07); color: var(--text, #e2e8f0);
      align-self: flex-start; border-bottom-left-radius: 4px;
    }
    .cb-msg.user {
      background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;
      align-self: flex-end; border-bottom-right-radius: 4px;
    }
    #cb62-typing {
      align-self: flex-start; display: flex; gap: 5px; padding: 12px 16px;
      background: rgba(255,255,255,.07); border-radius: 14px; border-bottom-left-radius: 4px;
    }
    #cb62-typing span {
      width: 6px; height: 6px; border-radius: 50%;
      background: rgba(255,255,255,.45);
      animation: cb62bounce .75s infinite;
    }
    #cb62-typing span:nth-child(2) { animation-delay: .15s; }
    #cb62-typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes cb62bounce { 0%,80%,100% { transform:translateY(0); } 40% { transform:translateY(-6px); } }

    #cb62-foot {
      padding: 10px 12px;
      border-top: 1px solid var(--border, rgba(255,255,255,.08));
      display: flex; gap: 8px; align-items: center; flex-shrink: 0;
    }
    #cb62-input {
      flex: 1; background: rgba(255,255,255,.06);
      border: 1px solid var(--border, rgba(255,255,255,.1));
      border-radius: 20px; padding: 8px 14px;
      font-size: .79rem; color: var(--text, #e2e8f0);
      outline: none; font-family: inherit;
    }
    #cb62-input::placeholder { color: var(--text-secondary, #64748b); }
    #cb62-input:focus { border-color: #6366f1; }
    #cb62-send {
      width: 34px; height: 34px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: opacity .2s;
    }
    #cb62-send:disabled { opacity: .45; cursor: not-allowed; }
    #cb62-send svg { width: 14px; height: 14px; fill: #fff; }

    @media (max-width: 420px) {
      #cb62-win { width: calc(100vw - 20px); right: 10px; bottom: 78px; }
      #cb62-btn { right: 14px; bottom: 14px; }
    }
  `;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML('beforeend', `
    <button id="cb62-btn" aria-label="Open 62B Bot">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    </button>
    <div id="cb62-win" role="dialog" aria-label="62B Bot">
      <div id="cb62-head">
        <div id="cb62-head-left">
          <div id="cb62-avatar">🤖</div>
          <div>
            <div id="cb62-title">62B Bot</div>
            <div id="cb62-sub">CSE 62B AI Assistant</div>
          </div>
        </div>
        <button id="cb62-close" aria-label="Close">✕</button>
      </div>
      <div id="cb62-msgs"></div>
      <div id="cb62-foot">
        <input id="cb62-input" type="text" placeholder="যেকোনো প্রশ্ন করুন…" autocomplete="off" />
        <button id="cb62-send" aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  `);

  const win   = document.getElementById('cb62-win');
  const msgs  = document.getElementById('cb62-msgs');
  const input = document.getElementById('cb62-input');
  const send  = document.getElementById('cb62-send');

  let history  = [];
  let isOpen   = false;
  let loading  = false;

  function addMsg(text, role) {
    const el = document.createElement('div');
    el.className = 'cb-msg ' + role;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.id = 'cb62-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() { document.getElementById('cb62-typing')?.remove(); }

  addMsg('হ্যালো! আমি 62B Bot 🤖\nAssignment, course, deadline, বা যেকোনো প্রশ্ন করুন — বাংলা বা English যেকোনো ভাষায়।', 'bot');

  async function sendMsg() {
    const text = input.value.trim();
    if (!text || loading) return;

    input.value = '';
    loading = true;
    send.disabled = true;

    addMsg(text, 'user');
    showTyping();

    try {
      const res  = await fetch(`${WORKER}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      hideTyping();

      const reply = data.reply || 'Sorry, something went wrong.';
      addMsg(reply, 'bot');
      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: reply });
      if (history.length > 12) history = history.slice(-12);
    } catch (e) {
      hideTyping();
      addMsg('Connection error. Please try again.', 'bot');
    }

    loading = false;
    send.disabled = false;
    input.focus();
  }

  document.getElementById('cb62-btn').addEventListener('click', () => {
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    if (isOpen) input.focus();
  });

  document.getElementById('cb62-close').addEventListener('click', () => {
    isOpen = false;
    win.classList.remove('open');
  });

  send.addEventListener('click', sendMsg);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
})();
