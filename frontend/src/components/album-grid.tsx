"use client";
import * as React from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { GripVertical, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlbumCard = {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string | null;
};

function SortableAlbumCard({ album }: { album: AlbumCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: album.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative",
        isDragging && "opacity-70 ring-2 ring-primary rounded-2xl z-10",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-muted-foreground shadow-sm opacity-0 group-hover:opacity-100 transition cursor-grab active:cursor-grabbing touch-none"
        aria-label="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Link href={`/albums/${album.id}`}>
        <Card className="overflow-hidden">
          <div className="aspect-[4/3] bg-gradient-to-br from-pastel-blush via-pastel-peach to-pastel-butter relative">
            {album.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={album.coverUrl}
                alt={album.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-white/90">
                <ImageIcon className="h-10 w-10" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 text-white">
              <div className="font-semibold text-sm sm:text-base truncate drop-shadow">
                {album.name}
              </div>
              {album.description && (
                <div className="text-[11px] sm:text-xs opacity-90 line-clamp-1 drop-shadow">
                  {album.description}
                </div>
              )}
            </div>
          </div>
        </Card>
      </Link>
    </div>
  );
}

export function SortableAlbumGrid({
  albums,
  onReorder,
}: {
  albums: AlbumCard[];
  onReorder: (orderedIds: string[]) => void;
}) {
  const [items, setItems] = React.useState(albums);
  React.useEffect(() => setItems(albums), [albums]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(items, oldIdx, newIdx);
    setItems(next);
    onReorder(next.map((i) => i.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((album) => (
            <SortableAlbumCard key={album.id} album={album} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
