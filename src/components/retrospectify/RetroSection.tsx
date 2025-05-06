
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
  onAddItem: (content: string) => void;
  onAddReply: (itemId: string, replyContent: string) => void;
  onMoveItem: (itemId: string, targetCategory: Category) => void; // Add move handler
  onEditItem?: (itemId: string, newContent: string) => void; // Add edit handler
  onDeleteItem?: (itemId: string) => void;
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
  onEditItem, // Receive edit handler
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

  const handleAddItemSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newItemContent.trim()) {
      onAddItem(newItemContent);
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

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const dataString = e.dataTransfer.getData('application/json');
    if (!dataString) {
        console.warn("No data transferred on drop.");
        return;
    }

    try {
        const { id: droppedItemId, originalCategory } = JSON.parse(dataString);
        const item = items.find(i => i.id === droppedItemId); // Get item details
        const isAdmin = currentUser.role === 'admin';
        const isAuthor = item?.author.id === currentUser.id;

        if (!droppedItemId || !originalCategory) {
            console.warn("Drop failed: Missing item ID or original category.");
            return;
        }

        // Allow drop if user is admin or is the author of the item
        if (!isAdmin && !isAuthor) {
            console.warn("Drop prevented: User is not admin or author.");
             // Optionally show a toast
            return;
        }

        if (originalCategory === category) {
             return;
        }

        if (category === 'action' && originalCategory !== 'discuss') {
            console.warn("Cannot move non-discussion items directly to Action Items.");
            return;
        }

        onMoveItem(droppedItemId, category);

    } catch (error) {
        console.error("Failed to parse dropped data or execute move:", error);
    }
  };


  return (
    <Card
       className={cn(
         "flex flex-col h-full shadow-md transition-colors duration-200",
         className,
         isDragOver && "border-primary border-dashed ring-2 ring-primary ring-offset-2 bg-primary/10" // Highlight on drag over
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
            onEditItem={onEditItem} // Pass edit handler
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
