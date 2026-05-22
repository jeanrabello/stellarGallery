# ADR-0002 — Envio de emails (AWS SES) e login com Google (GIS)

- **Status**: Aceito (revisão de 2026-05-22)
- **Data**: 2026-05-22
- **Contexto**: Preparação do lançamento inicial (MongoDB Atlas + S3 AWS + Vercel/Render). Alinhamento de provedor de email com a stack AWS já usada para S3.

## Resumo das decisões

1. **Email transacional**: usaremos **AWS SES (SESv2)** como provedor,
   encapsulado por um `EmailService` extensível.
   *(Revisão deste ADR — versões anteriores avaliaram Resend; mudamos
   para SES para concentrar a infra em AWS, reaproveitar IAM, e poder
   subir o serviço localmente com LocalStack.)*
2. **Login Google**: usaremos **Google Identity Services (GIS)** no
   frontend e validação do `id_token` / `access_token` no backend.
3. Ambas as integrações têm **fallback de dev/mock**, ativado quando as
   variáveis de produção estão vazias — assim a aplicação continua rodando
   localmente e em CI sem credenciais reais.

## Por que AWS SES

- Mesma cloud onde S3 (imagens) já roda — uma só conta IAM, política e
  bilhete a fechar.
- **LocalStack** entrega SES "verdadeiro o suficiente" pra dev/CI: as
  chamadas usam o mesmo SDK (`@aws-sdk/client-sesv2`), a mensagem fica
  retida pelo emulador, dá pra inspecionar via `awslocal sesv2`.
- Em produção, basta apontar para a região AWS real e o SDK usa a chain
  padrão de credenciais (IAM role/instance profile, env vars, perfil
  local, etc.).
- Tarifa de produção fica em ~US$0,10 / mil emails — adequado para o
  perfil transacional do app.
- Para sair do sandbox (50 emails/dia + apenas destinos verificados)
  basta abrir um chamado AWS depois de verificar SPF/DKIM do domínio.

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
├── ses.ts          # SesEmailService (@aws-sdk/client-ses v1, compatível com LocalStack community)
├── mock.ts         # MockEmailService (console.log)
└── index.ts        # getEmailService(): escolhe pelo env
```

Mais um arquivo no `loaders/`:

```
backend/src/loaders/ses.ts   # garante a identity do EMAIL_FROM no LocalStack
```

`getEmailService()` retorna **SES** quando `EMAIL_ENABLED=true` **e**
`EMAIL_FROM` + `SES_REGION` estão setados; senão devolve o mock. Cada
chamada de envio devolve `{ sent: boolean, providerMessageId? }` — o
consumidor decide se ainda quer expor link no fallback.

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

| Variável                | Para que serve                                                                              | Default                                            |
| ----------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `EMAIL_ENABLED`         | Liga o envio. Quando `false`, o `MockEmailService` é usado.                                 | `true`                                             |
| `EMAIL_FROM`            | Endereço remetente. Em produção precisa ser uma identity verificada no SES.                 | `Stellar Gallery <no-reply@stellar-gallery.local>` |
| `SES_REGION`            | Região AWS. Aceita também `AWS_REGION` como fallback.                                       | `us-east-1`                                        |
| `SES_ENDPOINT`          | Endpoint customizado. Use para apontar pra LocalStack em dev; deixe vazio em produção AWS.  | `http://localstack:4566` (dev)                     |
| `SES_ACCESS_KEY_ID`     | Credencial estática. Em produção prefira **não setar** e usar IAM role / chain padrão.      | `test` (LocalStack)                                |
| `SES_SECRET_ACCESS_KEY` | Idem.                                                                                       | `test` (LocalStack)                                |
| `GOOGLE_CLIENT_ID`      | Client ID do OAuth Web do projeto no Google Cloud                                           | `""` (mock)                                        |
| `GOOGLE_MOCK_ENABLED`   | Permite popup mock quando `GOOGLE_CLIENT_ID` está vazio                                     | `true`                                             |
| `FRONTEND_URL`          | Base usada nos links dos emails (`invite/accept?token=…`)                                   | `http://localhost:3000`                            |

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

## Passo a passo — AWS SES

### Dev (LocalStack)

