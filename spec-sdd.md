# Portfolio Blog — spec-sdd.md

Versão estruturada no padrão SDD. Origem: `spec-original.md` (spec externa preservada). Ajustes e motivos documentados em cada seção.

**Fases de entrega da spec externa:** 1–2 implementáveis agora. 3–6 são roadmap — proibido implementar.
**Fases SDD:** Specify → Design → Tasks → Execute (este documento).

---

## Parte A — Specify

### A0. Resumo do projeto

Blog público de portfólio. Leitura é livre. Signup/login passwordless via magic link (mesmo fluxo). Só `ADMIN` escreve posts. Conteúdo em Markdown. Objetivo: demonstrar arquitetura backend (camadas por feature, state machines, auth passwordless, filas com retry, logging estruturado, moderação).

**Tipo de projeto:** CMS/conteúdo (público) + área admin.
**Modo de análise:** CMS+ (10 conceitos). Modo Profundo dispensado — escopo e risco não justificam os 15.

### A1. Conceitos selecionados e como entram no Specify

| Conceito | Questão de Specify | Resposta para este projeto |
|---|---|---|
| **State Categorization** | O que precisa ser compartilhável via URL / sobreviver a refresh? O que vem da API? | Ver tabela A2 |
| **SSR/Hydration** (adaptado p/ SPA) | A rota precisa de SEO / first-paint rápido para anônimos? | **Sim** para posts públicos. Decisão: CSR deliberado + compensação SEO (meta/OG via `react-helmet-async`, sitemap estático). Trade-off documentado em B2 |
| **Accessibility** | Nível de conformidade? | **WCAG AA** (cliente/público) |
| **Observability** | Feature crítica o suficiente para monitoramento prioritário? | Sim para auth e leitura pública (página de portfólio). Instrumentação mínima nesta entrega; hardening é Fase 3 |
| **Design System** | Usa componentes/tokens existentes ou precisa de novos? | Reaproveitar tokens do ghost-studio (`globals.css @theme`). Componentes Blog adaptados. Novos: Login/Verify/Admin |
| **Cache/Optimistic** | Quais mutações precisam de resposta instantânea? | Admin CRUD: invalidate (sem urgência). Auth: não aplicável. Polling/comments: Fase 6 |
| **Main Thread Perf** | Lista grande (>100–200 itens)? | **Não** — listas paginadas (limit ≤50). Marcar N/A condicional; revisar se admin crescer |
| **Testing Strategy** | Crítico suficiente para E2E? Fluxos complexos? | Leitura e auth = fluxos críticos → integration + 1–2 E2E smoke. Portfolio = lighter touch permitido, mas checklist de deliverables se aplica |
| **Security** | UGC, dados sensíveis, XSS vectors? | Markdown = superfície XSS. Magic-link + cookie session = CSRF obrigatório. Ver A3 |
| **API Contracts** | Consome/produz API? Error shape? | Sim — Express 5. Error envelope já definido na spec original; complementado em A4 |
| **Performance Budgets** | Afeta LCP/CLS/INP? Categoria? | **Categoria 1: public-facing** → prioridade LCP + bundle strict. Ver A5 |
| **Responsive** | Precisa funcionar em mobile? | Sim — blog público + admin. Mobile-first. Ver A6 |

**Conceitos Design-only (não entram no Specify):** Rendering Pipeline, Event Loop Scheduling, Bundle Architecture (entram no Design — B5).

### A2. Classificação de estado por requisito

| Estado | Categoria | Mecanismo | Justificativa |
|---|---|---|---|
| Lista de posts pública (page, limit) | **URL** + **Server** | `useSearchParams` + TanStack Query `['posts', page, limit]` | Paginação compartilhável via link; dados do servidor |
| Post individual (por slug) | **Server** | TanStack Query `['posts', slug]` | Dado do servidor, cacheável, stale ok |
| Filtro de status no admin | **URL** | `useSearchParams` | Compartilhável / refresh |
| Sessão do usuário (auth) | **Global** | React Context (`AuthProvider`) | Usado por header, rotas admin, guards. Separado do cache de server state |
| Resultado do `/api/auth/me` | **Server** | TanStack Query `['me']` | Dado do servidor; sincronizar com Context após login/logout |
| Magic-link token (na URL do verify) | **URL** | `useSearchParams` (react-router) | Precisa sobreviver a refresh da página de confirmação |
| Formulário de login (email digitado) | **Local** | `useState` | Ephemeral, morre no unmount |
| Formulário de post admin (title/content/excerpt) | **Local** (react-hook-form se crescer) | `useState` / RHF | Rascunho local até submit |
| Hover/dim do card | **Local** | `useState` | Só o componente |
| Modal de confirmação (delete post) | **Local** | `useState` | Ephemeral |
| Toast/feedback de erro | **Local** | `useState` ou `react-hot-toast` | Ephemeral |

