
import type { RetroItem, User } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FormEvent, type DragEvent } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn, getGravatarUrl } from '@/lib/utils'; // Import Gravatar utility

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
   // Updated: Also allow replying to own 'discuss' and 'action' items.
   const allowReply = !(
     item.author.id === currentUser.id &&
     !item.isFromPoll &&
     (item.category === 'well' || item.category === 'improve')
   );

  // Allow the current user to drag their own items.
  const isDraggable = item.author.id === currentUser.id;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
     if (!isDraggable) {
       console.log("Drag prevented: Not owner or not draggable item type.");
       e.preventDefault();
       return;
     }
    e.dataTransfer.setData('text/plain', item.id); // Send item ID
    e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id, originalCategory: item.category })); // Send ID and original category
    e.dataTransfer.effectAllowed = "move";

    if (typeof onDragStartItem === 'function') {
      onDragStartItem(item.id); // Notify parent component
    } else {
      console.error("onDragStartItem is not a function in RetroItemCard");
    }
  };

   const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
      if (!isDraggable) return;

      if (typeof onDragEndItem === 'function') {
        onDragEndItem(); // Notify parent component
      } else {
         console.error("onDragEndItem is not a function in RetroItemCard");
      }
   };

   // Ensure avatar URLs are valid, fallback to Gravatar if needed
   const itemAuthorAvatarUrl = item.author.avatarUrl || getGravatarUrl(item.author.email, 80)!;
   const currentUserAvatarUrl = currentUser.avatarUrl || getGravatarUrl(currentUser.email, 80)!;


  return (
    <Card
       className={cn(
         "mb-4 shadow-sm",
         isDraggable && "cursor-grab",
         !isDraggable && "cursor-default",
         isDragging && "opacity-50 ring-2 ring-primary ring-offset-2"
       )}
       draggable={isDraggable}
       onDragStart={handleDragStart}
       onDragEnd={handleDragEnd}
       data-item-id={item.id}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <div className="flex items-center space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={itemAuthorAvatarUrl} alt={item.author.name} data-ai-hint="avatar profile picture" />
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
               {item.replies.map((reply) => {
                   const replyAuthorAvatarUrl = reply.author.avatarUrl || getGravatarUrl(reply.author.email, 60)!;
                   return (
                     <div key={reply.id} className="flex items-start space-x-2 text-xs">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={replyAuthorAvatarUrl} alt={reply.author.name} data-ai-hint="avatar profile picture" />
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
                   );
               })}
             </div>
           )}
          <form onSubmit={handleReplySubmit} className="w-full flex space-x-2 items-start pt-2">
            <Avatar className="h-8 w-8 mt-1">
              <AvatarImage src={currentUserAvatarUrl} alt={currentUser.name} data-ai-hint="avatar profile picture" />
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
                {item.replies.map((reply) => {
                    const replyAuthorAvatarUrl = reply.author.avatarUrl || getGravatarUrl(reply.author.email, 60)!;
                    return (
                        <div key={reply.id} className="flex items-start space-x-2 text-xs">
                            <Avatar className="h-6 w-6">
                                <AvatarImage src={replyAuthorAvatarUrl} alt={reply.author.name} data-ai-hint="avatar profile picture" />
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
                    );
                })}
            </div>
        </CardFooter>
       )}
    </Card>
  );
}
