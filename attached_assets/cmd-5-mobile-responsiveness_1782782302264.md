# COMANDO 5 — Mobile Responsiveness (Android Chrome + iOS Safari)

**Stack:** React + Vite frontend  
**Breakpoint mobile:** max-width 768px  
**Prioridade:** corrigir layout quebrado, não redesenhar

---

## REGRAS GERAIS (aplicar em todos os componentes)

```css
/* Adicionar ao CSS global se não existir */
* { box-sizing: border-box; }
body { overflow-x: hidden; }
img, video { max-width: 100%; }

/* Containers que não devem vazar */
.page-container, .main-content {
  width: 100%;
  max-width: 100vw;
  padding: 0 16px;
}
```

---

## TELA 1 — Dashboard Executivo

**Problema:** Cards de métricas causam overflow horizontal.

```css
/* Grid de cards: de colunas fixas para responsivo */
.dashboard-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr); /* 2 colunas no mobile */
  gap: 12px;
}

/* Cada card não pode ter width fixa */
.metric-card {
  width: 100%;
  min-width: 0;
}

/* Gráficos: forçar width relativa */
.chart-container {
  width: 100% !important;
  overflow-x: auto;
}
```

---

## TELA 2 — Agenda

**Problema:** Scroll horizontal descontrolado, dias da semana somem.

```css
/* Wrapper da agenda com scroll controlado */
.agenda-calendar-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.agenda-week-grid {
  min-width: 600px; /* mantém legível, mas permite scroll */
}

/* No mobile, mudar view padrão para "dia" em vez de "semana" */
```

```jsx
// No componente de Agenda, detectar mobile e setar view inicial
const isMobile = window.innerWidth < 768;
const [view, setView] = useState(isMobile ? 'day' : 'week');
```

---

## TELA 3 — Formulário de Agendamento

**Problema:** Campo de data truncado, não aparece o valor completo.

```css
/* Inputs de data: garantir width total */
input[type="date"],
input[type="datetime-local"],
input[type="time"] {
  width: 100%;
  min-width: 0;
  font-size: 16px; /* evita zoom automático no iOS */
  padding: 10px 12px;
  box-sizing: border-box;
}

/* Labels não devem ficar na mesma linha que o input no mobile */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

---

## TELA 4 — CRM Kanban

**Problema:** Colunas em linha causam scroll horizontal sem controle.

```css
/* Mobile: colunas empilhadas verticalmente */
@media (max-width: 768px) {
  .kanban-board {
    flex-direction: column;
    overflow-x: unset;
  }

  .kanban-column {
    width: 100%;
    min-width: unset;
    margin-bottom: 16px;
  }
}
```

```jsx
// Alternativa: no mobile mostrar selector de coluna (dropdown)
// e exibir só os cards daquela coluna por vez
const [activeColumn, setActiveColumn] = useState(columns[0]?.id);
```

---

## TELA 5 — Campo UUID → Dropdown de usuário

**Problema:** Campo mostra UUID bruto em vez de nome do usuário.

Buscar todos os componentes que renderizam `assigned_to`, `owner_id`, `user_id` como texto puro e substituir por:

```jsx
// Componente UserSelect — criar se não existir
function UserSelect({ value, onChange, tenantId }) {
  const { data: users } = useQuery(['users', tenantId], fetchUsers);
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Selecionar responsável</option>
      {users?.map(u => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
}

// Para exibição (não edição), trocar UUID por nome:
function UserDisplay({ userId }) {
  const { data: users } = useQuery(['users'], fetchUsers);
  const user = users?.find(u => u.id === userId);
  return <span>{user?.name ?? 'Não atribuído'}</span>;
}
```

Aplicar em: cards do Kanban, lista de deals, detalhe do deal, lista de leads, formulário de agendamento.

---

## TELA 6 — Omnichannel / Mensagens

```css
@media (max-width: 768px) {
  /* Lista de conversas ocupa tela toda, chat abre em cima */
  .omnichannel-layout {
    flex-direction: column;
  }

  .conversations-list {
    width: 100%;
    height: 45vh;
    overflow-y: auto;
  }

  .chat-window {
    width: 100%;
    height: 55vh;
  }

  /* Input de mensagem fixo no bottom */
  .message-input-bar {
    position: sticky;
    bottom: 0;
    background: white;
    padding: 8px;
    border-top: 1px solid #eee;
  }
}
```

---

## TELA 7 — Formulários gerais (leads, deals, contatos)

```css
@media (max-width: 768px) {
  /* Campos lado a lado viram empilhados */
  .form-row {
    flex-direction: column;
  }

  .form-col {
    width: 100% !important;
  }

  /* Botões de ação: largura total no mobile */
  .form-actions {
    flex-direction: column;
    gap: 8px;
  }

  .form-actions button {
    width: 100%;
  }

  /* font-size mínimo 16px em todos os inputs (evita zoom iOS) */
  input, select, textarea {
    font-size: 16px !important;
  }
}
```

---

## TELA 8 — Navegação / Sidebar

```css
@media (max-width: 768px) {
  /* Sidebar vira drawer (oculto por padrão) */
  .sidebar {
    position: fixed;
    left: -100%;
    top: 0;
    height: 100vh;
    width: 280px;
    z-index: 999;
    transition: left 0.3s ease;
  }

  .sidebar.open {
    left: 0;
  }

  /* Overlay quando sidebar aberta */
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 998;
  }

  .sidebar-overlay.visible {
    display: block;
  }

  /* Header com botão hamburguer */
  .mobile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
  }
}
```

---

## TELA 9 — Tabelas (listas de clientes, propostas, contratos)

```css
@media (max-width: 768px) {
  /* Tabelas viram cards empilhados */
  table, thead, tbody, th, td, tr {
    display: block;
  }

  thead { display: none; } /* esconder cabeçalho */

  tr {
    background: #fff;
    border: 1px solid #eee;
    border-radius: 8px;
    margin-bottom: 12px;
    padding: 12px;
  }

  td {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 13px;
  }

  td::before {
    content: attr(data-label);
    font-weight: 600;
    color: #666;
    margin-right: 8px;
  }
}
```

Adicionar `data-label="Nome"`, `data-label="Status"` etc em cada `<td>` nas tabelas.

---

## TELA 10 — Modais

```css
@media (max-width: 768px) {
  .modal-overlay {
    align-items: flex-end; /* modal sobe do bottom */
  }

  .modal-content {
    width: 100%;
    max-width: 100%;
    border-radius: 16px 16px 0 0;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px 16px;
  }
}
```

---

## TELA 11 — Dashboard do Parceiro (nova tela do cmd-4)

```css
@media (max-width: 768px) {
  .partner-summary-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .partner-tenants-table {
    /* aplicar padrão de tabela→cards descrito na Tela 9 */
  }
}
```

---

## VALIDAÇÃO

Testar cada tela em:
- Chrome DevTools: iPhone 12 (390px) e Pixel 7 (412px)
- Dispositivo físico Android Chrome
- Dispositivo físico iOS Safari

Checklist por tela:
- [ ] Sem scroll horizontal indesejado
- [ ] Nenhum elemento cortado ou saindo da tela
- [ ] Inputs com font-size >= 16px (sem zoom no iOS)
- [ ] Botões com área de toque >= 44px de altura
- [ ] Campos de data/hora legíveis e funcionais
- [ ] UUID substituído por nome de usuário