**Regra:** nunca duplicar estado entre categorias com `useEffect` de sincronização. URL é source of truth para o que é compartilhável. Server state nunca vai para `useState` cru.

### A3. Security posture (decidido ANTES de código que trata conteúdo/UGC)

| Vetor | Decisão |
|---|---|
| **Markdown → HTML** | `react-markdown` **sem `rehype-raw`**. HTML raw no conteúdo não é executado. Links: validar protocolo (bloquear `javascript:`). `img`: só http(s) |
| **dangerouslySetInnerHTML** | **Proibido.** Qualquer ocorrência é review point |
| **UGC (comentários, Fase 5)** | Sanitização server-side antes de persistir + renderização segura no cliente (as duas camadas) |
| **Auth mechanism** | Cookie **httpOnly** (`SameSite=Lax`, `Secure` em prod, 30 dias). DB guarda só **hash** (SHA-256) do session token e do login token |
| **CSRF** | **Obrigatório** (cookie session). Double-submit cookie: token CSRF emitido no GET inicial/`me`, exigido em POST/PUT/PATCH/DELETE |
| **Token storage** | httpOnly cookie (não localStorage). Logout limpa cookie + destrói sessão |
| **Deep links** | `token` query param validado como input externo (Zod). Back button funciona (tela de confirmação não consome token no mount) |
| **Logging** | Tokens e cookies **nunca** logados. Mascaramento no Pino |

### A4. API contracts (respostas e mapeamento)

**Success (já na spec):**
- Recurso único: retorna o recurso direto (ou `{ data: ... }` quando a spec define)
- Lista: `{ data: [...], page, limit, total }`
- Health: `{ "status": "ok" }`

