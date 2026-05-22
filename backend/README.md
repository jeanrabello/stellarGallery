# Stellar Gallery — Backend

API REST do Stellar Gallery construída em **Fastify 5** + **TypeScript**, com **MongoDB** para dados e **S3** (via LocalStack em dev) para armazenamento das imagens.

> Este README cobre só o pacote `backend/`. Para visão geral da stack e screenshots veja o [README raiz](../README.md).

## Stack

| Camada            | Tecnologia                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| HTTP / Server     | [Fastify 5](https://fastify.dev/)                                          |
| Validação         | [Zod](https://zod.dev/) + `fastify-type-provider-zod`                      |
| Autenticação      | JWT (`jsonwebtoken`) — access + refresh, Bearer no header `Authorization`  |
| Senhas            | `bcrypt`                                                                   |
| Banco             | MongoDB 6 (driver oficial `mongodb`)                                       |
| Storage           | AWS SDK v3 (`@aws-sdk/client-s3`), apontando para LocalStack em dev        |
| Uploads           | `@fastify/multipart`                                                       |
| Docs              | `@fastify/swagger` + `@fastify/swagger-ui` em `/api/docs`                  |
| Rate limit        | `@fastify/rate-limit`                                                      |
| CORS              | `@fastify/cors`                                                            |

Node **22.12.0** (ver `.nvmrc`).

## Como rodar

A maneira mais simples é subir tudo via Docker no diretório raiz (veja o README raiz). Para rodar **só a API localmente**:

```bash
cd backend
cp .env.example .env
npm install
npm run dev            # tsx watch ./src/server.ts
```

A API sobe em `http://localhost:3001/api` (porta `APP_PORT`). Swagger em `http://localhost:3001/api/docs`.

> ⚠️ Você precisa de **MongoDB** e **S3 (LocalStack)** alcançáveis nas URLs do `.env`. O jeito mais fácil é subir esses dois via `docker compose up -d mongodb localstack` na raiz e ajustar `MONGO_HOST` / `S3_ENDPOINT` para `localhost`.

### Scripts

| Comando         | O que faz                                |
| --------------- | ---------------------------------------- |
| `npm run dev`   | Watch mode com `tsx`                     |
| `npm run build` | Compila TS para `dist/` + resolve aliases |
| `npm start`     | Executa `dist/server.js`                 |

## Variáveis de ambiente

Veja `.env.example`. Resumo dos principais grupos:

- **App**: `NODE_ENV`, `APP_PORT`, `APP_HOST`, `BASE_URL`, `FRONTEND_URL`
- **Mongo**: `MONGO_URI`, `MONGO_DB_NAME` (root user/pass usados pelo container)
- **JWT**: `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`
- **S3 / LocalStack**: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE`
- **Google OAuth (mock)**: `GOOGLE_MOCK_ENABLED=true` deixa o endpoint `/api/auth/google` aceitar payload mockado sem credenciais reais.

## Estrutura

```
backend/
├── src/
│   ├── server.ts             # bootstrap (listen)
│   ├── app.ts                # cria Fastify app + plugins + rotas
│   ├── config/               # carregamento e tipagem do .env
│   ├── loaders/              # bootstrap de Mongo e S3 (bucket lazy)
│   ├── plugins/              # swagger, rate-limit, etc.
│   ├── modules/              # cada feature isolada
│   │   ├── auth/             # signup, login, refresh, google mock
│   │   ├── users/            # /me
│   │   ├── groups/           # grupos públicos/privados, joinCode
│   │   ├── albums/           # álbuns próprios e de grupo, reorder
│   │   ├── photos/           # upload (multipart) e listagem
│   │   ├── invites/          # convites com email mockado
│   │   └── share/            # share-tokens e endpoint público
│   └── shared/               # middlewares, services, collections
├── Dockerfile
└── tsconfig.json
```

## Endpoints

A lista completa está no README raiz e exposta no Swagger em `/api/docs`. Os destaques:

- **Auth pública**: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/google`, `POST /api/auth/refresh`
- **Bearer**: usuário, grupos, álbuns, fotos, convites, share tokens
- **Share token (sem login)**: `GET /api/public/albums/:albumId` — token via `?token=…` ou header `x-share-token`

## Storage (S3 + LocalStack)

- O bucket `stellar-gallery` é criado **lazy** no primeiro upload (ver `loaders/`), com policy pública de leitura para servir as imagens diretamente do LocalStack.
- Em produção, basta apontar `S3_ENDPOINT` / `S3_PUBLIC_BASE_URL` para AWS real (ou outro provedor S3-compatível).

## Decisões

O contexto completo está em [`docs/adr/0001-architecture-and-inferences.md`](../docs/adr/0001-architecture-and-inferences.md).
