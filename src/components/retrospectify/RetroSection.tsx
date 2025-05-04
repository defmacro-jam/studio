import type { RetroItem, User } from '@/lib/types';
import { RetroItemCard } from './RetroItemCard';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useState, type FormEvent } from 'react';
import { PlusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface RetroSectionProps {
  title: string;
  items: RetroItem[];
  currentUser: User;
  onAddItem: (content: string) => void;
  onAddReply: (itemId: string, replyContent: string) => void;
  onDeleteItem?: (itemId: string) => void; // Optional delete handler for non-poll sections
  allowAddingItems?: boolean; // Flag to control adding new items
  className?: string;
}

export function RetroSection({
  title,
  items,
  currentUser,
  onAddItem,
  onAddReply,
  onDeleteItem,
  allowAddingItems = true,
  className,
}: RetroSectionProps) {
  const [newItemContent, setNewItemContent] = useState('');

  const handleAddItemSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newItemContent.trim()) {
      onAddItem(newItemContent);
      setNewItemContent('');
    }
  };

  return (
    <Card className={cn("flex flex-col h-full shadow-md", className)}>
      <CardHeader className="sticky top-0 bg-background z-10 border-b">
        <CardTitle className="text-lg font-semibold flex items-center">
            {title} <span className="ml-2 text-sm font-normal text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4 space-y-4">
        {items.map((item) => (
          <RetroItemCard
            key={item.id}
            item={item}
            currentUser={currentUser}
            onAddReply={onAddReply}
            onDeleteItem={allowAddingItems ? onDeleteItem : undefined} // Only pass delete if adding is allowed
          />
        ))}
        {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No items yet.</p>
        )}
      </CardContent>
      {allowAddingItems && (
        <form onSubmit={handleAddItemSubmit} className="p-4 border-t space-y-2">
          <Textarea
            placeholder={`Add to "${title}"...`}
            value={newItemContent}
            onChange={(e) => setNewItemContent(e.target.value)}
            className="min-h-[60px]"
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
