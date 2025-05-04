import type { RetroItem, User } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FormEvent } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RetroItemCardProps {
  item: RetroItem;
  currentUser: User;
  onAddReply: (itemId: string, replyContent: string) => void;
  onDeleteItem?: (itemId: string) => void; // Optional delete handler
}

export function RetroItemCard({ item, currentUser, onAddReply, onDeleteItem }: RetroItemCardProps) {
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

  const canDelete = onDeleteItem && item.author.id === currentUser.id;

  return (
    <Card className="mb-4 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDeleteItem(item.id)}>
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete item</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        <p className="text-sm">{item.content}</p>
      </CardContent>
      {!item.category && ( // Only show reply button if not a poll justification
        <CardFooter className="flex justify-end pt-0 pb-3">
          <Button variant="ghost" size="sm" onClick={() => setShowReplyInput(!showReplyInput)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Reply ({item.replies?.length ?? 0})
          </Button>
        </CardFooter>
      )}
      {showReplyInput && (
        <CardFooter className="flex flex-col items-start space-y-2 pt-0 pb-4">
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
       {/* Display replies directly below the parent if not showing input */}
       {!showReplyInput && item.replies && item.replies.length > 0 && (
        <CardFooter className="flex flex-col items-start space-y-2 pt-0 pb-4">
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
