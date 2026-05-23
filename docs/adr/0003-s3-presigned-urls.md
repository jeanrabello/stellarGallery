# ADR-0003 — Acesso a fotos via URLs assinadas (presigned GET)

- **Status**: Aceito
- **Data**: 2026-05-22
- **Contexto**: Preparação do deploy em produção. Antes desta mudança o
  bucket S3 tinha uma policy `s3:GetObject` pública (`Principal: *`) e
  a API persistia a URL crua (`http://.../stellar-gallery/<key>`) no
  Mongo e devolvia ela direto pro frontend. Qualquer um com a URL
  enxergava a foto — inclusive álbuns privados se a URL vazasse.

## Decisão

1. **Bucket fica privado.** Removemos a policy de leitura pública que
   era criada em `loaders/s3.ts` na inicialização. Em produção AWS, o
   acesso direto a qualquer objeto será `403 AccessDenied`.
2. **A API gera presigned GET URLs em todo response** que contém
   imagens (fotos, capas de álbum, capas de grupo). O frontend nunca
   recebe a `s3Key` crua — só uma URL assinada de curta validade.
3. **TTL configurável** via `S3_SIGNED_URL_TTL_SECONDS` (default 900s
   = 15min). Curto o bastante pra mitigar URLs vazadas; longo o
   bastante pra o usuário navegar entre rotas sem renovar.
4. **Mongo** passa a guardar **só `s3Key`** (e `coverS3Key` em grupos).
   O campo `url`/`coverUrl` virou `string?` (legado) — não é mais
   escrito nem lido.

## Implementação

### Helper único

`backend/src/loaders/s3.ts`:

- `signedObjectUrl(s3Key, ttl?)` retorna URL assinada usando
  `@aws-sdk/s3-request-presigner`.
- `signedObjectUrls(keys[])` paraleliza assinaturas em lote.
- Cache em memória por `(key, ttl)` reutiliza URLs ainda válidas (≥ 30s
  até expirar) — evita re-assinar a mesma foto 5x dentro do mesmo
  response.
- Em dev (LocalStack), reescrevemos o host da URL gerada pelo SDK
  (que sai com `localstack:4566` quando o SDK conversa pela rede
  Docker) para o host externo definido em `S3_PUBLIC_BASE_URL`
  (default `http://localhost:4566/...`), de modo que o browser
  consiga abrir.

### Onde a API agora chama o helper

- `GET /api/photos/album/:id` — `toDto` é async; assina cada foto.
- `POST /api/photos/upload` — retorna o DTO assinado já no PUT.
- `GET /api/albums/mine` e `GET /api/albums/group/:id` —
  `decorateCovers` busca o `s3Key` da capa (escolhida ou primeira
  foto ativa) e assina.
- `GET /api/groups` e `GET /api/groups/:id` — `toDto` async assina
  `coverS3Key`.
- `POST /api/groups/:id/cover` — após o PUT, devolve o grupo já com
  `coverUrl` assinado; persiste apenas `coverS3Key` (não a URL).
- `GET /api/public/albums/:id` (share token) — também assina cada
  foto. Isso fechou um vazamento: antes o consumidor terceiro recebia
  URL pública permanente.

### Mudanças nas collections

- `PhotoDoc.url` → opcional, marcado como legado.
- `GroupDoc.coverUrl` → opcional, marcado como legado.
- Nenhuma migração: documentos antigos continuam funcionando porque a
  API ignora esses campos e usa o `s3Key` que sempre existiu.

## Limitação conhecida — LocalStack

LocalStack Community **não respeita IAM / ACL de bucket de forma
estrita**: mesmo sem policy pública, um `GET` direto à URL crua
(`http://localhost:4566/stellar-gallery/<key>`) retorna o objeto.
Isso é um quirk do emulador.

Na AWS real, o `GetObject` sem assinatura **falha com 403**, então o
modelo de segurança só vale na produção. Em dev confiamos no fato de
que a API nunca devolve a URL crua, apenas a assinada — bloqueando o
acesso direto do frontend.

Para validar em produção:
```bash
# Suba o bucket sem policy pública (já é o default agora).
# Pegue uma s3Key qualquer.
KEY=albums/<id>/<arquivo>

# Acesso direto deve retornar 403 AccessDenied.
curl -i "https://stellar-gallery.s3.us-east-1.amazonaws.com/$KEY"

# A mesma key via API (signed) retorna 200.
curl -i "$(curl -s "$API/api/photos/album/<id>" -H "Authorization: Bearer $TOKEN" | jq -r '.[0].url')"
```

## Trade-offs

- **Latência adicional**: cada response com imagem precisa de um
  HMAC por foto. Custo é baixo (microssegundos cada) e cache
  diminui ainda mais. Aceitável para o volume esperado.
- **URL não-cacheável pelo CDN**: como a URL muda a cada 15min, o
  CDN não consegue compartilhar entre usuários distintos. Em um app
  com tráfego alto vale colocar um CloudFront com OAC (origin
  access control) servindo o S3 privado, e a API devolveria URLs do
  CloudFront em vez do bucket direto. Adiamos essa otimização até
  ter números reais.
- **Reload da página re-assina tudo**: como o TTL é curto e o cache
  é só in-memory do processo Node, reload obriga a re-assinar. Em
  ambientes com múltiplos workers isso multiplica os SignBlobs.
  Mitigação: subir o TTL ou compartilhar cache (Redis). Por ora 15min
  é confortável.

## Checklist de go-live (relacionado)

- [ ] Bucket de produção criado **privado** (block public access on,
      sem bucket policy de leitura).
- [ ] IAM da API permite `s3:PutObject`, `s3:GetObject`,
      `s3:DeleteObject` no `arn:aws:s3:::<bucket>/*` (GetObject
      necessário para o presigner funcionar).
- [ ] `S3_PUBLIC_BASE_URL` em prod fica vazio (ou `https://<bucket>.s3.<region>.amazonaws.com`).
- [ ] `S3_SIGNED_URL_TTL_SECONDS` definido (ou usa default 900).
