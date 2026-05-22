# ADR-0002 — Envio de emails (Resend) e login com Google (GIS)

- **Status**: Aceito
- **Data**: 2026-05-22
- **Contexto**: Preparação do lançamento inicial (MongoDB Atlas + S3 AWS + Vercel/Render).

## Resumo das decisões

1. **Email transacional**: usaremos **Resend** como provedor, encapsulado por
   um `EmailService` extensível.
2. **Login Google**: usaremos **Google Identity Services (GIS)** no
   frontend e validação do `id_token` no backend via `google-auth-library`.
3. Ambas as integrações têm **fallback de dev/mock**, ativado quando as
   variáveis de produção estão vazias — assim a aplicação continua rodando
   localmente e em CI sem credenciais reais.

## Por que Resend

- Free tier de 3k emails/mês, sem cartão.
- API HTTP simples (sem SDK, usamos `fetch` direto — zero novas deps).
- Permite começar com o sandbox `onboarding@resend.dev` (entrega só pra
  caixas verificadas da conta) enquanto um domínio próprio não existe.
- Migração futura para SES/SendGrid é trivial: basta adicionar outra
  implementação de `EmailService`.

## Por que GIS OAuth2 token client (popup) e não code flow nem One Tap

- Não precisamos de tokens longos do Google (não acessamos Drive,
  Calendar, etc.) — só queremos autenticar.
- O **OAuth2 token client** (`google.accounts.oauth2.initTokenClient`)
  abre o popup clássico com seletor de conta (todas as contas logadas
  no navegador + "use outra conta"). Funciona mesmo se o usuário ainda
  não está logado no Google — ele faz login dentro do popup.
- Recebemos um `access_token` curto que o backend troca por perfil via
  `https://www.googleapis.com/oauth2/v3/userinfo`. Não precisa armazenar
  refresh tokens nem callback URL pública.
- Descartamos o **One Tap** (`google.accounts.id.prompt()`) porque ele
  só aparece quando o usuário já tem sessão Google ativa — em sessões
  novas o prompt falha silenciosamente.
- Descartamos o **Authorization Code flow** porque exigiria endpoint
  `/callback` e o `GOOGLE_CLIENT_SECRET` server-side, sem ganho.

## Arquitetura

### Email

```
backend/src/shared/services/email/
├── types.ts        # EmailKind, EmailMessage, EmailService
├── templates.ts    # subject/text/html por kind
├── resend.ts       # ResendEmailService (HTTP)
├── mock.ts         # MockEmailService (console.log)
└── index.ts        # getEmailService(): escolhe pelo env
```

`getEmailService()` retorna **Resend** quando `EMAIL_ENABLED=true` **e**
`RESEND_API_KEY` está setada; senão devolve o mock. Cada chamada de envio
devolve `{ sent: boolean, providerMessageId? }` — o consumidor decide se
ainda quer expor link no fallback.

Para introduzir um novo tipo de email (welcome, reset, etc.):
1. Adicionar entrada em `EmailKind` e o payload correspondente em `types.ts`.
2. Adicionar `case` em `renderEmail()` no `templates.ts`.
3. Chamar `getEmailService().send({ kind, payload })` na rota.

### Google OAuth

- **Backend (`/api/auth/google`)**:
  - Se `body.accessToken` (caminho preferido — popup token client):
    chama `https://www.googleapis.com/oauth2/v3/userinfo` com o token
    no header `Authorization: Bearer …` e usa o JSON retornado
    (`email`, `name`, `given_name`, `family_name`, `sub`, `picture`).
  - Senão, se `body.idToken` **e** `GOOGLE_CLIENT_ID` está setado:
    `oauthClient.verifyIdToken({ idToken, audience })` (caminho legado /
    One Tap). Em falha → 401.
  - Senão, se `GOOGLE_MOCK_ENABLED=true`: decodifica payload do JWT sem
    verificar assinatura (só dev), ou usa um user demo.
  - Sem nenhum dos dois → 400 "Google sign-in is not configured".
  - Em qualquer caso, usuário inexistente é **criado** automaticamente;
    se já existir (por email) só faz login.
- **Frontend (`/login`)**:
  - Se `NEXT_PUBLIC_GOOGLE_CLIENT_ID` está setado: carrega
    `https://accounts.google.com/gsi/client`, chama
    `google.accounts.oauth2.initTokenClient({ scope: "openid email profile",
    prompt: "select_account" })` e dispara `requestAccessToken()`. O popup
    classico abre, usuário escolhe conta (ou faz login de outra), o
    `access_token` retornado vai pro backend.
  - Senão: abre `/google-mock` (popup demo).

## Variáveis de ambiente

### Backend (`backend/.env`)

