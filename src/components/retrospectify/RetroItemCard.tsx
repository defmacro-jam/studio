
import type { RetroItem, User } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FormEvent, type DragEvent } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface RetroItemCardProps {
  item: RetroItem;
  currentUser: User;
  onAddReply: (itemId: string, replyContent: string) => void;
  onDeleteItem?: (itemId: string) => void; // Optional delete handler
  onDragStartItem: (itemId: string) => void; // Callback for drag start - REQUIRED
  onDragEndItem: () => void; // Callback for drag end - REQUIRED
  isDragging?: boolean; // Optional prop to style when dragging
}

export function RetroItemCard({
    item,
    currentUser,
    onAddReply,
    onDeleteItem,
    onDragStartItem,
    onDragEndItem,
    isDragging
}: RetroItemCardProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  const handleReplySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (replyContent.trim()) {
      onAddReply(item.id, replyContent);
      setReplyContent('');
      setShowReplyInput(false);
    }
  };

  // User can delete their own items, except those generated from their non-editable poll response
  // (The page component handles the editability check before calling onDeleteItem)
  const canDelete = onDeleteItem && item.author.id === currentUser.id;

  // Allow replies on items UNLESS it's a manually added ('well' or 'improve') item belonging to the current user.
  const allowReply = !(item.author.id === currentUser.id && !item.isFromPoll && (item.category === 'well' || item.category === 'improve'));

  // Allow the current user to drag their own items.
  const isDraggable = item.author.id === currentUser.id;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
     if (!isDraggable) {
       e.preventDefault();
       return;
     }
    e.dataTransfer.setData('text/plain', item.id); // Send item ID
    e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id, originalCategory: item.category })); // Send ID and original category
    e.dataTransfer.effectAllowed = "move";
    // Ensure onDragStartItem is called only if it's a valid function
    if (typeof onDragStartItem === 'function') {
      onDragStartItem(item.id); // Notify parent component
    } else {
      console.error("onDragStartItem is not a function", onDragStartItem); // Add logging for debugging
    }
     // Optional: Add a class to visually indicate dragging
     // e.currentTarget.classList.add('opacity-50');
  };

   const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
      if (!isDraggable) return;
      // Ensure onDragEndItem is called only if it's a valid function
      if (typeof onDragEndItem === 'function') {
        onDragEndItem(); // Notify parent component
      } else {
        console.error("onDragEndItem is not a function", onDragEndItem); // Add logging for debugging
      }
      // Optional: Remove dragging class
     // e.currentTarget.classList.remove('opacity-50');
   };


  return (
    <Card
       className={cn(
         "mb-4 shadow-sm",
         isDraggable && "cursor-grab", // Add grab cursor for draggable items
         !isDraggable && "cursor-default", // Explicitly default cursor if not draggable
         isDragging && "opacity-50 ring-2 ring-primary ring-offset-2" // Style when being dragged
       )}
       draggable={isDraggable} // Only make draggable if allowed
       onDragStart={handleDragStart}
       onDragEnd={handleDragEnd}
       data-item-id={item.id} // Ensure item ID is available for page-level drag handlers if needed
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <div className="flex items-center space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={item.author.avatarUrl} alt={item.author.name} data-ai-hint="avatar profile picture" />
            <AvatarFallback>{item.author.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium leading-none">{item.author.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(item.timestamp, { addSuffix: true })}
            </p>
          </div>
        </div>
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDeleteItem && onDeleteItem(item.id)}>
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete item</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="pb-3 pt-0 px-4">
        <p className="text-sm">{item.content}</p>
         {item.isFromPoll && (
           <p className="text-xs text-muted-foreground/70 italic mt-1">(From sentiment poll)</p>
         )}
      </CardContent>
      {allowReply && ( // Only show reply button if allowed
        <CardFooter className="flex justify-end pt-0 pb-3 px-4">
          <Button variant="ghost" size="sm" onClick={() => setShowReplyInput(!showReplyInput)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Reply ({item.replies?.length ?? 0})
          </Button>
        </CardFooter>
      )}
      {showReplyInput && allowReply && ( // Only show reply input if allowed and toggled
        <CardFooter className="flex flex-col items-start space-y-2 pt-0 pb-4 px-4">
           {item.replies && item.replies.length > 0 && (
             <div className="w-full space-y-2 pl-6 border-l ml-4">
               {item.replies.map((reply) => (
                 <div key={reply.id} className="flex items-start space-x-2 text-xs">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={reply.author.avatarUrl} alt={reply.author.name} data-ai-hint="avatar profile picture" />
                        <AvatarFallback>{reply.author.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <span className="font-medium">{reply.author.name}: </span>
                        <span>{reply.content}</span>
                        <p className="text-muted-foreground text-[10px]">
                           {formatDistanceToNow(reply.timestamp, { addSuffix: true })}
                        </p>
                    </div>
                 </div>
               ))}
             </div>
           )}
          <form onSubmit={handleReplySubmit} className="w-full flex space-x-2 items-start pt-2">
            <Avatar className="h-8 w-8 mt-1">
              <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} data-ai-hint="avatar profile picture" />
              <AvatarFallback>{currentUser.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-grow space-y-1">
                <Textarea
                placeholder="Write a reply..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[40px] text-sm"
                />
                <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={!replyContent.trim()}>
                        Send Reply
                    </Button>
                </div>
            </div>

          </form>
        </CardFooter>
      )}
       {/* Display replies directly below the parent if not showing input AND replies are allowed */}
       {!showReplyInput && allowReply && item.replies && item.replies.length > 0 && (
        <CardFooter className="flex flex-col items-start space-y-2 pt-0 pb-4 px-4">
            <div className="w-full space-y-2 pl-6 border-l ml-4">
                {item.replies.map((reply) => (
                 <div key={reply.id} className="flex items-start space-x-2 text-xs">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={reply.author.avatarUrl} alt={reply.author.name} data-ai-hint="avatar profile picture" />
                        <AvatarFallback>{reply.author.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <span className="font-medium">{reply.author.name}: </span>
                        <span>{reply.content}</span>
                         <p className="text-muted-foreground text-[10px]">
                           {formatDistanceToNow(reply.timestamp, { addSuffix: true })}
                        </p>
                    </div>
                 </div>
                ))}
            </div>
        </CardFooter>
       )}
    </Card>
  );
}
