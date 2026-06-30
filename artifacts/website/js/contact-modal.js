/**
 * contact-modal.js — módulo de contato reutilizável para as páginas estáticas
 * do site institucional Vendor.ai.
 *
 * API pública:
 *   openContactModal({ origem, mensagemPreenchida?, titulo? })
 *   closeContactModal()
 */
(function () {
  'use strict';

  const API_BASE = '/api';

  // ── CSS injetado uma única vez ──────────────────────────────────────────────
  const CSS = `
#vcm-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 9000;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
#vcm-overlay.vcm-open { display: flex; }
#vcm-box {
  background: #0f1229;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px;
  width: 100%;
  max-width: 520px;
  padding: 36px;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8);
  max-height: 92vh;
  overflow-y: auto;
  animation: vcm-in 0.2s ease;
}
@keyframes vcm-in { from { opacity:0; transform:translateY(12px) scale(0.98); } to { opacity:1; transform:none; } }
#vcm-close {
  position: absolute;
  top: 14px; right: 14px;
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.1);
  background: transparent;
  color: #8880a8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  line-height: 1;
  transition: all 0.15s;
}
#vcm-close:hover { background: rgba(255,255,255,0.06); color: #f0eeff; }
.vcm-title { font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-size: 1.2rem; font-weight: 700; color: #f0eeff; margin-bottom: 4px; }
.vcm-sub { font-size: 0.85rem; color: #8880a8; margin-bottom: 24px; }
.vcm-alert {
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.85rem;
  color: #fca5a5;
  margin-bottom: 16px;
}
.vcm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media(max-width:480px) { .vcm-row { grid-template-columns: 1fr; } }
.vcm-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.vcm-label { font-size: 0.75rem; font-weight: 600; color: #8880a8; letter-spacing: 0.05em; text-transform: uppercase; }
.vcm-req { color: #f87171; margin-left: 2px; }
.vcm-input, .vcm-textarea {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 9px;
  color: #f0eeff;
  font-family: 'Inter', sans-serif;
  font-size: 0.88rem;
  padding: 10px 13px;
  transition: border-color 0.15s, background 0.15s;
  width: 100%;
  outline: none;
}
.vcm-input:focus, .vcm-textarea:focus {
  border-color: rgba(124,58,237,0.5);
  background: rgba(124,58,237,0.06);
}
.vcm-input::placeholder, .vcm-textarea::placeholder { color: #4e4870; }
.vcm-textarea { resize: vertical; min-height: 80px; }
.vcm-err { font-size: 0.75rem; color: #f87171; margin-top: 2px; display: none; }
.vcm-err.show { display: block; }
.vcm-submit {
  width: 100%;
  padding: 13px;
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #06b6d4 100%);
  background-size: 200% auto;
  color: #fff;
  border: none;
  border-radius: 100px;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 4px;
}
.vcm-submit:hover:not(:disabled) { background-position: right center; transform: translateY(-1px); }
.vcm-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.vcm-success {
  text-align: center;
  padding: 12px 0;
}
.vcm-success-icon {
  width: 60px; height: 60px;
  border-radius: 50%;
  background: rgba(16,185,129,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 18px;
  font-size: 1.8rem;
}
.vcm-success h3 { font-family: 'Plus Jakarta Sans','Inter',sans-serif; font-size: 1.3rem; font-weight: 700; color: #f0eeff; margin-bottom: 8px; }
.vcm-success p { font-size: 0.88rem; color: #8880a8; line-height: 1.65; max-width: 340px; margin: 0 auto 22px; }
.vcm-close-btn {
  display: inline-flex;
  align-items: center;
  padding: 12px 28px;
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #06b6d4 100%);
  color: #fff;
  border: none;
  border-radius: 100px;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}
.vcm-close-btn:hover { transform: translateY(-1px); }
`;

  // ── Inject HTML + CSS ───────────────────────────────────────────────────────
  function init() {
    if (document.getElementById('vcm-overlay')) return; // already initialized

    // Styles
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Modal HTML
    const div = document.createElement('div');
    div.id = 'vcm-overlay';
    div.innerHTML = `
      <div id="vcm-box">
        <button id="vcm-close" aria-label="Fechar">✕</button>
        <div id="vcm-inner"></div>
      </div>
    `;
    document.body.appendChild(div);

    // Close handlers
    document.getElementById('vcm-close').addEventListener('click', closeContactModal);
    div.addEventListener('click', function (e) { if (e.target === div) closeContactModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeContactModal(); });
  }

  // ── Render form ─────────────────────────────────────────────────────────────
  function renderForm(origem, mensagemPreenchida, titulo) {
    const inner = document.getElementById('vcm-inner');
    inner.innerHTML = `
      <h3 class="vcm-title">${titulo || 'Falar com a Vendor.ai'}</h3>
      <p class="vcm-sub">Preencha abaixo e retornamos em breve.</p>
      <div id="vcm-alert" class="vcm-alert" style="display:none"></div>
      <form id="vcm-form" novalidate>
        <div class="vcm-row">
          <div class="vcm-group">
            <label class="vcm-label" for="vcm-nome">Nome <span class="vcm-req">*</span></label>
            <input class="vcm-input" id="vcm-nome" placeholder="João Silva" autocomplete="name">
            <span class="vcm-err" id="vcm-nome-err">Nome obrigatório</span>
          </div>
          <div class="vcm-group">
            <label class="vcm-label" for="vcm-email">E-mail <span class="vcm-req">*</span></label>
            <input class="vcm-input" id="vcm-email" type="email" placeholder="joao@empresa.com" autocomplete="email">
            <span class="vcm-err" id="vcm-email-err">E-mail inválido</span>
          </div>
        </div>
        <div class="vcm-row">
          <div class="vcm-group">
            <label class="vcm-label" for="vcm-wpp">WhatsApp</label>
            <input class="vcm-input" id="vcm-wpp" placeholder="(11) 99999-9999" autocomplete="tel">
          </div>
          <div class="vcm-group">
            <label class="vcm-label" for="vcm-empresa">Empresa</label>
            <input class="vcm-input" id="vcm-empresa" placeholder="Sua Empresa" autocomplete="organization">
          </div>
        </div>
        <div class="vcm-group">
          <label class="vcm-label" for="vcm-msg">Mensagem <span class="vcm-req">*</span></label>
          <textarea class="vcm-textarea" id="vcm-msg" rows="3">${escapeHtml(mensagemPreenchida || '')}</textarea>
          <span class="vcm-err" id="vcm-msg-err">Mensagem obrigatória</span>
        </div>
        <button class="vcm-submit" type="submit" id="vcm-submit">Enviar mensagem</button>
      </form>
    `;

    document.getElementById('vcm-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(origem);
    });
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function submitForm(origem) {
    const nome    = document.getElementById('vcm-nome').value.trim();
    const email   = document.getElementById('vcm-email').value.trim();
    const wpp     = document.getElementById('vcm-wpp').value.trim();
    const empresa = document.getElementById('vcm-empresa').value.trim();
    const msg     = document.getElementById('vcm-msg').value.trim();

    // Validate
    let valid = true;
    toggleErr('vcm-nome-err', !nome); if (!nome) valid = false;
    toggleErr('vcm-email-err', !email || !/^\S+@\S+\.\S+$/.test(email)); if (!email || !/^\S+@\S+\.\S+$/.test(email)) valid = false;
    toggleErr('vcm-msg-err', msg.length < 5); if (msg.length < 5) valid = false;
    if (!valid) return;

    const btn = document.getElementById('vcm-submit');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    hideAlert();

    try {
      const res = await fetch(API_BASE + '/site/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, email,
          telefone: wpp || undefined,
          empresa: empresa || undefined,
          mensagem: msg,
          origem: origem,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errMsg = (body.details || []).join(', ') || body.error || 'Erro ao enviar';
        throw new Error(errMsg);
      }

      renderSuccess();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Enviar mensagem';
      showAlert(err.message || 'Tente novamente.');
    }
  }

  function renderSuccess() {
    document.getElementById('vcm-inner').innerHTML = `
      <div class="vcm-success">
        <div class="vcm-success-icon">✅</div>
        <h3>Mensagem enviada!</h3>
        <p>Recebemos seu contato. Nossa equipe retornará em breve pelo e-mail informado.</p>
        <button class="vcm-close-btn" onclick="closeContactModal()">Fechar</button>
      </div>
    `;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function toggleErr(id, show) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show', show);
  }
  function showAlert(msg) {
    const el = document.getElementById('vcm-alert');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function hideAlert() {
    const el = document.getElementById('vcm-alert');
    if (el) el.style.display = 'none';
  }
  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  window.openContactModal = function ({ origem, mensagemPreenchida, titulo } = {}) {
    init();
    renderForm(origem || 'cta_final', mensagemPreenchida || '', titulo || '');
    document.getElementById('vcm-overlay').classList.add('vcm-open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { const el = document.getElementById('vcm-nome'); if (el) el.focus(); }, 50);
  };

  window.closeContactModal = function () {
    const overlay = document.getElementById('vcm-overlay');
    if (overlay) overlay.classList.remove('vcm-open');
    document.body.style.overflow = '';
  };

  // Auto-init if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