**Error (uniforme em todos os endpoints, incluindo 500):**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [] } }
```
- `code`: SCREAMING_SNAKE_CASE estável — frontend faz branch em `code`, não em `message`
- `message`: seguro para log; não é copy final para o usuário
- `details`: array (field errors em validação)

**Status → state (frontend):**

| HTTP | Estado UI | Comportamento |
|---|---|---|
| 200/201 | Success | Renderizar dado |
| 400 (VALIDATION_ERROR) | Erro de formulário inline | Sem retry; `details` por campo |
| 401 | Não autenticado | Redirect para login (ou estado logged-out) |
| 403 | Sem permissão | Mensagem "não autorizado"; sem retry |
| 404 | Not found | Empty state dedicado (não é erro genérico) |
| 409 | Conflito de estado | Mensagem específica (ex: "já publicado") |
| 429 | Rate limit | "Tente novamente em instantes" |
| 500+ | Erro de servidor | Mensagem genérica + botão retry |
| Network fail | Erro de rede | Distinto de 500; auto-retry seguro |

**Regra:** validação (400) e erro de servidor (500) **nunca** compartilham o mesmo componente de erro.

**Tipos compartilhados:** schemas Zod como source of truth no API; frontend usa tipos inferidos / copiados em `shared/api.ts`. (OpenAPI completo é melhoria — Fase 3+.)

### A5. Performance budgets

| Métrica | Target | Prioridade |
|---|---|---|
| LCP | ≤ 2.5s | **Alta** (public-facing) |
| CLS | ≤ 0.1 | Alta (imagens Markdown) |
| INP | ≤ 200ms | Média (admin pode pesar) |
| Initial JS | ≤ 170KB gzip | Estrita |
| Initial CSS | ≤ 50KB gzip | |
| Page weight initial | ≤ 500KB gzip | |

**Enforcement:** `lighthouserc.json` + `size-limit` no repo, CI falha em violação. Bundle analyzer roda uma vez no setup.

### A6. Responsive

- **Mobile-first** (`min-width` para cima)
- Breakpoints Tailwind default: sm 640 / md 768 / lg 1024 / xl 1280
- Touch targets **≥44×44px**
- **`dvh`** para elementos full-height (não `vh`)
- Imagens responsivas: `width`/`height` ou `aspect-ratio` reservando espaço (CLS). Lazy em below-fold
- Grid de cards reflow: multi-coluna → stack em `md`/`sm`
- Viewport meta confirmado
- Testado em mobile real (comportamento do address bar), não só janela redimensionada

### A7. Testing classification por feature

| Feature | Nível | Por quê |
|---|---|---|
| Services (visibility, state machine, auth) | **Unit** (Vitest) | Regra de negócio pura |
| Endpoints API | **Integration** (Supertest) | Contrato HTTP |
| BlogList, BlogArticle, Login, Admin | **Integration** (RTL + MSW) | Fluxos críticos com boundary HTTP |
| Auth flow completo | **E2E smoke** (1–2) | Jornada crítica login→verify |
| A11y | **axe** em componentes + teclado | Obrigatório em qualquer camada existente |
| Markdown rendering | Unit (react-markdown output) | Security-relevant |

Pirâmide: muitos unit → alguns integration → poucos E2E. Coverage 70–80% em business logic como sinal; fluxos críticos em checklist, não %.

### A8. Escopo

**Implementar agora:** Fase 1 (foundation + posts públicos) e Fase 2 (magic link + admin).
**NÃO implementar:** Fases 3–6, SSE/WebSocket, i18n, visual de marketing (Header/Footer/Hero) — este último fica como melhoria futura pós-entrega.

---

## Parte B — Design (decisões travadas ANTES das Tasks)

Sub-agentes executam **dentro** destas decisões. Não re-decidem arquitetura.

### B1. Monorepo e stack tooling

| Item | Decisão |
|---|---|
| Workspaces | **pnpm workspaces** (`pnpm-workspace.yaml`) |
| API | Node + Express 5 + TypeScript strict |
| ORM | Prisma (sem repository layer) |
| Validação | Zod (env, body, query) |
| Logger | Pino + correlation id middleware |
| Web | Vite + React + React Router v6+ + TanStack Query |
| Styling | Tailwind **v4** CSS-first (`@import "tailwindcss"` + `@theme inline`) |
| Testes | Vitest + Supertest + RTL + MSW + vitest-axe |
| Mail (Fase 2) | Nodemailer → Mailpit SMTP localhost:1025 |

### B2. Renderização e SEO (adaptação SPA do conceito SSR)

**Decisão: Client-Side Rendering (Vite SPA). Sem SSR/SSG.**

Justificativa: a spec trava React + Vite; o conceito SSR/Hydration não se aplica tecnicamente. O gap real é SEO de site de conteúdo público.

**Compensação (obrigatória):**
1. `react-helmet-async` — title, description, OG tags por rota (lista e post)
2. `sitemap.xml` estático gerado no build (ou script) com posts publicados
3. `robots.txt` permitindo crawl
4. Documentar no README: trocar por Next.js/SSR seria o caminho se SEO crítico evoluir

**Suspense boundaries:** usados para lazy routes (`<Suspense fallback=...>`) — equivalente client-side.

**Dados:** secrets nunca no bundle. Dados de interação = client após load (Server State).

### B3. Estado

| Tipo | Mecanismo |
|---|---|
| Server | TanStack Query. Keys: `['posts', {page,limit}]`, `['posts', slug]`, `['admin','posts', filters]`, `['me']` |
| URL | `useSearchParams` (react-router) — page, limit, status filter, magic-link token |
| Global | `AuthContext` — `{ user, isLoggedIn, setAuth, clearAuth }` |
| Local | `useState` |
| Forms | `useState` para login; admin editor `useState` (RHF se validação crescer) |

### B4. Design System contract

**Duas camadas de tokens (do ghost-studio `globals.css`):**
- Primitivos: cores raw (`#F5F2ED`, `#FF4D1C`, ...)
- Semânticos (`@theme inline`): `--color-light-bg`, `--color-accent`, `--color-surface-dark`, `--color-border-light`, `--color-text-on-light-muted`, ... → classes `bg-light-bg`, `text-accent`, etc.

**Regras:**
- Componentes referenciam **só tokens semânticos** (classes utilitárias do tema)
- **Proibido** hex/px arbitrários em componentes — usar tokens/escala
- Variant API restrita quando criar componentes genéricos (Button: variant/size)
- A11y no token/componente: contraste, focus ring visível, touch ≥44px

**Tipografia:**
- Body: DM Sans (`--font-dm-sans`)
- Headings: Inter (`--font-inter`) 700/900
- Logo/serif (futuro): Playfair Display
- Fontes via `@fontsource/*` expondo as mesmas CSS vars

**Prosa Markdown (mapeamento react-markdown `components`):**

