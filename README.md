# Stellar Gallery

Galeria online com álbuns privados e compartilhados em grupos, tons pastéis, drag-and-drop e compartilhamento de álbuns via token para integrações externas.

- **Backend**: Fastify 5 + TypeScript + MongoDB + AWS SDK S3 v3 (LocalStack para dev).
- **Frontend**: Next.js 14 (App Router) + Tailwind + componentes shadcn-inspired + dnd-kit + React Query.
- **Storage**: LocalStack S3 com bucket público (`stellar-gallery`) criado on-boot/lazy.
- **Auth**: JWT (Bearer) com signup/login email+senha e login Google mockado.

## Subindo o ambiente local

Pré-requisitos: Docker + Docker Compose.

```bash
cp backend/.env.example backend/.env
docker compose up -d
```

- Frontend: http://localhost:3020
- Backend: http://localhost:3010/api (Swagger: http://localhost:3010/api/docs)
- LocalStack S3: http://localhost:4566

> As portas padrão (3000/3001/27017) foram **deslocadas** (3020/3010) para evitar colisão com outros serviços comuns. Para produção use o `docker-compose.prod.yml` e ajuste as portas a gosto.

## Subindo em produção

```bash
JWT_SECRET=... JWT_REFRESH_SECRET=... docker compose -f docker-compose.prod.yml up -d --build
```

## Critérios de aceite atendidos

- ✅ Cadastro/login com email+senha; login Google **mockado** (não precisa de credenciais reais).
- ✅ Criação de álbuns privados em "Minha galeria".
- ✅ Criação de grupos públicos/privados; convite por **email mockado** (link logado/retornado) ou **código** único de participação.
- ✅ Álbuns compartilhados dentro de grupos.
- ✅ Drag-and-drop com `@dnd-kit/sortable` reordenando álbuns (persistido em MongoDB).
- ✅ Upload de imagens (multipart) gravando em S3 (LocalStack); cada foto carrega o nome do uploader e comentário opcional.
- ✅ Compartilhamento de álbum privado por **share token**: gera URL pública `/api/public/albums/:albumId?token=…` (aceita também header `x-share-token`) para consumir as fotos em apps de terceiros.
- ✅ Paleta pastel (lavender/blush/peach/mint/sky/butter) em toda a UI.
- ✅ Dockerização para dev e prod (Mongo + LocalStack + Fastify + Next).

## Estrutura

```
.
├── backend/                 # Fastify API
│   ├── src/
│   │   ├── app.ts, server.ts
│   │   ├── config/          # api config + types
│   │   ├── loaders/         # mongo + s3 bootstrap
│   │   ├── modules/         # auth, users, groups, albums, photos, invites, share
│   │   ├── plugins/         # swagger, rate-limit
│   │   └── shared/          # middlewares, services, db collections
│   └── Dockerfile
├── frontend/                # Next.js app
│   ├── src/app/             # /(app), /login, /signup, /invites, /share
│   ├── src/components/      # ui (shadcn-style) + providers + album-grid (dnd-kit)
│   ├── src/lib/             # api client (Bearer token), utils
│   └── Dockerfile
├── docker-compose.yml       # dev stack
├── docker-compose.prod.yml  # prod stack
└── docs/adr/0001-…          # decisões de arquitetura e inferências
```

## API principais endpoints

| Método | Caminho                                | Auth          | Descrição                                       |
| ------ | -------------------------------------- | ------------- | ----------------------------------------------- |
| POST   | /api/auth/signup                       | -             | Cria usuário e devolve tokens                   |
| POST   | /api/auth/login                        | -             | Login email/senha                               |
| POST   | /api/auth/google                       | -             | Login Google (mock)                             |
| POST   | /api/auth/refresh                      | -             | Renova access token                             |
| GET    | /api/users/me                          | Bearer        | Usuário atual                                   |
| GET    | /api/groups                            | Bearer        | Grupos do usuário                               |
| POST   | /api/groups                            | Bearer        | Cria grupo                                      |
| POST   | /api/groups/join                       | Bearer        | Entra via joinCode                              |
| POST   | /api/groups/:id/leave                  | Bearer        | Sai do grupo                                    |
| GET    | /api/albums/mine                       | Bearer        | Álbuns privados                                 |
| GET    | /api/albums/group/:groupId             | Bearer        | Álbuns do grupo                                 |
| POST   | /api/albums                            | Bearer        | Cria álbum (user/group)                         |
| POST   | /api/albums/reorder                    | Bearer        | Reordena (envia orderedIds)                     |
| GET    | /api/photos/album/:albumId             | Bearer        | Lista fotos do álbum                            |
| POST   | /api/photos/upload                     | Bearer (mp)   | Upload (campos: albumId, comment, file)         |
| DELETE | /api/photos/:id                        | Bearer        | Remove foto (autor ou owner do álbum)           |
| POST   | /api/invites/send                      | Bearer        | Cria convite (email + link mockados)            |
| GET    | /api/invites/mine                      | Bearer        | Convites recebidos                              |
| POST   | /api/invites/accept                    | Bearer        | Aceita convite pelo token                       |
| GET    | /api/share-tokens                      | Bearer        | Meus tokens emitidos                            |
| POST   | /api/share-tokens                      | Bearer        | Gera token para álbum privado                   |
| DELETE | /api/share-tokens/:id                  | Bearer        | Revoga token                                    |
| GET    | /api/public/albums/:albumId            | share token   | Acesso público ao álbum por token (query/header) |

## Compartilhando um álbum com aplicação terceira

1. Faça login no Stellar Gallery e suba fotos em um álbum privado.
2. Em **Compartilhar via token** (na página do álbum) gere uma credencial. Você recebe `token` e `url`.
3. Use em qualquer cliente HTTP, por exemplo:

```bash
curl "http://localhost:3010/api/public/albums/<ALBUM_ID>?token=<TOKEN>"
# ou
curl -H "x-share-token: <TOKEN>" http://localhost:3010/api/public/albums/<ALBUM_ID>
```

A resposta inclui os metadados do álbum + array `photos` com `url` para cada imagem (servida pelo LocalStack). Tokens podem ser revogados a qualquer momento na página *Compartilhamentos*.

## Decisões e inferências

Veja `docs/adr/0001-architecture-and-inferences.md` para o registro completo (incluindo mocks de Google OAuth e envio de email, simplificações do template original, etc).