Nada a configurar. O `docker-compose.yml` já habilita o serviço `ses`
no LocalStack e o backend, no boot (`loaders/ses.ts`), cria a
identity do `EMAIL_FROM` automaticamente. Para inspecionar o que foi
enviado:

```bash
# Listar identities verificadas (deve aparecer o EMAIL_FROM)
docker compose exec localstack awslocal sesv2 list-email-identities

# Ler a "caixa de saída" do LocalStack (mensagens retidas pelo emulador)
curl http://localhost:4566/_aws/ses
```

Se mudar `EMAIL_FROM`, basta reiniciar o backend que o loader cria a
nova identity.

### Produção (AWS real)

1. **Console AWS → Amazon SES → Verified identities → Create identity**.
   - Opção A — **Domínio** (recomendado): adicionar o domínio, copiar os
     registros DNS (TXT do SPF + CNAMEs do DKIM) e cadastrar no provedor
     de DNS. Aguardar verificação.
   - Opção B — **Email único**: adicionar o `EMAIL_FROM`, confirmar o
     link enviado pela AWS para essa caixa.
2. **Sair do sandbox** (necessário para enviar para qualquer destino):
   Console → SES → **Account dashboard → Request production access**.
   Aprovação manual da AWS, normalmente em 24h.
3. **IAM** — criar role/usuário com a policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["ses:SendEmail", "ses:SendRawEmail"],
       "Resource": "*"
     }]
   }
   ```
4. Configurar envs no provedor (Render/EC2/Lambda):
   ```
   EMAIL_ENABLED=true
   EMAIL_FROM=Stellar Gallery <no-reply@seu-dominio.com>
   SES_REGION=us-east-1   # ou a região onde verificou
   SES_ENDPOINT=          # vazio — usa AWS real
   SES_ACCESS_KEY_ID=     # vazio se usar IAM role/profile
   SES_SECRET_ACCESS_KEY= # vazio idem
   ```
5. Reiniciar o backend.

> **Modo mock**: se `EMAIL_ENABLED=false` (ou `EMAIL_FROM`/`SES_REGION`
> vazios), as chamadas caem no `MockEmailService` (log no stdout) —
> útil pra CI/tests sem precisar de SES.

## Trade-offs assumidos

- **Sandbox SES**: começamos lá. Convites pra emails não verificados
  não saem enquanto não pedirmos liberação. Para o lançamento isso é
  aceitável porque o fluxo de convite já mostra o link no front (a
  pessoa pode copiar e enviar manualmente).
- **Identity automática só em dev (LocalStack)**: em prod a verificação
  é manual via DNS/email — o loader não cria identity quando
  `SES_ENDPOINT` está vazio.
- **Fallback do `id_token` no backend (GOOGLE_MOCK_ENABLED + payload sem
  verificar assinatura)**: aceitável só em dev. Em produção
  `GOOGLE_MOCK_ENABLED` **deve** ser `false` (a verificação real só
  ocorre quando `GOOGLE_CLIENT_ID` existe; sem ela o fluxo falha por
  default).
- **Sem fila de envio**: enviamos sincronamente dentro do request HTTP.
  Aceitável no volume esperado. Se virar gargalo, mover para BullMQ/SQS
  é trivial — basta enfileirar `EmailMessage`.

## Checklist de go-live

- [ ] Identity do `EMAIL_FROM` verificada no SES (preferencialmente o
      domínio inteiro com DKIM).
- [ ] Conta SES fora do sandbox (Production access).
- [ ] IAM com `ses:SendEmail` configurada (ou IAM role atrelada ao
      compute em produção).
- [ ] `EMAIL_ENABLED=true`, `EMAIL_FROM=...`, `SES_REGION=...` setados.
- [ ] `SES_ENDPOINT` **vazio** em produção (qualquer valor força um
      endpoint customizado — só para LocalStack/staging).
- [ ] `GOOGLE_CLIENT_ID` (backend) e `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
      (frontend) preenchidos com a mesma client ID.
- [ ] `GOOGLE_MOCK_ENABLED=false` em produção.
- [ ] OAuth consent screen do Google publicado (não fica em "Testing"
      restrito).
- [ ] Authorized JavaScript origins inclui o domínio público da Vercel.
- [ ] Testar fluxo end-to-end: convidar → email entregue; entrar com
      Google → usuário criado/logado.
