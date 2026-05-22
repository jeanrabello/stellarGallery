# Stellar Gallery — Frontend

Aplicação web do Stellar Gallery em **Next.js 14** (App Router) com **Tailwind**, componentes inspirados em shadcn/ui, drag-and-drop com `@dnd-kit` e estado servidor com React Query.

> Este README cobre só o pacote `frontend/`. Para visão geral da stack e screenshots veja o [README raiz](../README.md).

## Stack

| Camada       | Tecnologia                                                                  |
| ------------ | --------------------------------------------------------------------------- |
| Framework    | [Next.js 14](https://nextjs.org/) (App Router, RSC)                         |
| UI           | Tailwind CSS + componentes shadcn-inspired (`src/components/ui`)            |
| Estado server| [TanStack React Query 5](https://tanstack.com/query/latest)                 |
| Drag & drop  | `@dnd-kit/core` + `@dnd-kit/sortable`                                       |
| Diálogos     | `@radix-ui/react-dialog` / `react-tabs` / `react-label`                     |
| Ícones       | `lucide-react`                                                              |
| Animações    | `tailwindcss-animate`                                                       |

## Como rodar

Forma recomendada: `docker compose up -d` na raiz (frontend em `http://localhost:3020`).

Para rodar **só o frontend localmente**:

```bash
cd frontend
npm install
npm run dev          # next dev -p 3000 -H 0.0.0.0
```

Por padrão o app espera a API em `http://localhost:3001/api`. Se sua API estiver em outra porta (no docker-compose default ela fica em `3010`), defina:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3010/api npm run dev
```

### Scripts

| Comando         | O que faz                       |
| --------------- | ------------------------------- |
| `npm run dev`   | Next dev server (port 3000)     |
| `npm run build` | Build de produção (`.next`)     |
| `npm start`     | Sobe build de produção          |
| `npm run lint`  | ESLint (config Next)            |

## Estrutura

```
frontend/
├── src/
│   ├── app/
│   │   ├── (app)/              # área autenticada — galeria, grupos, álbuns, shares
│   │   ├── login/              # email/senha + botão Google mock
│   │   ├── signup/             # nome + sobrenome + email/senha
│   │   ├── google-mock/        # popup que simula o consentimento do Google
│   │   ├── invites/            # aceitar convites por token
│   │   ├── share/              # consumir álbum público por share token
│   │   ├── layout.tsx          # providers globais
│   │   └── globals.css         # paleta pastel + tokens
│   ├── components/
│   │   ├── ui/                 # botões, inputs, dialog, tabs (shadcn-style)
│   │   ├── album-grid.tsx      # grid sortable com dnd-kit
│   │   ├── photo-uploader.tsx  # dropzone com previews + comentário por arquivo
│   │   ├── photo-lightbox.tsx  # lightbox/carrossel
│   │   ├── site-shell.tsx      # layout + navegação + star loader full-screen
│   │   ├── auth-provider.tsx   # contexto de autenticação (Bearer)
│   │   ├── providers.tsx       # React Query + outros
│   │   └── icons/              # ícones customizados (estrela, etc.)
│   └── lib/                    # client HTTP (Bearer token), utils
├── public/                     # assets estáticos
├── Dockerfile
├── next.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Fluxos principais

- **Auth**: signup com nome + sobrenome, login flexível (email **ou** username) e botão "Continuar com Google" que abre um popup mockado.
- **Galeria pessoal**: cria álbuns privados, reordena via drag-and-drop (`@dnd-kit/sortable`) e visualiza em grid pastel.
- **Grupos**: criação de grupos públicos/privados, entrada via `joinCode` ou convite com link mockado.
- **Upload**: dropzone moderno com preview por arquivo, comentário individual e upload multipart para a API.
- **Lightbox**: visualização em carrossel com navegação por teclado/touch, mobile-first.
- **Compartilhamento por token**: geração de URL pública por álbum + página `/share` que consome a API pública sem autenticação.

## Convenções

- App Router com Server Components onde dá; client components ficam marcados com `"use client"`.
- React Query como fonte de verdade para dados remotos; estado local apenas para UI.
- Paleta pastel definida via CSS variables em `globals.css` (lavender / blush / peach / mint / sky / butter).
- Componentes de UI sempre passam por `src/components/ui` para manter consistência (estilo shadcn).
