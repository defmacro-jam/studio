
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
  onDeleteItem,
  allowAddingItems = true,
  className,
  draggingItemId,
  onDragStartItem, // Receive drag start handler
  onDragEndItem,   // Receive drag end handler
  isDropTargetForActionGeneration = false, // Default to false
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

  // Simplified handleDragOver: Always prevent default and set visual indicator.
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow the drop event to fire
    e.dataTransfer.dropEffect = "move"; // Indicate that a move is possible
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
     // Check if the relatedTarget (where the cursor is going) is inside the current element
     if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
     }
  };

  // Centralized drop logic: Validate the drop here *after* it happens.
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Prevent default browser behavior (e.g., navigating)
    setIsDragOver(false); // Reset visual indicator
    const dataString = e.dataTransfer.getData('application/json');
    if (!dataString) {
        console.warn("No data transferred on drop.");
        return;
    }

    try {
        const { id: droppedItemId, originalCategory } = JSON.parse(dataString);

        if (!droppedItemId || !originalCategory) {
            console.warn("Drop failed: Missing item ID or original category.");
            return;
        }

        // Prevent dropping onto the same column
        if (originalCategory === category) {
             // console.log("Drop prevented: Same category.");
             return;
        }

        // Specific rule: Only 'discuss' can trigger action generation when dropped on 'action'
        if (category === 'action' && originalCategory !== 'discuss') {
            console.warn("Cannot move non-discussion items directly to Action Items.");
             // Optionally show a toast message here using a prop passed down from page.tsx if needed
            return; // Invalid drop into action column
        }

        // If all checks pass, call the move item handler (defined in page.tsx)
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
        onDrop={handleDrop} // Ensure onDrop is correctly bound
    >
      <CardHeader className="sticky top-0 bg-card z-10 border-b"> {/* Changed background to card */}
        <CardTitle className="text-lg font-semibold flex items-center">
            {title} <span className="ml-2 text-sm font-normal text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4 space-y-4 min-h-[150px]"> {/* Add min-height */}
        {items.map((item) => (
          <RetroItemCard
            key={item.id}
            item={item}
            currentUser={currentUser}
            onAddReply={onAddReply}
            onDeleteItem={onDeleteItem}
            onDragStartItem={onDragStartItem} // Pass down drag start handler
            onDragEndItem={onDragEndItem}     // Pass down drag end handler
            isDragging={draggingItemId === item.id} // Pass dragging state
          />
        ))}
        {items.length === 0 && !isDragOver && ( // Hide "No items yet" when dragging over
            <p className="text-sm text-muted-foreground text-center py-4">No items yet.</p>
        )}
         {isDragOver && ( // Placeholder when dragging over
              <div className="h-24 border-2 border-dashed border-primary/50 rounded-md flex items-center justify-center text-primary/80">
                 {category === 'action' ? 'Drop to generate Action Item' : 'Drop here to move'}
              </div>
         )}
      </CardContent>
      {allowAddingItems && (
        <form onSubmit={handleAddItemSubmit} className="p-4 border-t bg-card space-y-2"> {/* Changed background to card */}
          <Textarea
            placeholder={`Add to "${title}"...`}
            value={newItemContent}
            onChange={(e) => setNewItemContent(e.target.value)}
            className="min-h-[60px] bg-background" // Explicitly set textarea background
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