| Variável               | Para que serve                                            | Default      |
| ---------------------- | --------------------------------------------------------- | ------------ |
| `EMAIL_ENABLED`        | Liga o envio (com `RESEND_API_KEY` setada)                | `true`       |
| `RESEND_API_KEY`       | Chave da conta Resend                                     | `""` (mock)  |
| `EMAIL_FROM`           | Endereço remetente (precisa estar verificado no Resend)   | `Stellar Gallery <onboarding@resend.dev>` |
| `GOOGLE_CLIENT_ID`     | Client ID do OAuth Web do projeto no Google Cloud         | `""` (mock)  |
| `GOOGLE_MOCK_ENABLED`  | Permite popup mock quando `GOOGLE_CLIENT_ID` está vazio   | `true`       |
| `FRONTEND_URL`         | Base usada nos links dos emails (`invite/accept?token=…`) | `http://localhost:3000` |

### Frontend (`frontend/.env`)

| Variável                         | Para que serve                                     |
| -------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`            | URL pública da API                                 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`   | Client ID GIS — vazio = popup mock                 |

## Passo a passo — Google OAuth

1. **Google Cloud Console** → criar/abrir um projeto.
2. **APIs & Services → OAuth consent screen**:
   - Tipo: **External** (necessário pra qualquer email Google).
   - App name, support email, dev contact.
   - Em **Scopes**, deixar default (Google já inclui `openid email profile`).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins** (apenas scheme + host + porta,
     **sem path nem barra no final** — o Google rejeita se você incluir):
     - `http://localhost:3020` (dev)
     - `https://<seu-dominio-vercel>` (prod)
     - adicione também o domínio próprio aqui quando tiver
   - **Authorized redirect URIs**: deixe **vazio**. GIS popup entrega o
     `id_token` direto no callback JavaScript via `postMessage` — não há
     redirect HTTP envolvido, então nenhuma URL precisa ser registrada
     aqui. Só precisaria preencher se um dia migrássemos para o fluxo
     "Authorization Code" (server-side com `GOOGLE_CLIENT_SECRET`).
4. Copiar o **Client ID** e colar em:
   - `backend/.env` → `GOOGLE_CLIENT_ID=…`
   - `frontend/.env` → `NEXT_PUBLIC_GOOGLE_CLIENT_ID=…`
5. Reiniciar backend e frontend.
6. Testar: botão **"Entrar com Google"** deve abrir o seletor real do
   Google e logar com a conta escolhida.

> O `GOOGLE_CLIENT_SECRET` **não** é usado neste fluxo (GIS popup), pode
> ficar vazio. Ele só seria necessário se um dia adotarmos o
> Authorization Code flow (troca server-side de `code` por tokens).
> Se você gerar o secret no Console, **nunca** o exponha no frontend —
> ele só faz sentido como env do backend.

## Passo a passo — Resend

1. Criar conta em https://resend.com (login com Google ou email).
2. **API Keys → Create API Key** com permissão **Sending** → copiar a
   key (`re_…`).
3. Colar em `backend/.env`:
   ```
   RESEND_API_KEY=re_xxxxxxxx
   ```
4. Enquanto não tiver domínio próprio: mantenha
   `EMAIL_FROM=Stellar Gallery <onboarding@resend.dev>`. Restrição: o
   Resend só entrega para os emails verificados na sua conta (você
   verifica a sua caixa no signup).
5. Quando tiver um domínio:
   - **Domains → Add Domain → digitar o domínio**.
   - Configurar os registros DNS (TXT do SPF, CNAMEs do DKIM, TXT do DMARC)
     mostrados pelo Resend.
   - Aguardar verificação (poucos minutos a horas).
   - Trocar `EMAIL_FROM` para `algo@seudominio.com`.
6. Reiniciar o backend.

> **Modo dev**: se `RESEND_API_KEY` ficar vazia, todas as chamadas
> caem no `MockEmailService` (log no stdout) — útil pra testes locais sem
> consumir cota.

## Trade-offs assumidos

- **Sandbox `onboarding@resend.dev`**: aceitável pro lançamento porque o
  fluxo de convite já mostra o link no front (a pessoa pode copiar e
  enviar manualmente). Quando o domínio chegar, a única coisa que muda é
  `EMAIL_FROM`.
- **Fallback do `id_token` no backend (GOOGLE_MOCK_ENABLED + payload sem
  verificar assinatura)**: aceitável só em dev. Em produção
  `GOOGLE_MOCK_ENABLED` **deve** ser `false` (a verificação real só
  ocorre quando `GOOGLE_CLIENT_ID` existe; sem ela o fluxo falha por
  default).
- **Sem fila de envio**: enviamos sincronamente dentro do request HTTP.
  Aceitável no volume esperado. Se virar gargalo, mover para BullMQ/SQS
  é trivial — basta enfileirar `EmailMessage`.

## Checklist de go-live

- [ ] `RESEND_API_KEY` definido no provedor (Render/etc.).
- [ ] Domínio verificado no Resend e `EMAIL_FROM` apontando pra ele.
- [ ] `GOOGLE_CLIENT_ID` (backend) e `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
      (frontend) preenchidos com a mesma client ID.
- [ ] `GOOGLE_MOCK_ENABLED=false` em produção.
- [ ] OAuth consent screen do Google publicado (não fica em "Testing"
      restrito).
- [ ] Authorized JavaScript origins inclui o domínio público da Vercel.
- [ ] Testar fluxo end-to-end: convidar → email entregue; entrar com
      Google → usuário criado/logado.
