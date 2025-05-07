
import type { RetroItem, User } from '@/lib/types';
import { RetroItemCard } from './RetroItemCard';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useState, type FormEvent, type DragEvent } from 'react';
import { PlusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Category = 'well' | 'improve' | 'discuss' | 'action';

interface RetroSectionProps {
  title: string;
  category: Category; // Explicitly pass the category
  items: RetroItem[];
  currentUser: User;
  onAddItem: (content: string) => Promise<void>; // Changed to expect a Promise
  onAddReply: (itemId: string, replyContent: string) => Promise<void>;
  onMoveItem: (itemId: string, targetCategory: Category) => Promise<void>;
  onEditItem?: (itemId: string, newContent: string) => Promise<void>;
  onDeleteItem?: (itemId: string) => Promise<void>;
  allowAddingItems?: boolean;
  className?: string;
  draggingItemId?: string | null; // ID of the item currently being dragged
  onDragStartItem: (itemId: string) => void; // Callback for drag start
  onDragEndItem: () => void; // Callback for drag end
  isDropTargetForActionGeneration?: boolean; // Optional flag for action item target styling
}

export function RetroSection({
  title,
  category,
  items,
  currentUser,
  onAddItem,
  onAddReply,
  onMoveItem,
  onEditItem,
  onDeleteItem,
  allowAddingItems = true,
  className,
  draggingItemId,
  onDragStartItem,
  onDragEndItem,
  isDropTargetForActionGeneration = false,
}: RetroSectionProps) {
  const [newItemContent, setNewItemContent] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const handleAddItemSubmit = async (e: FormEvent) => { // Made async
    e.preventDefault();
    if (newItemContent.trim()) {
      await onAddItem(newItemContent); // Await the call
      setNewItemContent('');
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
     if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
     }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => { // Made async
    e.preventDefault();
    setIsDragOver(false);
    const dataString = e.dataTransfer.getData('application/json');
    if (!dataString) {
        console.warn("No data transferred on drop.");
        return;
    }

    try {
        const { id: droppedItemId, originalCategory } = JSON.parse(dataString);

        if (!droppedItemId || !originalCategory) {
            console.warn("Drop failed: Missing item ID or original category from dataTransfer.");
            return;
        }
        
        if (originalCategory === category) {
            console.log("Item dropped onto its own category. No action taken by RetroSection.");
            return;
        }
        
        await onMoveItem(droppedItemId, category); // Await the call

    } catch (error) {
        console.error("Failed to parse dropped data or execute move in RetroSection:", error);
    }
  };


  return (
    <Card
       className={cn(
         "flex flex-col h-full shadow-md transition-colors duration-200",
         className,
         isDragOver && "border-primary border-dashed ring-2 ring-primary ring-offset-2 bg-primary/10"
       )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      <CardHeader className="sticky top-0 bg-card z-10 border-b">
        <CardTitle className="text-lg font-semibold flex items-center">
            {title} <span className="ml-2 text-sm font-normal text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4 space-y-4 min-h-[150px]">
        {items.map((item) => (
          <RetroItemCard
            key={item.id}
            item={item}
            currentUser={currentUser}
            onAddReply={onAddReply}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
            onDragStartItem={onDragStartItem}
            onDragEndItem={onDragEndItem}
            isDragging={draggingItemId === item.id}
          />
        ))}
        {items.length === 0 && !isDragOver && (
            <p className="text-sm text-muted-foreground text-center py-4">No items yet.</p>
        )}
         {isDragOver && (
              <div className="h-24 border-2 border-dashed border-primary/50 rounded-md flex items-center justify-center text-primary/80">
                 {category === 'action' && isDropTargetForActionGeneration ? 'Drop Discussion to Generate Action Item' : 'Drop here to move'}
              </div>
         )}
      </CardContent>
      {allowAddingItems && (
        <form onSubmit={handleAddItemSubmit} className="p-4 border-t bg-card space-y-2">
          <Textarea
            placeholder={`Add to "${title}"...`}
            value={newItemContent}
            onChange={(e) => setNewItemContent(e.target.value)}
            className="min-h-[60px] bg-background"
          />
          <div className="flex justify-end">
             <Button type="submit" disabled={!newItemContent.trim()}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Item
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
