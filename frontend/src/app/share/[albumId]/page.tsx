"use client";
import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

type Photo = {
  id: string;
  url: string;
  uploaderName: string;
  comment?: string;
  createdAt: string;
};

type Album = {
  id: string;
  name: string;
  description?: string;
  owner: { id: string; username: string } | null;
};

export default function PublicSharePage() {
  const { albumId } = useParams<{ albumId: string }>();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [data, setData] = React.useState<{
    album: Album;
    photos: Photo[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) {
      setError("Token de compartilhamento obrigatório.");
      return;
    }
    const base =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    fetch(`${base}/public/albums/${albumId}?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message || r.statusText);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [albumId, token]);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <div className="font-semibold">Falha no acesso</div>
            <div className="text-sm text-muted-foreground mt-1">{error}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return <div className="p-6">Carregando…</div>;

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{data.album.name}</h1>
        {data.album.description && (
          <p className="text-sm text-muted-foreground">
            {data.album.description}
          </p>
        )}
        {data.album.owner && (
          <p className="text-xs text-muted-foreground mt-1">
            Compartilhado por <b>{data.album.owner.username}</b>
          </p>
        )}
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {data.photos.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <div className="aspect-square bg-pastel-mint/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.comment || "photo"}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3 text-xs">
              <div className="font-medium">{p.uploaderName}</div>
              {p.comment && (
                <div className="text-muted-foreground line-clamp-2">
                  {p.comment}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