| Elemento | Estilo (do BlogArticle ghost-studio) |
|---|---|
| `h2` | Inter font-black `text-2xl lg:text-3xl mt-12 mb-6` |
| `h3` | Inter font-bold `text-xl lg:text-2xl mt-10 mb-4` |
| `p` | `text-text-on-light text-base leading-relaxed mb-6` |
| `img` | `figure` rounded-xl + caption; full-bleed opcional |
| `blockquote` | callout `bg-surface-dark rounded-xl border-l-4 border-accent p-6 my-8` |
| `ul/ol` | listas reais (corrigir bug `•` em `<p>`) |
| `a` | `text-accent underline` + protocol allowlist |

### B5. Bundle architecture

| Decisão | Detalhe |
|---|---|
| Route splitting | `React.lazy` por rota: público vs admin |
| Heavy components | PostEditor (Markdown) = `import()` dinâmico |
| Vendor chunk | `manualChunks` separando react/query/router |
| Tree shaking | ESM puro em first-party; imports específicos (não barrels) |
| `sideEffects` | Declarar no package.json do web |
| Chunk-load failure | `ChunkErrorBoundary` detecta falha de chunk → 1 reload com guard anti-loop (sessionStorage) |

### B6. Accessibility architecture

| Componente | Abordagem |
|---|---|
| HTML semântico first | `<button>`, `<a>`, `<nav>`, `<article>`, `<main>`, headings hierárquicos |
| Modais (confirmação delete) | Radix UI `Dialog` (focus trap, Esc, restore) ou regras 6/6 |
| Formulários | Labels associados, `aria-invalid`, live region para erros |
| Feedback assíncrono | `role="status"` / `aria-live="polite"`; erros `role="alert"` |
| Focus indicator | Nunca `outline: none` sem substituto |
| Skip link | "Skip to content" no layout |
| Teclado | Todo fluxo operável por teclado (login, verify, admin) |

### B7. Observability (front-end)

| Item | Decisão |
|---|---|
| Error Boundaries | App-level + por rota |
| Handlers globais | `window.onerror`, `unhandledrejection` → report |
| Handlers/async | try/catch explícito com report (Sentry.captureException placeholder) |
| Context tags | release (git SHA/versão), route, device/browser |
| Web Vitals | LCP/CLS/INP via `web-vitals` lib, tagged |
| Source maps | Gerar em prod; upload privado (não servir) — config placeholder |
| Session replay | Fora de escopo nesta entrega (comentários PII é Fase 5) |
| Backend observability | Pino estruturado + correlation id (já na spec). Hardening = Fase 3 |

### B8. Cache / mutations (admin)

Estratégia padrão: **invalidate** (`queryClient.invalidateQueries`) no settle de mutações admin.

Não usar optimistic updates nesta entrega (sem urgência de UI instantânea em CRUD de posts).

Se adicionar like/counter futuramente: cancel → snapshot → write → reconcile/rollback (padrão completo do conceito).

Polling (Fase 6): `refetchInterval` em `['notifications']`; invalidação scoped (não blanket).

### B9. Strings centralizadas

`apps/web/src/shared/strings.ts` — objeto tipado com **todas** as strings de UI.
**Proibido texto literal em JSX.** (Regra do usuário.)

### B10. Cross-cutting rules

1. Services sem tipos Express
2. Error contract implementado no backend **antes** do frontend consumir
3. Budgets no repo antes de deploy
4. Security posture (A3) antes de renderizar Markdown
5. Tokens semânticos nos componentes
6. Touch ≥44px
7. `x-request-id` em toda response = id nos logs

---

## Parte C — Tasks (1 task = 1 commit)

Cada task carrega acceptance criteria do conceito correspondente. Dependências mapeadas.

| # | Task | Conceitos | Acceptance criteria (resumo) | Depende de |
|---|---|---|---|---|
| 0 | spec-original + spec-sdd | SDD | Arquivos existem e estão consistentes | — |
| 1.1 | Monorepo + docker-compose + configs | — | `pnpm install` ok; `docker compose up` sobe 3 serviços; Mailpit :8025 | 0 |
| 1.2 | Prisma schema + migration + seed | API Contracts | Schema User/Post; migration roda; seed cria admin + posts DRAFT/PUBLISHED | 1.1 |
| 1.3 | Shared kernel (config/logger/errors/prisma) | API Contracts, Observability | Env Zod fail-fast; Pino + x-request-id; error envelope; prisma client | 1.1 |
| 1.4 | Posts API + health | API Contracts, Security | 3 endpoints AC §6.5; drafts nunca vazam; validação 400; health check DB | 1.2, 1.3 |
| 1.5 | Web scaffold | Design System, Responsive, Bundle | Vite+Router+Query+Tailwind tokens+fonts+strings.ts; proxy /api; chunk boundaries | 1.1 |
| 1.6 | BlogList + BlogCard | Design System, Responsive, State, Cache | Lista da API; paginação URL; layout ghost-studio; mobile reflow; loading/error states | 1.4, 1.5 |
| 1.7 | BlogArticle | Security XSS, Design System | react-markdown sem raw HTML; prosa styles; not-found state; meta tags | 1.4, 1.5 |
| 1.8 | Testes Fase 1 | Testing | Service visibility tests; Supertest por endpoint; vitest-axe | 1.4, 1.6, 1.7 |
| 1.9 | README + quality-gate | — | Setup documentado; .env.example; baseline quality-gate | 1.1–1.8 |
| 2.1 | Auth schema (LoginToken, Session) | Security | Tokens só em hash no DB | 1.2 |
| 2.2 | EmailService interface + Nodemailer | — | Interface em shared; impl Mailpit; trocável em testes | 1.3 |
| 2.3 | Auth endpoints | Security, API Contracts | magic-link 202 uniforme; verify transaction; logout; me; rate limit 5/15min | 2.1, 2.2 |
| 2.4 | Middlewares auth + CSRF | Security | requireAuth, requireAdmin, CSRF double-submit, cookie config | 2.1 |
| 2.5 | Admin posts API | API Contracts, State | CRUD + publish/unpublish state machine 409; list all + filtro | 2.4, 1.4 |
| 2.6 | Web auth | A11y, Security | Login, inbox, Verify (Confirm button — sem prefetch), header, logout | 2.3 |
| 2.7 | Web admin (lazy) | Bundle, Design System, A11y | Lista+editor Markdown+publish/delete; route lazy | 2.5, 2.6 |
| 2.8 | Testes Fase 2 | Testing, Security | Token lifecycle, authz matrix, state transitions, EmailService swap, rate limit | 2.3–2.5 |
| 2.9 | Observability mínima | Observability | Error boundaries, window handlers, context tags, web-vitals | 1.6+ |
| 2.10 | Perf/quality gates | Perf Budgets | size-limit, lighthouserc, quality-gate verde | 2.7, 2.9 |

**Paralelizáveis:** 1.5–1.7 (web) ∥ 1.2–1.4 (api) após 1.1; 2.2 ∥ 2.5 após 2.1/2.4.

---

## Parte D — Execute (tech lead verification)

Critérios de aceite completos espelham `spec-original.md` §6.5 e §7.5, mais:

### Frontend / SDD
- [ ] `pnpm test` verde
- [ ] `pnpm build` ok; initial JS ≤170KB gzip
- [ ] Lighthouse CI passa (LCP/CLS/INP)
- [ ] Teclado operável em Login, Verify, Admin
- [ ] Nenhum texto literal em JSX
- [ ] Markdown renderiza com prosa; HTML raw não executa
- [ ] Mobile: reflow, touch targets, sem overflow
- [ ] Error boundaries capturam; handlers reportam
- [ ] Meta/OG tags presentes por rota

### Gates transversais
- [ ] Error contract no backend antes do frontend
- [ ] Security posture documentada (A3) antes de Markdown
- [ ] Budgets no repo
- [ ] spec-original.md intacta

---

## Traceability — ajustes vs spec original

| Ajuste | Motivo |
|---|---|
| Estrutura SDD adicionada (Specify/Design/Tasks/Execute) | Padrão interno; spec externa só descrevia features |
| State classification por requisito | Gap SDD — faltava |
| CSR + compensação SEO documentados | Spec trava Vite SPA; conceito SSR não se aplica; gap SEO real |
| WCAG AA + regras a11y | Gap total na spec |
| Design tokens + contrato | Gap; reaproveitar ghost-studio |
| Observability front-end | Spec só tinha Pino backend |
| Testing pyramid + MSW + axe | Spec citava Vitest/Supertest sem estratégia |
| Security XSS/Markdown + CSRF | Spec tinha boas práticas auth mas não XSS/CSRF explícitos |
| Perf budgets + enforcement | Gap total |
| Responsive rules | Gap total |
| pnpm workspaces | Spec deixou em aberto ("agent's choice") |
| Strings centralizadas (strings.ts) | Pedido explícito do usuário |
| react-markdown (não blocks) | Spec define Markdown; blocos do ghost-studio viram styles |
| Fases 3–6 não implementadas | Spec proíbe até detalhamento |
| Visual marketing (Header/Footer/Hero) adiado | Escopo do usuário; melhoria futura |
